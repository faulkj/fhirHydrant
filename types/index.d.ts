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

/** A private key and its derived kid (from PEM filename). */
interface KeyPair {
   /** Key identifier derived from the PEM filename: private-<kid>.pem → kid. */
   kid: string
   /** PEM file path as provided in FHIR_PRIVATE_KEY. */
   privateKey: string
}

/** Validated runtime configuration shape — see config.ts. */
interface Config {
   fhirBaseUrl: string
   readonly fhirServerUrl: string
   readonly fhirTokenEndpoint: string
   fhirClientId: string
   fhirKeys: KeyPair[]
   fhirActiveKey: string
   fhirJwksUrl: string | undefined
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

/** Express Request alias for MCP HTTP handler typing. */
type Req = import("express").Request
/** Express Response alias for MCP HTTP handler typing. */
type Res = import("express").Response
/** Express NextFunction alias for MCP HTTP handler typing. */
type Next = import("express").NextFunction
