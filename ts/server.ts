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

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { McpServer } from "@modelcontextprotocol/server"
import { config } from "./config/index.ts"
import { log } from "./log.ts"
import { fhirVersionLabel } from "./fhir/transform/fhir-model.ts"
import { initAuditSinks } from "./audit.ts"
import { startAuth, stopAuth } from "./fhir/auth/auth.ts"
import { fetchMetadata } from "./fhir/model/metadata.ts"
import { registerAll } from "./mcp/resources.ts"
import { registerCoreTools } from "./mcp/core-tools.ts"
import { registerOperations, resolveEnabledOperations } from "./mcp/operations.ts"
import { registerBundle } from "./mcp/bundle.ts"
import { buildInstructions } from "./mcp/instructions.ts"
import { validateAuthzConfig } from "./mcp/authz/providers.ts"
import { startHttp } from "./mcp/transport/http.ts"
import { startStdio } from "./mcp/transport/stdio.ts"
import { startDefinitionsWatcher } from "./server-watcher.ts"

const
   { version: pkgVersion } = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
   ) as { version: string },
   SERVER_INFO = { name: "fhirhydrant", version: pkgVersion },

   explicitServerUrl = process.env["FHIR_SERVER_URL"],
   explicitTermUrl = config.fhirTerminologyBaseUrl,

   _ = (
      log.info(`📋 fhirhydrant v${pkgVersion}`),
      config.authEnabled
         ? (
            log.debug(`🔑 Active kid: ${config.fhirActiveKey.kid}`),
            config.fhirRetiredKeys.length && log.info(`🔑 JWKS: ${1 + config.fhirRetiredKeys.length} keys`)
         )
         : log.warn(`🔓 Auth mode: none — requests sent unauthenticated`),
      initAuditSinks({
         sinks: config.auditSinks,
         file: config.auditFile,
         httpUrl: config.auditHttpUrl,
         httpFormat: config.auditHttpFormat,
         httpAuth: config.auditHttpAuth,
      }),
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
      resolveEnabledOperations()
      const
         instructions = buildInstructions() || undefined,
         s = new McpServer(SERVER_INFO, { instructions })
      registerAll(s)
      registerCoreTools(s)
      registerOperations(s)
      registerBundle(s)
      return s
   }

await validateAuthzConfig()

const selfHostJwks = config.authEnabled && config.transport !== "stdio" && !config.fhirJwksUrl

if (config.authEnabled && !selfHostJwks) await startAuth()

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
