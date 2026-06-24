import { log } from "../../log.ts"

/** Canonical CodeSystem URLs keyed by short name */
export const SYSTEMS: Record<string, string> = {
   loinc: "http://loinc.org",
   snomed: "http://snomed.info/sct",
}

/** ValueSet URLs keyed by short name, used for $expand operations */
export const VS_URLS: Record<string, string> = {
   loinc: "http://loinc.org/vs",
   snomed: "http://snomed.info/sct?fhir_vs",
}

/** Resolves a short system name to its CodeSystem and ValueSet URLs */
export const resolveSystem = (system: string): { url: string, vsUrl: string } | undefined => {
   const key = system.toLowerCase()
   return SYSTEMS[key] ? { url: SYSTEMS[key], vsUrl: VS_URLS[key] } : undefined
}

/** Fetches JSON from a FHIR terminology server with proper Accept header */
export const txFetch = async (base: string, path: string, signal?: AbortSignal): Promise<unknown> => {
   const url = `${base}${path}`
   log.debug(`🔤 terminology → ${url}`)
   const res = await fetch(url, {
      headers: { Accept: "application/fhir+json" },
      signal,
   })
   log.debug(`🔤 terminology ← ${res.status} ${res.statusText}`)
   if (!res.ok) {
      const body = await res.text().catch(() => "")
      const err = new Error(`${res.status} ${res.statusText}\n\n${body}`) as Error & { statusCode: number, statusText: string }
      err.statusCode = res.status
      err.statusText = res.statusText
      throw err
   }
   return res.json()
}
