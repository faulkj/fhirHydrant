import { randomUUID } from "node:crypto"
import { config } from "../../config/index.ts"
import { loadMessages } from "../../config/text.ts"
import { log } from "../../log.ts"
import { withAuditContext } from "../../audit.ts"
import { getTokenResponse } from "../../fhir/auth/auth.ts"
import { isMetadataAvailable } from "../../fhir/model/metadata.ts"
import { getRegisteredToolCount } from "../registry/resources.ts"
import { handleAuthzRequest } from "../authz/http.ts"
import { serveStatelessRequest, logMcpRequest } from "./serve-request.ts"
import { applyMcpCors, logFailedRequest } from "./http-cors.ts"

const messages = loadMessages("core")

/** Starts the Streamable HTTP MCP transport and returns a handle to attach a server and shut down the listener. */
export const startHttp = async (): Promise<TransportHandle> => {
   const
      { createMcpExpressApp } =
         await import("@modelcontextprotocol/express"),
      app = createMcpExpressApp({
         host: config.bindHost,
         jsonLimit: config.mcpJsonLimit,
         ...(config.allowedHosts ? { allowedHosts: config.allowedHosts } : {}),
      })

   log.debug(`🌐 HTTP bind host: ${config.bindHost}; allowed hosts: ${config.allowedHosts?.join(", ") ?? "not restricted"}`)

   app.use(logFailedRequest)

   let
      mcpReady = false,
      serverFactory: ServerFactory | undefined

   app.get("/health", (_req: Req, res: Res) => {
      const token = getTokenResponse()
      res.json({
         status: "ok",
         mcp: mcpReady,
         metadata: isMetadataAvailable(),
         ...(config.authzEnabled ? { authz: config.mcpAuthz } : { tools: getRegisteredToolCount() }),
         auth: token.access_token !== undefined,
         ...(token.expires_in !== undefined && { tokenExpiresIn: token.expires_in }),
      })
   })

   if (config.authEnabled && !config.fhirJwksUrl) {
      const { jwksHandler } = await import("../../fhir/auth/jwks.ts")
      app.get("/jwks", jwksHandler)
      log.log(`🔑 Serving JWKS at http://${config.bindHost === "127.0.0.1" ? "localhost" : config.bindHost}:${config.port}/jwks`)
   } else if (config.authEnabled)
      log.log("🔑 External JWKS URL configured — /jwks disabled")

   app.use("/mcp", (req: Req, res: Res, next: Next) => {
      applyMcpCors(req, res)
      if (req.method === "OPTIONS")
         return void res.status(204).end()
      next()
   })

   // GET opens a server→client notification stream — not supported in stateless mode
   app.get("/mcp", (_req: Req, res: Res) => res.status(405).json({ error: messages.streamsUnsupported }))

   app.post("/mcp", async (req: Req, res: Res) => {
      if (!mcpReady)
         return void res.status(503).json({ status: "starting" })
      logMcpRequest(req.body)
      const
         requestId = randomUUID(),
         user = config.auditUserHeader ? req.get(config.auditUserHeader)?.trim() || undefined : undefined
      if (!serverFactory) return void res.status(503).json({ status: "starting" })
      const factory = serverFactory
      await withAuditContext({ requestId, ...(user ? { user } : {}) }, () =>
         config.authzEnabled
            ? handleAuthzRequest(req.get("authorization"), req, res, req.body, factory)
            : serveStatelessRequest(factory, req, res, req.body))
   })

   app.use((err: Error, _req: Req, res: Res, _next: Next) => {
      log.error("🌐 Request error: ", err.message)
      res.status(400).json({
         jsonrpc: "2.0",
         error: { code: -32700, message: "Parse error" },
         id: null,
      })
   })

   const httpServer = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(config.port, config.bindHost, () => {
         const displayHost = config.bindHost === "127.0.0.1"
            ? "localhost"
            : config.bindHost
         log.log(`🔥 fhirhydrant listening on http://${displayHost}:${config.port}/mcp`)
         resolve(s)
      })
   })

   return {
      attach: async (factory) => {
         serverFactory = factory
         mcpReady = true
         config.authzEnabled
            ? log.log(`🔒 MCP authz: ${config.mcpAuthz} — per-request server builds, Authorization required on /mcp`)
            : factory() // warm-up build at startup: surfaces the registration summary and seeds /health count
      },
      // Rebuild once (outside ALS) to recompute global count/skipped state for /health + capabilities; next POST rebuilds anyway.
      refresh: () => void (!config.authzEnabled && serverFactory?.()),
      close: () =>
         new Promise<void>((resolve) => {
            httpServer.close(() => resolve())
            setTimeout(() => resolve(), 5000)
         }),
   }
}
