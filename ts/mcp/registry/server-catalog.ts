import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { McpServer } from "@modelcontextprotocol/server"
import type { RegisteredTool } from "@modelcontextprotocol/server"
import { registerAll } from "./resources.ts"
import { registerStaticCoreTools, registerSystemHistory } from "./core-tools.ts"
import { registerOperations, resolveEnabledOperations } from "./operations.ts"
import { registerBundle } from "./bundle.ts"
import { buildInstructions } from "./instructions.ts"

const findPkg = (dir: string): string => {
   const candidate = join(dir, "package.json")
   return existsSync(candidate) ? candidate : findPkg(dirname(dir))
}

/** The package version, read once from package.json found by walking up from this module (depth-independent). */
export const pkgVersion = (JSON.parse(
   readFileSync(findPkg(dirname(fileURLToPath(import.meta.url))), "utf8"),
) as { version: string }).version

const SERVER_INFO = { name: "fhirhydrant", version: pkgVersion }

/** Registers the metadata/scope-dependent tools on a server and returns their handles for later removal. */
export const registerDynamic = (server: McpServer): RegisteredTool[] => {
   resolveEnabledOperations() // resolve operation gates once before registering (also used by live stdio refresh)
   return [
      ...registerAll(server),
      ...registerSystemHistory(server),
      ...registerOperations(server),
      ...registerBundle(server),
   ]
}

/** Builds a fresh MCP server with static + dynamic tools and returns it alongside the dynamic handles. */
export const buildServer = (): ServerBuild => {
   resolveEnabledOperations() // resolve gates so instructions reflect the enabled operations before the server is created
   const
      instructions = buildInstructions() || undefined,
      server = new McpServer(SERVER_INFO, { instructions })
   registerStaticCoreTools(server)
   return { server, dynamicHandles: registerDynamic(server) }
}
