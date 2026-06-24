#!/usr/bin/env node

// Patch console methods to prepend ISO timestamps (dev mode only — Azure already timestamps)
if (process.argv.includes("--dev")) {
   for (const level of ["log", "info", "warn", "error"] as const) {
      const original = console[level].bind(console)
      console[level] = (...args: unknown[]) => original(new Date().toISOString().replace("T", " ").slice(0, 19), ...args)
   }
}

// stdio: redirect stdout logging to stderr before anything else runs
if ((process.env["MCP_TRANSPORT"] ?? "http").toLowerCase() === "stdio") {
   console.log = (...args: unknown[]) => console.error(...args)
   console.info = (...args: unknown[]) => console.error(...args)
}

import { readFileSync, watch } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { McpServer } from "@modelcontextprotocol/server"
import { config } from "./config.ts"
import { log } from "./log.ts"
import { fhirVersionLabel } from "./fhir/transform/fhir-model.ts"
import { initAuditSinks } from "./audit.ts"
import { startAuth, stopAuth, restartAuth } from "./fhir/auth/auth.ts"
import { getConfigDir, reloadDefinitions, getRequestedScopes } from "./fhir/model/definitions.ts"
import { fetchMetadata } from "./fhir/model/metadata.ts"
import { registerAll } from "./mcp/resources.ts"
import { registerCoreTools } from "./mcp/core-tools.ts"
import { registerOperations } from "./mcp/operations.ts"
import { registerBundle } from "./mcp/bundle.ts"
import { reloadOperations } from "./fhir/model/operations.ts"
import { startHttp } from "./mcp/transport/http.ts"
import { startStdio } from "./mcp/transport/stdio.ts"

const
   { version: pkgVersion } = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
   ) as { version: string },
   SERVER_INFO = { name: "fhirhydrant", version: pkgVersion },
   SERVER_INSTRUCTIONS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "config", "instructions.md"), "utf8").trim(),

   explicitServerUrl = process.env["FHIR_SERVER_URL"],
   explicitTermUrl = config.fhirTerminologyBaseUrl,

   _ = (
      log.info(`📋 fhirhydrant v${pkgVersion}`),
      log.debug(`🔑 Active kid: ${config.fhirActiveKey.kid}`),
      config.fhirRetiredKeys.length && log.info(`🔑 JWKS: ${1 + config.fhirRetiredKeys.length} keys`),
      initAuditSinks(config.auditSinks, config.auditFile),
      log.info(`📋 FHIR version: ${fhirVersionLabel}`),
      log.info(`📋 FHIR server: ${config.fhirServerUrl}`),
      log.info(`📋 Transport: ${config.transport}`),
      log.info(`📋 Metadata mode: ${config.metadataMode}`),
      config.auditUserHeader && log.info(`📋 User header: ${config.auditUserHeader}`),
      config.writeCapabilities.size > 0 && log.log(`⚠️  Write capabilities enabled: ${[...config.writeCapabilities].join(", ")}`),
      explicitServerUrl && /\/R[45]B?(?:[\/?#]|$)/i.test(explicitServerUrl)
         && !explicitServerUrl.toUpperCase().includes(`/${config.fhirVersion}`)
         && log.warn(`💡 FHIR_SERVER_URL contains a version segment that differs from FHIR_VERSION=${config.fhirVersion} — verify both are aligned`),
      explicitTermUrl && config.fhirVersion === "R5" && /\/r4(?:[\/?#]|$)/i.test(explicitTermUrl)
         && log.warn(`💡 FHIR_TERMINOLOGY_BASE_URL points to /r4 but FHIR_VERSION is R5 — consider using https://tx.fhir.org/r5`)
   ),
   makeServer = (): McpServer => {
      const s = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS })
      registerAll(s)
      registerCoreTools(s)
      registerOperations(s)
      registerBundle(s)
      return s
   }

let restartingAuth = false

const
   watchFiles = new Set(["resources.json", "search-controls.json", "operations.json"]),
   startDefinitionsWatcher = (): void => {
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

const selfHostJwks = config.transport !== "stdio" && !config.fhirJwksUrl

if (!selfHostJwks) await startAuth()

const { attach, close } =
   config.transport === "stdio"
      ? await startStdio()
      : await startHttp()

if (selfHostJwks) await startAuth()

if (config.metadataMode !== "off") await fetchMetadata()

await attach(makeServer)

process.env["NODE_ENV"] !== "production" && startDefinitionsWatcher()

let shutdownInProgress = false

const shutdown = async (code = 0): Promise<void> => {
   if (shutdownInProgress) return
   shutdownInProgress = true
   log.log("🛑 Shutting down...")
   stopAuth()
   await close()
   process.exit(code)
}

process.on("SIGINT", () => void shutdown(0))
process.on("SIGTERM", () => void shutdown(0))
