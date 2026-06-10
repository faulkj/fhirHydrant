// Global ambient type declarations for fhirHydrant (fhirhydrant).
// No imports needed — all types below are available project-wide.

/** Raw shape of a single entry in definitions.json. */
interface ResourceDefinitionRaw {
   resourceType: string
   toolName: string
   description: string
   supportsDirectRead: boolean
   searchParams?: Record<string, string>
   requireOneOf?: string[]
}

/** Describes a FHIR resource type and how it maps to an MCP tool. */
interface ResourceDefinition {
   resourceType: string
   toolName: string
   description: string
   supportsDirectRead: boolean
   requireOneOf?: string[]
   searchSchema: import("zod").ZodObject<import("zod").ZodRawShape>
}

/** Return shape of validateDefinitions. */
interface ValidationResult {
   entries: ResourceDefinitionRaw[]
   errors: string[]
}

/** Validated runtime configuration shape — see config.ts. */
interface Config {
   fhirBaseUrl: string
   readonly fhirServerUrl: string
   readonly fhirTokenEndpoint: string
   fhirClientId: string
   fhirPrivateKey: string
   fhirJwksUrl: string | undefined
   fhirKeyId: string | undefined
   port: number
   bindHost: string
   allowedHosts: string[] | undefined
   transport: "http" | "stdio"
   debug: boolean
}

/** Getter-backed token response compatible with fhirclient — access_token always reflects the latest issued token. */
type TokenResponse = {
   token_type: "bearer"
   readonly access_token: string | undefined
   readonly expires_in: number | undefined
}

/** Shape of the object returned by calling the fhirclient smart() function — exposes the static client factory. */
type SmartNamespace = {
   client: (
      state: object,
   ) => InstanceType<typeof import("fhirclient/lib/Client.js").default>
}

/** fhirclient instance type. */
type FhirClient = ReturnType<typeof import("fhirclient").client>

/** Express request/response/next convenience aliases for MCP HTTP handler typing. */
type Req = import("express").Request
type Res = import("express").Response
type Next = import("express").NextFunction

