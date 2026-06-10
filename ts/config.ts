const
   get = (key: string): string => {
      const val = process.env[key]
      if (!val) throw new Error(`Missing required env var: ${key}`)
      return val
   },
   opt = (key: string): string | undefined => process.env[key],
   parseTransport = (): "http" | "stdio" => {
      const val = (opt("MCP_TRANSPORT") ?? "http").toLowerCase()
      if (val !== "http" && val !== "stdio")
         throw new Error(
            `Invalid MCP_TRANSPORT="${val}" — must be "http" or "stdio"`,
         )
      return val as "http" | "stdio"
   },
   parsePort = (): number => {
      const
         raw = opt("PORT") ?? "5000",
         port = parseInt(raw, 10)
      if (!Number.isFinite(port) || port < 1 || port > 65535)
         throw new Error(`Invalid PORT="${raw}" — must be 1–65535`)
      return port
   },
   parseAllowedHosts = (): string[] | undefined =>
      opt("ALLOWED_HOSTS")
         ?.split(",")
         .map((s) => s.trim())
         .filter(Boolean) || undefined

/** Validated runtime configuration loaded from environment variables. */
export const config: Config = {
   fhirBaseUrl: get("FHIR_BASE_URL").replace(/\/$/, ""),
   get fhirServerUrl() {
      return opt("FHIR_SERVER_URL") ?? `${this.fhirBaseUrl}/api/FHIR/R4`
   },
   get fhirTokenEndpoint() {
      return opt("FHIR_TOKEN_URL") ?? `${this.fhirBaseUrl}/oauth2/token`
   },
   fhirClientId: get("FHIR_CLIENT_ID"),
   fhirPrivateKey: get("FHIR_PRIVATE_KEY"),
   fhirJwksUrl: opt("FHIR_JWKS_URL"),
   fhirKeyId: opt("FHIR_KEY_ID"),
   port: parsePort(),
   bindHost: opt("BIND_HOST") ?? "127.0.0.1",
   allowedHosts: parseAllowedHosts(),
   transport: parseTransport(),
   debug: opt("DEBUG")?.toLowerCase() === "true",
}
