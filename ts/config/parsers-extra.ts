import { opt } from "./parsers.ts"

/** Parses a positive-integer env var, falls back to the given default if unset. */
export const parsePositiveInt = (key: string, fallback: number): number => {
   const
      raw = opt(key),
      val = raw
         ? /^\d+$/.test(raw) ? Number(raw) : NaN
         : fallback
   if (!Number.isFinite(val) || val < 1)
      throw new Error(`Invalid ${key}="${raw}" — must be a positive integer`)
   return val
}

/** Parses a non-negative-integer env var (0 allowed), falls back to the given default if unset. */
export const parseNonNegativeInt = (key: string, fallback: number): number => {
   const
      raw = opt(key),
      val = raw
         ? /^\d+$/.test(raw) ? Number(raw) : NaN
         : fallback
   if (!Number.isFinite(val) || val < 0)
      throw new Error(`Invalid ${key}="${raw}" — must be a non-negative integer`)
   return val
}

/** Parses LOG_LEVEL into a numeric severity (error=0, warn=1, info=2, debug=3), defaults to info. */
export const parseLogLevel = (): number => {
   const
      levels: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 },
      raw = (opt("LOG_LEVEL") ?? "info").trim().toLowerCase()
   if (!(raw in levels))
      throw new Error(`Invalid LOG_LEVEL="${raw}" — must be "error", "warn", "info", or "debug"`)
   return levels[raw as LogLevel]
}

/** Parses FHIR_AUDIT_SINK into a list of valid sink names, warns about and skips unknowns. */
export const parseAuditSinks = (): AuditSinkName[] => {
   const
      raw = opt("FHIR_AUDIT_SINK"),
      valid = new Set<AuditSinkName>(["console", "file", "http"]),
      names = raw?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) ?? [],
      good = names.filter((n): n is AuditSinkName => valid.has(n as AuditSinkName)),
      bad = names.filter((n) => !valid.has(n as AuditSinkName))
   bad.length && console.warn(`📋 Ignoring unknown audit sinks: ${bad.join(", ")}`)
   return good
}

/** Parses FHIR_AUDIT_HTTP_FORMAT into raw or fhir-auditevent, defaults to raw, throws on invalid. */
export const parseAuditHttpFormat = (): AuditHttpFormat => {
   const raw = (opt("FHIR_AUDIT_HTTP_FORMAT") ?? "raw").trim().toLowerCase()
   if (raw !== "raw" && raw !== "fhir-auditevent")
      throw new Error(`Invalid FHIR_AUDIT_HTTP_FORMAT="${raw}" — must be "raw" or "fhir-auditevent"`)
   return raw
}

/** Parses FHIR_BUNDLE_CAPABILITIES into a Set of allowed Bundle types, empty when unset or "none". */
export const parseBundleCapabilities = (): Set<BundleType> => {
   const
      valid = new Set<BundleType>(["batch", "transaction"]),
      raw = opt("FHIR_BUNDLE_CAPABILITIES")
   if (!raw || raw.trim().toLowerCase() === "none") return new Set()
   const types = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
   for (const t of types)
      if (!valid.has(t as BundleType))
         throw new Error(`Invalid FHIR_BUNDLE_CAPABILITIES value "${t}" — allowed: ${[...valid].join(", ")}`)
   return new Set(types as BundleType[])
}
