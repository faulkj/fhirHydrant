import { loadMessages } from "../../config/text.ts"

const messages = loadMessages("core")

/** Parses Bundle stats from a FHIR response — shared between response notes and audit. */
export const bundleStats = (result: unknown, json: string): BundleStats | undefined => {
   if (!result || typeof result !== "object") return undefined
   const r = result as Record<string, unknown>
   if (r.resourceType !== "Bundle") return undefined
   const
      links = Array.isArray(r.link) ? r.link : [],
      next = links.find(
         (l): l is Record<string, unknown> =>
            !!l && typeof l === "object" && (l as Record<string, unknown>).relation === "next" && typeof (l as Record<string, unknown>).url === "string",
      )
   return {
      entries: Array.isArray(r.entry) ? r.entry.length : 0,
      total: typeof r.total === "number" ? r.total : undefined,
      jsonBytes: Buffer.byteLength(json, "utf8"),
      nextUrl: next ? String((next as Record<string, unknown>).url) : undefined,
   }
}

/** Builds a per-status count note for a batch-response/transaction-response Bundle (e.g. "2x200, 1x404"), or undefined. */
export const batchStatusNote = (result: unknown): string | undefined => {
   if (!result || typeof result !== "object") return undefined
   const r = result as Record<string, unknown>
   const btype = r.type as string | undefined
   if ((btype !== "batch-response" && btype !== "transaction-response") || !Array.isArray(r.entry)) return undefined
   const counts: Record<string, number> = {}
   for (const e of r.entry as Array<Record<string, unknown>>) {
      const
         resp = e?.response as Record<string, unknown> | undefined,
         code = typeof resp?.status === "string" ? resp.status.split(" ")[0] : "unknown"
      counts[code] = (counts[code] ?? 0) + 1
   }
   return messages.batchStatus.replace("{counts}", Object.entries(counts).map(([code, n]) => `${n}x${code}`).join(", "))
}

/** Builds a summary note for a coalesced multi-page fetch. */
export const coalesceNote = (
   pages: number, upstream: number, returned: number, hasMore: boolean, reason?: string, serverTotal?: number,
): string => {
   const parts = [
      messages.coalesceSummary
         .replace("{pages}", String(pages))
         .replace("{pagePlural}", pages > 1 ? "s" : "")
         .replace("{upstream}", String(upstream))
         .replace("{returned}", String(returned)),
      serverTotal !== undefined ? messages.coalesceServerTotal.replace("{total}", String(serverTotal)) : undefined,
      reason ? messages.coalesceStopped.replace("{reason}", reason) : undefined,
      hasMore ? messages.coalescePartial.replace("{returned}", String(returned)) : undefined,
   ].filter(Boolean)
   return parts.join(". ")
}
