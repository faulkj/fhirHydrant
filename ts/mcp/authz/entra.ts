import { createRemoteJWKSet, jwtVerify } from "jose"

const
   TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
   tenantId = (): string | undefined => process.env["MCP_ENTRA_TENANT_ID"]?.trim() || undefined,
   audience = (): string | undefined => process.env["MCP_ENTRA_AUDIENCE"]?.trim() || undefined,

   toStrings = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

/**
 * Microsoft Entra authorization provider — validates a bearer token (signature via JWKS,
 * issuer, audience, expiry) and returns the caller identity from its `sub`/`oid` and `roles`
 * claims. Owns its own MCP_ENTRA_* env; nothing Entra-specific leaks into core config.
 */
export const entraProvider: AuthzProvider = {
   challenge: "Bearer",
   validateConfig: () => {
      if (!tenantId() || !audience())
         throw new Error("MCP_AUTHZ=entra requires MCP_ENTRA_TENANT_ID and MCP_ENTRA_AUDIENCE")
      if (!TENANT_ID.test(tenantId()!))
         throw new Error("MCP_ENTRA_TENANT_ID must be the tenant GUID (domain aliases are not supported)")
   },
   validate: async (authorization) => {
      const token = authorization?.replace(/^Bearer\s+/i, "").trim()
      if (!token) throw new Error("missing bearer token")

      jwks ??= createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId()}/discovery/v2.0/keys`))
      const { payload } = await jwtVerify(token, jwks, {
         issuer: `https://login.microsoftonline.com/${tenantId()}/v2.0`,
         audience: audience(),
      })
      return {
         subject: typeof payload.sub === "string" ? payload.sub : (typeof payload["oid"] === "string" ? payload["oid"] : undefined),
         roles: toStrings(payload["roles"]),
      }
   },
}
