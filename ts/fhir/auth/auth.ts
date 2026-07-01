import fhirStarter from "fhirstarterjs"
import { config } from "../../config/index.ts"
import { log } from "../../log.ts"
import { getRequestedScopes } from "../model/definitions.ts"

let starter: InstanceType<typeof fhirStarter> | undefined

const NO_AUTH_TOKEN: TokenResponse = { token_type: "bearer", access_token: undefined, expires_in: undefined }

/** Initialises fhirStarter and acquires the first access token. Call once at startup. No-op when auth is disabled. */
export const startAuth = async (): Promise<void> => {
   if (!config.authEnabled) return
   starter = new fhirStarter({
      clientId: config.fhirClientId,
      privateKey: config.fhirActiveKey.privateKey,
      tokenEndpointUrl: config.fhirTokenEndpoint,
      scopes: getRequestedScopes(),
      keyId: config.fhirActiveKey.kid,
      ...(config.fhirJwksUrl && { jwksUrl: config.fhirJwksUrl }),
   })
   const active = starter
   log.debug(`🔑 Requesting scopes: ${getRequestedScopes().join(", ")}`)
   await active.start()
   log.info("🔑 Auth started — token acquired")
   log.debug(`🔑 Granted scope: ${active.tokenResponse().scope ?? "(none)"}`)

   const initialScope = active.tokenResponse().scope ?? ""
   active.onRefresh(() => {
      const refreshedScope = active.tokenResponse().scope ?? ""
      if (refreshedScope !== initialScope)
         log.warn(`🔑 Granted scopes changed after token refresh — registered tools may be stale`)
   })
}

/** Stops the proactive token-refresh loop. Call during graceful shutdown. */
export const stopAuth = (): void => {
   starter?.stop()
}

/** Stops then restarts fhirStarter with the current scopes. Use when definitions change the derived scope set. No-op when auth is disabled. */
export const restartAuth = async (): Promise<void> => {
   if (!config.authEnabled) return
   stopAuth()
   await startAuth()
}

/** Returns the getter-backed token response object. Reflects the current valid token, or an unauthenticated token when auth is disabled. */
export const getTokenResponse = (): TokenResponse => starter?.tokenResponse() ?? NO_AUTH_TOKEN
