import { log } from "../../log.ts"

/** Logs one info line for tools/list (tool calls log their own 🔥 line), debug for other methods. Shared by both transports. */
export const logMcpRequest = (body: unknown): void => {
   const method = (body as { method?: string } | undefined)?.method
   method === "tools/list"
      ? log.info("🔧 tools/list")
      : method && method !== "tools/call" && log.debug(`🔌 ${method}`)
}

/** Builds a fresh server + stateless transport, connects, handles one POST, and awaits both closures. */
export const serveStatelessRequest = async (
   factory: ServerFactory, req: Req, res: Res, body: unknown,
): Promise<void> => {
   const
      { NodeStreamableHTTPServerTransport } = await import("@modelcontextprotocol/node"),
      transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
      { server } = factory()
   try {
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
   } finally {
      await Promise.all([transport.close(), server.close()])
   }
}
