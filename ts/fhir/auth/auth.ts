import fhirStarter from "@fhirstarter/backend"
import { config } from "../../config/index.ts"
import { log } from "../../log.ts"
import { getRequestedScopes } from "../model/definitions.ts"
import { scopeSignature } from "./scopes.ts"

let
   starter: Provider | undefined,
   unsubscribe: (() => void) | undefined,
   onScopeChange: (() => void) | undefined,
   jwksJson: string | undefined

const NO_AUTH_TOKEN: TokenResponse = { token_type: "bearer", access_token: undefined, expires_in: undefined }

/** Registers the callback invoked after a token refresh materially changes the granted backend scopes. */
export const setScopeChangeHandler = (handler: () => void): void => {
   onScopeChange = handler
}

const makeStarter = (scopes: string[]): Provider =>
   fhirStarter({
      clientId: config.fhirClientId,
      privateKey: config.fhirActiveKey.privateKey,
      tokenEndpointUrl: config.fhirTokenEndpoint,
      scopes,
      keyId: config.fhirActiveKey.kid,
      retiredKeys: config.fhirRetiredKeys.map(({ privateKey, kid }) => ({ key: privateKey, keyId: kid })),
      ...(config.fhirJwksUrl && { jwksUrl: config.fhirJwksUrl }),
   })

const subscribeScopeWatch = (active: Provider): (() => void) => {
   let signature = scopeSignature(active.tokenResponse().scope)
   return active.onRefresh(() => {
      const next = scopeSignature(active.tokenResponse().scope)
      if (next === signature) return
      signature = next
      log.info("🔑 Granted scopes changed after token refresh — re-evaluating tools")
      try { onScopeChange?.() }
      catch (err) { log.error("📋 Registration refresh failed after scope change:", err instanceof Error ? err.message : err) }
   })
}

/** Initialises fhirStarter and acquires the first access token. Call once at startup. No-op when auth is disabled. */
export const startAuth = async (): Promise<void> => {
   if (!config.authEnabled) return
   starter = makeStarter(getRequestedScopes())
   const active = starter
   log.debug(`🔑 Requesting scopes: ${getRequestedScopes().join(", ")}`)
   await active.start()
   log.info("🔑 Auth started — token acquired")
   log.debug(`🔑 Granted scope: ${active.tokenResponse().scope ?? "(none)"}`)
   unsubscribe = subscribeScopeWatch(active)
}

/** Stops the proactive token-refresh loop. Call during graceful shutdown. */
export const stopAuth = (): void => {
   starter?.stop()
}

/**
 * Atomically swaps in a fresh starter for the given scopes. The old starter stays live until
 * acquisition succeeds; on success the old callback is unsubscribed, `commit` runs synchronously
 * with the new token visible, the new watch is installed, and the old starter is stopped. On failure
 * the candidate is discarded and old auth/definitions/catalog stay untouched. Returns success.
 */
export const replaceAuth = async (scopes: string[], commit: () => void): Promise<boolean> => {
   if (!config.authEnabled) { commit(); return true }
   const candidate = makeStarter(scopes)
   try {
      await candidate.start()
   } catch (err) {
      candidate.stop()
      log.error("🔑 Auth replacement failed — keeping current scopes/tools:", err instanceof Error ? err.message : err)
      return false
   }
   const old = starter
   unsubscribe?.()
   starter = candidate
   commit()
   unsubscribe = subscribeScopeWatch(candidate)
   old?.stop()
   log.info("🔑 Auth replaced with new scopes")
   return true
}

/** Returns the getter-backed token response object. Reflects the current valid token, or an unauthenticated token when auth is disabled. */
export const getTokenResponse = (): TokenResponse => starter?.tokenResponse() ?? NO_AUTH_TOKEN

/** Express GET handler serving the provider-derived JWKS (active + retired keys). Cached after the first request. */
export const jwksHandler = async (_req: Req, res: Res): Promise<void> => {
   jwksJson ??= JSON.stringify(await makeStarter(getRequestedScopes()).getJwks())
   res.set("Cache-Control", "public, max-age=3600").type("application/json").send(jwksJson)
}
