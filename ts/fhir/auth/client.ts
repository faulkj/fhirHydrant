import FHIR from "fhirclient"
import { config } from "../../config/index.ts"
import { getTokenResponse } from "./auth.ts"

const
   smart = (FHIR as unknown as (env: object) => SmartNamespace)({}),

   absoluteUrl = (url: string): string =>
      /^https?:\/\//i.test(url) ? url : `${config.fhirServerUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`

/** Creates a fhirclient instance pre-wired with the current SMART auth token. */
export const createFhirClient = (): FhirClient =>
   smart.client({
      serverUrl: config.fhirServerUrl,
      tokenResponse: getTokenResponse(),
   })

/**
 * Performs an authenticated raw FHIR request without fhirclient's content decoding, so native
 * (non-JSON) bodies stay unconsumed and exact bytes are preserved. Accept mirrors fhirclient's
 * JSON default; the current getter-backed token supplies Authorization. Returns status/headers/body.
 */
export const rawFhirRequest = async (
   url: string, signal: AbortSignal | undefined, init?: RawRequestInit,
): Promise<RawFhirResponse> => {
   const
      auth = createFhirClient().getAuthorizationHeader(),
      headers: Record<string, string> = { accept: "application/json", ...init?.headers }
   if (auth) headers.authorization = auth
   const res = await fetch(absoluteUrl(url), {
      method: init?.method ?? "GET", ...(init?.body !== undefined && { body: init.body }),
      headers, signal, redirect: "follow",
   })
   return { status: res.status, headers: res.headers, body: res.body }
}
