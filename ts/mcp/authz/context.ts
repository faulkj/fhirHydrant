import { AsyncLocalStorage } from "node:async_hooks"
import { getTokenResponse } from "../../fhir/auth/auth.ts"
import { parseGrantedScopes } from "../../fhir/auth/scopes.ts"

const store = new AsyncLocalStorage<McpRequestContext>()

/** Runs `fn` within the per-request authz context (authz enabled). Consumers read the effective decision from it. */
export const withMcpContext = <T>(ctx: McpRequestContext, fn: () => T): T =>
   store.run(ctx, fn)

/** Returns the current request's authz decision, or undefined when authz is off (no store). */
export const getDecision = (): AuthzDecision | undefined =>
   store.getStore()?.decision

/** Returns the per-request mutable registration state when authz is on, else undefined (use module globals). */
export const getMutable = (): McpRequestContext["mutable"] | undefined =>
   store.getStore()?.mutable

/**
 * Returns the effective resource scope map for the current context. When authz is enabled
 * this is the per-request effective map (backend ∩ roles); otherwise it falls back to
 * the process-global backend SMART token — byte-for-byte today's behavior when off.
 * A non-admin scoped decision with no granted resources yields a deny-all map (a sentinel
 * entry that matches no resource) so downstream gates never treat it as permissive.
 */
export const getEffectiveScope = (): Map<string, Set<ScopePermission>> => {
   const decision = store.getStore()?.decision
   if (!decision) return parseGrantedScopes(getTokenResponse().scope)
   return !decision.admin && decision.scope.size === 0 ? DENY_ALL : decision.scope
}

/**
 * Returns a stable key identifying the current caller's authorization surface, used to
 * bind cached chunks to their creator. Empty string when authz is off (single global
 * caller — chunks are shared as before).
 */
export const getCallerKey = (): string => {
   const decision = store.getStore()?.decision
   if (!decision) return ""
   const scope = [...decision.scope].map(([r, p]) => `${r}.${[...p].sort().join("")}`).sort().join(",")
   return `${decision.admin ? "a" : ""}|${scope}|${[...(decision.operations ?? [])].sort().join(",")}|${decision.bundle ? "b" : ""}|${decision.systemHistory ? "h" : ""}`
}

const DENY_ALL: Map<string, Set<ScopePermission>> = new Map([["\u0000deny", new Set<ScopePermission>()]])
