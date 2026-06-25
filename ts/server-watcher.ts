import { watch } from "node:fs"
import { log } from "./log.ts"
import { getConfigDir, reloadDefinitions, getRequestedScopes } from "./fhir/model/definitions.ts"
import { restartAuth } from "./fhir/auth/auth.ts"
import { reloadOperations } from "./fhir/model/operations.ts"

let restartingAuth = false

const watchFiles = new Set(["resources.json", "search-controls.json", "operations.json"])

/** Watches the config directory for definition/operation file changes and hot-reloads. */
export const startDefinitionsWatcher = (): void => {
   const watchDir = getConfigDir()

   let debounce: ReturnType<typeof setTimeout> | undefined
   watch(watchDir, (_eventType, filename) => {
      if (!filename || !watchFiles.has(filename)) return
      clearTimeout(debounce)
      debounce = setTimeout(async () => {
         if (filename === "operations.json") {
            reloadOperations() && log.info("📋 Reloaded operations.json")
            return
         }
         const
            prevScopes = getRequestedScopes().join(","),
            ok = reloadDefinitions()
         if (!ok) return
         log.info(`📋 Reloaded from ${filename}`)
         log.info("📋 Metadata cache may be stale — restart to re-validate against /metadata")
         if (getRequestedScopes().join(",") !== prevScopes) {
            if (restartingAuth)
               return void log.warn(
                  "📋 Auth restart already in progress — skipping",
               )
            restartingAuth = true
            try {
               log.info(
                  "📋 Scopes changed — restarting auth...",
               )
               await restartAuth()
               log.info("📋 Auth restarted with new scopes")
            } catch (err) {
               log.error(
                  "📋 Auth restart failed:",
                  err instanceof Error ? err.message : err,
               )
            } finally {
               restartingAuth = false
            }
         }
      }, 300)
   })
   log.info(`👀 Watching config/ for changes`)
}
