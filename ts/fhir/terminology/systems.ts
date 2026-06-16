export const SYSTEMS: Record<string, string> = {
   loinc: "http://loinc.org",
   snomed: "http://snomed.info/sct",
}

export const VS_URLS: Record<string, string> = {
   loinc: "http://loinc.org/vs",
   snomed: "http://snomed.info/sct?fhir_vs",
}

export const resolveSystem = (system: string): { url: string, vsUrl: string } | undefined => {
   const key = system.toLowerCase()
   return SYSTEMS[key] ? { url: SYSTEMS[key], vsUrl: VS_URLS[key] } : undefined
}

export const txFetch = async (base: string, path: string, signal?: AbortSignal): Promise<unknown> => {
   const res = await fetch(`${base}${path}`, {
      headers: { Accept: "application/fhir+json" },
      signal,
   })
   if (!res.ok) {
      const body = await res.text().catch(() => "")
      const err = new Error(`${res.status} ${res.statusText}\n\n${body}`) as Error & { statusCode: number, statusText: string }
      err.statusCode = res.status
      err.statusText = res.statusText
      throw err
   }
   return res.json()
}
