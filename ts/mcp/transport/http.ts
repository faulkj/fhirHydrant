import { randomUUID } from "node:crypto"
import { config } from "../../config/index.ts"
import { log } from "../../log.ts"
import { withAuditContext } from "../../audit.ts"
import { jwksHandler } from "../../fhir/auth/jwks.ts"
import { getTokenResponse } from "../../fhir/auth/auth.ts"
import { isMetadataAvailable } from "../../fhir/model/metadata.ts"
import { getRegisteredToolCount } from "../resources.ts"
import { applyMcpCors, logFailedRequest } from "./http-cors.ts"

/** Starts the Streamable HTTP MCP transport and returns a handle to attach a server and shut down the listener. */
export const startHttp = async (): Promise<TransportHandle> => {
   const
      { createMcpExpressApp } =
         await import("@modelcontextprotocol/express"),
      { NodeStreamableHTTPServerTransport } =
         await import("@modelcontextprotocol/node"),
      app = createMcpExpressApp({
         host: config.bindHost,
         ...(config.allowedHosts ? { allowedHosts: config.allowedHosts } : {}),
      }),
      transport = new NodeStreamableHTTPServerTransport({
         sessionIdGenerator: undefined,
      })

   log.debug(`🌐 HTTP bind host: ${config.bindHost}; allowed hosts: ${config.allowedHosts?.join(", ") ?? "not restricted"}`)

   app.use(logFailedRequest)

   let
      mcpReady = false,
      connectedServer: import("@modelcontextprotocol/server").McpServer | undefined

   app.get("/health", (_req: Req, res: Res) => {
      const token = getTokenResponse()
      res.json({
         status: "ok",
         mcp: mcpReady,
         metadata: isMetadataAvailable(),
         tools: getRegisteredToolCount(),
         auth: token.access_token !== undefined,
         ...(token.expires_in !== undefined && { tokenExpiresIn: token.expires_in }),
      })
   })

   if (!config.fhirJwksUrl) {
      app.get("/jwks", jwksHandler)
      log.log(`🔑 Serving JWKS at http://${config.bindHost === "127.0.0.1" ? "localhost" : config.bindHost}:${config.port}/jwks`)
   } else
      log.log("🔑 External JWKS URL configured — /jwks disabled")

   app.use("/mcp", (req: Req, res: Res, next: Next) => {
      applyMcpCors(req, res)
      if (req.method === "OPTIONS")
         return void res.status(204).end()
      next()
   })

   // GET opens a server→client notification stream — not supported in stateless mode
   app.get("/mcp", (_req: Req, res: Res) => res.status(405).json({ error: "Server-initiated streams not supported in stateless mode" }))

   app.post("/mcp", async (req: Req, res: Res) => {
      if (!mcpReady)
         return void res.status(503).json({ status: "starting" })
      const
         body = req.body as Record<string, unknown> | undefined,
         method = body?.method as string | undefined
      method && method !== "tools/call" && log.debug(`🔌 ${method}`)
      const
         requestId = randomUUID(),
         user = config.auditUserHeader ? req.get(config.auditUserHeader)?.trim() || undefined : undefined
      await withAuditContext({ requestId, ...(user ? { user } : {}) }, () => transport.handleRequest(req, res, req.body))
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
         connectedServer = factory()
         await connectedServer.connect(transport)
         mcpReady = true
      },
      close: () =>
         new Promise<void>((resolve) => {
            void transport.close()
            void connectedServer?.close()
            httpServer.close(() => resolve())
            setTimeout(() => resolve(), 5000)
         }),
   }
}


