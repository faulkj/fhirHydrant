import FHIRStarter from "fhirstarterjs"
import { config } from "../config.ts"
import { getScopes } from "./definitions.ts"

let starter!: InstanceType<typeof FHIRStarter>

/** Initialises FHIRStarter and acquires the first access token. Call once at startup. */
export const startAuth = async (): Promise<void> => {
   starter = new FHIRStarter({
      clientId: config.fhirClientId,
      privateKey: config.fhirPrivateKey,
      tokenEndpointUrl: config.fhirTokenEndpoint,
      scopes: getScopes(),
      ...(config.fhirJwksUrl && { jwksUrl: config.fhirJwksUrl }),
      ...(config.fhirKeyId && { keyId: config.fhirKeyId }),
   })
   await starter.start()
}

/** Stops the proactive token-refresh loop. Call during graceful shutdown. */
export const stopAuth = (): void => {
   starter?.stop()
}

/** Stops then restarts FHIRStarter with the current scopes. Use when definitions change the derived scope set. */
export const restartAuth = async (): Promise<void> => {
   stopAuth()
   await startAuth()
}

/** Returns the getter-backed token response object. Always reflects the current valid token. */
export const getTokenResponse = (): TokenResponse => starter.tokenResponse()
