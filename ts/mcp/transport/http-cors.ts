import { log } from "../../log.ts"

const
   corsAllowedOrigins = new Set([
      "https://chatgpt.com",
      "https://chat.openai.com",
   ]),
   corsAllowedHeaders = [
      "Content-Type",
      "Authorization",
      "Cache-Control",
      "Accept",
      "MCP-Protocol-Version",
      "Mcp-Session-Id",
      "mcp-session-id",
   ].join(", "),
   corsExposedHeaders = [
      "mcp-session-id",
      "x-session-id",
      "MCP-Session-Id",
   ].join(", ")

/** Applies CORS headers for the /mcp endpoint. */
export const applyMcpCors = (req: Req, res: Res) => {
   const origin = req.get("origin")
   if (origin && corsAllowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin)
      res.setHeader("Access-Control-Allow-Credentials", "true")
      res.vary("Origin")
   }
   res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS")
   res.setHeader("Access-Control-Allow-Headers", corsAllowedHeaders)
   res.setHeader("Access-Control-Expose-Headers", corsExposedHeaders)
}

/** Express middleware that logs details of failed (4xx+) requests. */
export const logFailedRequest = (req: Req, res: Res, next: Next) => {
   res.on("finish", () => {
      if (res.statusCode < 400)
         return
      log.warn(`🌐 Request failed status=${res.statusCode} method=${req.method} path=${req.originalUrl} host=${req.headers.host ?? "-"} origin=${req.get("origin") ?? "-"} contentType=${req.get("content-type") ?? "-"} contentLength=${req.get("content-length") ?? "0"}`)
   })
   next()
}
