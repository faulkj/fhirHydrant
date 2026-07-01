import { watch, existsSync } from "node:fs"
import { join } from "node:path"
import { log } from "./log.ts"
import { reloadDefinitions, getRequestedScopes } from "./fhir/model/definitions.ts"
import { configDirs } from "./fhir/model/config-paths.ts"
import { restartAuth } from "./fhir/auth/auth.ts"
import { reloadOperations } from "./fhir/model/operations.ts"

let
   restartingAuth = false,
   debounce: ReturnType<typeof setTimeout> | undefined

const watchFiles = new Set(["search-controls.json", "operations.json"])

/** Watches every config root (local override + packaged) and their resources/ subfolders for changes and hot-reloads. */
export const startDefinitionsWatcher = (): void => {
   for (const watchDir of configDirs()) {
      watch(watchDir, (_eventType, filename) => {
         if (!filename || !watchFiles.has(filename)) return
         if (filename === "operations.json")
            return void reload(() => reloadOperations() && log.info("📋 Reloaded operations.json"))
         reload(reloadDefinitions, filename)
      })
      const resources = join(watchDir, "resources")
      if (existsSync(resources))
         watch(resources, () => reload(reloadDefinitions, "resources/"))
   }

   log.info(`👀 Watching config/ for changes`)
}

const reload = (run: () => boolean | void, source?: string): void => {
   clearTimeout(debounce)
   debounce = setTimeout(async () => {
      if (!source) return void run()
      const
         prevScopes = getRequestedScopes().join(","),
         ok = run()
      if (!ok) return
      log.info(`📋 Reloaded from ${source}`)
      log.info("📋 Metadata cache may be stale — restart to re-validate against /metadata")
      if (getRequestedScopes().join(",") === prevScopes) return
      if (restartingAuth) return void log.warn("📋 Auth restart already in progress — skipping")
      restartingAuth = true
      try {
         log.info("📋 Scopes changed — restarting auth...")
         await restartAuth()
         log.info("📋 Auth restarted with new scopes")
      } catch (err) {
         log.error("📋 Auth restart failed:", err instanceof Error ? err.message : err)
      } finally {
         restartingAuth = false
      }
   }, 300)
}
