/**
 * Authorization provider registry — the single source of truth for `MCP_AUTHZ` providers.
 * The `AuthzMode` type and the `MCP_AUTHZ` parser both derive from these keys, so adding a
 * provider is exactly two edits: create `./<provider>.ts` exporting an `AuthzProvider`, then
 * add one entry here. This is a source extension (fork/clone + rebuild), not an npm/runtime
 * plugin. Loaders MUST stay lazy (dynamic import, no eager work) so `MCP_AUTHZ=none` never
 * executes provider code.
 */
export const authzProviders = {
   entra: () => import("./entra.ts").then((m) => m.entraProvider),
} satisfies Record<string, () => Promise<AuthzProvider>>
