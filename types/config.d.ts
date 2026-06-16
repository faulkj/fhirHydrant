/** The four FHIR write interactions that can be enabled via FHIR_WRITE_CAPABILITIES. */
type WriteAction = "create" | "update" | "patch" | "delete"

/** All possible action values a resource tool can execute. */
type ToolAction = "search" | "read" | WriteAction

/** A private key and its derived kid (from PEM filename). */
interface KeyPair {
   /** Key identifier derived from the PEM filename: private-<kid>.pem → kid. */
   kid: string
   /** PEM file path as provided in FHIR_PRIVATE_KEY. */
   privateKey: string
}

/** Per-call response shape: compact (token-efficient) or full (raw FHIR JSON). */
type ResponseMode = "compact" | "full"

/** Server-wide response mode from FHIR_RESPONSE_MODE env var. */
type ConfigResponseMode = ResponseMode | "compact-locked" | undefined

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
   metadataMode: "strict" | "warn" | "off"
   fhirDefaultCount: number
   fhirMaxCount: number
   fhirMaxResponseBytes: number
   auditSinks: AuditSinkName[]
   auditFile: string
   auditUserHeader: string | undefined
   fhirRequestTimeoutMs: number
   paginationPaths: string[]
   responseMode: ConfigResponseMode
   fhirTerminologyBaseUrl?: string
   writeCapabilities: Set<WriteAction>
}
