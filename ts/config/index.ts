import {
   get, opt, parseTransport, parsePort, parseMetadataMode,
   parseResponseMode, parseAllowedHosts, parsePaginationPaths,
   parseWriteCapabilities, parseOperations, parseFhirVersion,
   parseValidateWrites, parseAuthMode,
} from "./parsers.ts"
import { parsePositiveInt, parseNonNegativeInt, parseAuditSinks, parseAuditHttpFormat, parseBundleCapabilities, parseLogLevel } from "./parsers-extra.ts"
import { parseKeys } from "./keys.ts"

const
   authMode = parseAuthMode(),
   { activeKey, retiredKeys } =
      authMode === "smart"
         ? parseKeys()
         : { activeKey: { kid: "", privateKey: "" }, retiredKeys: [] }

const requireBaseUrl = (base: string | undefined): string => {
   if (!base) throw new Error("Missing required env var: FHIR_BASE_URL (or set FHIR_SERVER_URL to point at the FHIR API root directly)")
   return base
}

/** Validated runtime configuration loaded from environment variables. */
export const config: Config = {
   fhirBaseUrl: (opt("FHIR_BASE_URL") ?? "").replace(/\/$/, "") || undefined,
   fhirVersion: parseFhirVersion(),
   get fhirServerUrl() {
      return opt("FHIR_SERVER_URL") ?? `${requireBaseUrl(this.fhirBaseUrl)}/api/FHIR/${this.fhirVersion}`
   },
   get fhirTokenEndpoint() {
      return opt("FHIR_TOKEN_URL") ?? `${requireBaseUrl(this.fhirBaseUrl)}/oauth2/token`
   },
   authMode,
   get authEnabled() {
      return this.authMode === "smart"
   },
   fhirClientId: authMode === "smart" ? get("FHIR_CLIENT_ID") : "",
   fhirActiveKey: activeKey,
   fhirRetiredKeys: retiredKeys,
   fhirJwksUrl: opt("FHIR_JWKS_URL"),
   port: parsePort(),
   bindHost: opt("BIND_HOST") ?? (process.argv.includes("--dev") ? "127.0.0.1" : "0.0.0.0"),
   allowedHosts: parseAllowedHosts(),
   transport: parseTransport(),
   logLevel: parseLogLevel(),
   metadataMode: parseMetadataMode(),
   fhirDefaultCount: parseNonNegativeInt("FHIR_DEFAULT_COUNT", 0),
   fhirMaxCount: parseNonNegativeInt("FHIR_MAX_COUNT", 0),
   fhirMaxResponseBytes: parsePositiveInt("FHIR_MAX_RESPONSE_BYTES", 262144),
   auditSinks: parseAuditSinks(),
   auditFile: opt("FHIR_AUDIT_FILE") ?? "./audit.jsonl",
   auditHttpUrl: opt("FHIR_AUDIT_HTTP_URL")?.trim() || undefined,
   auditHttpFormat: parseAuditHttpFormat(),
   auditHttpAuth: opt("FHIR_AUDIT_HTTP_AUTH")?.trim() || undefined,
   auditUserHeader: opt("FHIR_AUDIT_USER_HEADER")?.trim() || undefined,
   fhirRequestTimeoutMs: parsePositiveInt("FHIR_REQUEST_TIMEOUT_MS", 30000),
   paginationPaths: parsePaginationPaths(),
   responseMode: parseResponseMode(),
   fhirTerminologyBaseUrl: (opt("FHIR_TERMINOLOGY_BASE_URL")?.replace(/\/+$/, "") || undefined),
   fhirTerminologyTimeoutMs: parsePositiveInt("FHIR_TERMINOLOGY_TIMEOUT_MS", 15000),
   writeCapabilities: parseWriteCapabilities(),
   validateWrites: parseValidateWrites(),
   writeDryRun: opt("FHIR_WRITE_DRY_RUN")?.toLowerCase() === "true",
   operations: parseOperations(),
   prefetchMaxPages: parsePositiveInt("FHIR_PREFETCH_MAX_PAGES", 5),
   prefetchMaxEntries: parsePositiveInt("FHIR_PREFETCH_MAX_ENTRIES", 5000),
   prefetchMaxBytes: parsePositiveInt("FHIR_PREFETCH_MAX_BYTES", 2097152),
   prefetchTimeoutMs: parsePositiveInt("FHIR_PREFETCH_TIMEOUT_MS", 25000),
   bundleCapabilities: parseBundleCapabilities(),
   bundleWritesEnabled: opt("FHIR_BUNDLE_WRITES_ENABLED")?.toLowerCase() === "true",
   mcpJsonLimit: opt("MCP_JSON_LIMIT")?.trim() || "4mb",
}

if (config.fhirDefaultCount > 0 && config.fhirMaxCount > 0 && config.fhirDefaultCount > config.fhirMaxCount)
   throw new Error(
      `FHIR_DEFAULT_COUNT (${config.fhirDefaultCount}) must not exceed FHIR_MAX_COUNT (${config.fhirMaxCount})`,
   )

if (config.auditSinks.includes("http") && !config.auditHttpUrl)
   throw new Error(`FHIR_AUDIT_SINK includes "http" but FHIR_AUDIT_HTTP_URL is not set`)
