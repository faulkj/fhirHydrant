/** A caller's validated identity — subject and granted role values. Provider-agnostic. */
interface AuthzIdentity {
   /** Stable caller id for audit (e.g. JWT `sub`/`oid`). */
   subject: string | undefined
   /** Granted role values, still carrying the configured prefix (decideAuthz strips it). */
   roles: string[]
}

/**
 * A pluggable authorization provider. Maps a request's `Authorization` header to a
 * validated identity, or throws (mapped to HTTP 401). One provider is selected per
 * MCP_AUTHZ mode; the shared decision/gating pipeline is identical for all providers.
 */
interface AuthzProvider {
   /** Value for the `WWW-Authenticate` challenge when validation rejects the caller. */
   challenge: string
   /** Validates the caller and returns their identity, or throws on missing/invalid credentials. */
   validate: (authorization: string | undefined) => Promise<AuthzIdentity>
   /** Optional startup check — throws when the provider's own required config is missing. */
   validateConfig?: () => void
}

/**
 * The per-request authorization decision. `admin` skips all provider-side subtraction
 * (still bounded by SMART/metadata/config downstream). Otherwise `scope` is the
 * effective resource map (backend ∩ roles); an empty map here means deny-all.
 */
interface AuthzDecision {
   /** True when the caller holds the Admin role — no provider-side pruning applied. */
   admin: boolean
   /** Effective resource scope map (backend SMART ∩ granted roles). Empty = deny-all when not admin. */
   scope: Map<string, Set<ScopePermission>>
   /** Operation catalog keys the caller may invoke; undefined when admin (all allowed). */
   operations: Set<string> | undefined
   /** Whether the caller may use the bundle tool. */
   bundle: boolean
   /** Whether the caller may use the system_history tool. */
   systemHistory: boolean
}

/**
 * Request-scoped MCP context carried via AsyncLocalStorage during an authz-enabled
 * request. Consumers read the effective scope / gates from here instead of the
 * process-global backend token. Absent (undefined store) means authz off.
 * `mutable` holds per-request registration state so concurrent per-user builds
 * never clobber each other's enabled/skipped operation lists.
 */
interface McpRequestContext {
   decision: AuthzDecision
   /** Validated caller subject (JWT `sub`/`oid`); binds cached chunks to the creating identity. */
   subject: string | undefined
   mutable: {
      enabledOps?: OperationDefinition[]
      skippedOps?: Array<{ key: string, reason: string, gate: "metadata" | "scope" }>
      skippedTools?: CapabilitySummary["skippedTools"]
   }
}

/** Builds a fresh McpServer for a single request (authz enabled) or once at startup (authz off). */
type ServerFactory = () => import("@modelcontextprotocol/server").McpServer
