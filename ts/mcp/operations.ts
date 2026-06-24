import type { McpServer } from "@modelcontextprotocol/server"
import { log } from "../log.ts"
import { getOperations } from "../fhir/model/operations.ts"
import { getTokenResponse } from "../fhir/auth/auth.ts"
import { parseGrantedScopes } from "../fhir/auth/scopes.ts"
import { filterOperationsByMetadata, filterOperationsByScopes, getSkippedOperations } from "./guards/operate.ts"
import { addOperate } from "./tools/operate.ts"

let enabledOps: OperationDefinition[] = []

/** Returns the currently enabled operation definitions (post-gating). */
export const getEnabledOperations = (): OperationDefinition[] => enabledOps

/** Returns skipped operations with reasons — for capabilities output. */
export { getSkippedOperations } from "./guards/operate.ts"

/** Registers the operate tool if at least one operation is enabled after gating. */
export const registerOperations = (server: McpServer): void => {
   const
      all = getOperations(),
      scopeMap = parseGrantedScopes(getTokenResponse().scope),
      afterMeta = filterOperationsByMetadata(all),
      afterScope = filterOperationsByScopes(afterMeta, scopeMap)

   enabledOps = afterScope

   if (enabledOps.length === 0) {
      log.info("📋 No FHIR operations enabled — operate tool not registered")
      return
   }

   log.info(`📋 Registering operate tool with ${enabledOps.length} operation(s): ${enabledOps.map((o) => o.key).join(", ")}`)
   addOperate(server, enabledOps)
}
