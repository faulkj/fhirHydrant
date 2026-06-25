import FHIR from "fhirclient"
import { config } from "../../config/index.ts"
import { getTokenResponse } from "./auth.ts"

const smart = (FHIR as unknown as (env: object) => SmartNamespace)({})

/** Creates a fhirclient instance pre-wired with the current SMART auth token. */
export const createFhirClient = (): FhirClient =>
   smart.client({
      serverUrl: config.fhirServerUrl,
      tokenResponse: getTokenResponse(),
   })
