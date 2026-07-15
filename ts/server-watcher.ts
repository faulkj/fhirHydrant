import { watch, existsSync } from "node:fs"
import { join } from "node:path"
import { log } from "./log.ts"
import { parseDefinitions, definitionsSignature, committedDefinitionsSignature, commitDefinitions, getRequestedScopes } from "./fhir/model/definitions.ts"
import { parseOperations, operationsSignature, committedOperationsSignature, commitOperations } from "./fhir/model/operations.ts"
import { configDirs } from "./fhir/model/config-paths.ts"
import { replaceAuth } from "./fhir/auth/auth.ts"

let
   busy = false,
   debounce: ReturnType<typeof setTimeout> | undefined

const watchFiles = new Set(["search-controls.json", "operations.json"])

/** Watches every config root (local override + packaged) and their resources/ subfolders, hot-reloading via `refresh`. */
export const startDefinitionsWatcher = (refresh: () => void): void => {
   for (const watchDir of configDirs()) {
      watch(watchDir, (_eventType, filename) => {
         if (!filename || !watchFiles.has(filename)) return
         schedule(filename === "operations.json" ? () => reloadOps(refresh) : () => reloadDefs(refresh, filename))
      })
      const resources = join(watchDir, "resources")
      if (existsSync(resources))
         watch(resources, () => schedule(() => reloadDefs(refresh, "resources/")))
   }
   log.info(`👀 Watching config/ for changes`)
}

const
   schedule = (run: () => Promise<void>): void => {
      clearTimeout(debounce)
      debounce = setTimeout(() => {
         if (busy) return void log.warn("📋 Reload already in progress — skipping")
         busy = true
         void run().finally(() => { busy = false })
      }, 300)
   },

   reloadOps = async (refresh: () => void): Promise<void> => {
      let candidate
      try { candidate = parseOperations() }
      catch (err) { return void log.error("📋 operations.json reload failed — keeping current:", err instanceof Error ? err.message : err) }
      if (operationsSignature(candidate) === committedOperationsSignature())
         return void log.debug("📋 operations.json unchanged — no refresh")
      commitOperations(candidate)
      refresh()
      log.info("📋 Reloaded operations.json")
   },

   reloadDefs = async (refresh: () => void, source: string): Promise<void> => {
      let candidate
      try { candidate = parseDefinitions() }
      catch (err) { return void log.error(`📋 ${source} reload failed — keeping current:`, err instanceof Error ? err.message : err) }
      if (definitionsSignature(candidate) === committedDefinitionsSignature())
         return void log.debug(`📋 ${source} unchanged — no refresh`)
      const
         scopesChanged = candidate.scopes.join(",") !== getRequestedScopes().join(","),
         commit = (): void => { commitDefinitions(candidate); refresh() }
      scopesChanged
         ? await replaceAuth(candidate.scopes, commit)
         : commit()
      log.info(`📋 Reloaded from ${source}`)
   }

