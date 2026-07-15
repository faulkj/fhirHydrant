import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { log } from "../../log.ts"
import { registerDynamic } from "../registry/server-catalog.ts"
import { logMcpRequest } from "./serve-request.ts"

/** Starts the stdio MCP transport and returns a handle to attach a server, refresh dynamic tools, and close. */
export const startStdio = async (): Promise<TransportHandle> => {
   const transport = new StdioServerTransport()
   let
      build: ServerBuild | undefined,
      make: ServerFactory | undefined
   return {
      attach: async (factory) => {
         make = factory
         build = factory()
         await build.server.connect(transport)
         const inner = transport.onmessage?.bind(transport)
         transport.onmessage = (msg) => { logMcpRequest(msg); inner?.(msg) }
         log.log("🚒 fhirhydrant running in stdio mode")
      },
      // Preflight the whole next catalog on a throwaway server; only on success mutate the live registry.
      refresh: () => {
         if (!build || !make) return
         try { make() }
         catch (err) {
            log.error("📋 Registration refresh preflight failed — keeping current tools:", err instanceof Error ? err.message : err)
            return
         }
         for (const handle of build.dynamicHandles) handle.remove()
         build.dynamicHandles = registerDynamic(build.server)
         log.info("📋 Re-registered dynamic tools after change")
      },
      close: async () => {
         await build?.server.close()
         await transport.close()
      },
   }
}
