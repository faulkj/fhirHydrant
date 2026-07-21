import { loadMessages } from "../../config/text.ts"

const messages = loadMessages("artifact")

/** Extracts and removes the maxResults arg, returning a positive integer or undefined. */
export const extractMaxResults = (args: Record<string, unknown>): number | undefined => {
   const raw = args["maxResults"]
   delete args["maxResults"]
   if (raw === undefined || raw === null || raw === "") return undefined
   const n = typeof raw === "number" ? raw : Number(raw)
   return Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined
}

/** Extracts and removes the prefetch arg; defaults to enabled unless explicitly "false". */
export const extractPrefetch = (args: Record<string, unknown>): boolean => {
   const raw = args["prefetch"]
   delete args["prefetch"]
   return String(raw).toLowerCase() !== "false"
}

/** Builds the note naming any JSON-only shaping arguments ignored on an artifact response. */
export const ignoredShapingNote = (
   fhirpathExpr: string | undefined, explicit: string | null | undefined,
   prefetchEnabled: boolean, maxResults: number | undefined,
): string | undefined => {
   const ignored = [
      fhirpathExpr ? "fhirpath" : undefined,
      explicit ? "responseMode" : undefined,
      !prefetchEnabled ? "prefetch" : undefined,
      maxResults !== undefined ? "maxResults" : undefined,
   ].filter(Boolean)
   return ignored.length ? messages.artifactIgnoredShaping.replace("{ignored}", ignored.join(", ")) : undefined
}
