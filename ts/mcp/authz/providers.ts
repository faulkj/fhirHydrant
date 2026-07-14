import { config } from "../../config/index.ts"
import { authzProviders } from "./registry.ts"

/** Resolves the authorization provider for the active MCP_AUTHZ mode. Lazily imports so authz-off pulls in nothing. */
export const getAuthzProvider = async (): Promise<AuthzProvider> => {
   const load = config.mcpAuthz === "none" ? undefined : authzProviders[config.mcpAuthz]
   if (!load) throw new Error(`No authorization provider for MCP_AUTHZ=${config.mcpAuthz}`)
   return load()
}

/** Startup fail-fast — runs the active provider's own config check. No-op when authz is off. */
export const validateAuthzConfig = async (): Promise<void> => {
   if (config.mcpAuthz === "none") return
   const provider = await getAuthzProvider()
   provider.validateConfig?.()
}
