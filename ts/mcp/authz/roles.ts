import { config } from "../../config/index.ts"
import { getTokenResponse } from "../../fhir/auth/auth.ts"
import { parseGrantedScopes } from "../../fhir/auth/scopes.ts"

const
   READ_PERMS: ScopePermission[] = ["r", "s"],
   WRITE_PERMS: ScopePermission[] = ["r", "s", "c", "u", "d"],

   intersect = (
      roles: Map<string, Set<ScopePermission>>, backend: Map<string, Set<ScopePermission>>,
   ): Map<string, Set<ScopePermission>> => {
      const
         wildcard = backend.get("*"),
         allow = (resource: string, perm: ScopePermission): boolean =>
            backend.size === 0 || !!backend.get(resource)?.has(perm) || !!wildcard?.has(perm),
         out = new Map<string, Set<ScopePermission>>()
      for (const [resource, perms] of roles) {
         const kept = new Set<ScopePermission>([...perms].filter((p) => allow(resource, p)))
         kept.size && out.set(resource, kept)
      }
      return out
   }

/**
 * Translates a caller's granted role values into a per-request authorization decision.
 * Resource roles become an effective scope map (backend SMART ∩ roles) so authz can only
 * subtract; Admin skips subtraction. Operation/bundle roles gate those tools separately.
 * Provider-agnostic — takes plain role strings regardless of their origin.
 */
export const decideAuthz = (roles: string[]): AuthzDecision => {
   const
      prefix = `${config.mcpRolePrefix}.`,
      stripped = roles
         .filter((r) => r.startsWith(prefix))
         .map((r) => r.slice(prefix.length)),
      admin = stripped.includes("Admin"),
      backend = parseGrantedScopes(getTokenResponse().scope),
      roleScope = new Map<string, Set<ScopePermission>>(),
      operations = new Set<string>()
   let
      bundle = false,
      systemHistory = false

   for (const role of stripped) {
      const
         opMatch = /^Operation\.(.+)$/.exec(role),
         resMatch = /^([A-Za-z]+)\.(Read|Write)$/.exec(role)
      if (role === "Bundle") bundle = true
      else if (role === "SystemHistory.Read") systemHistory = true
      else if (opMatch) operations.add(opMatch[1]!.toLowerCase().replace(/^\$/, ""))
      else if (resMatch) {
         const perms = resMatch[2] === "Write" ? WRITE_PERMS : READ_PERMS
         roleScope.set(resMatch[1]!, new Set([...(roleScope.get(resMatch[1]!) ?? []), ...perms]))
      }
   }

   return admin
      ? { admin: true, scope: backend, operations: undefined, bundle: true, systemHistory: true }
      : { admin: false, scope: intersect(roleScope, backend), operations, bundle, systemHistory }
}
