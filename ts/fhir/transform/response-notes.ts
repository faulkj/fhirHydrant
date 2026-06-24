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

/** Builds a compact text note for a FHIR response — always includes the resourceType label,
 *  enriches Bundles with entry count, total, next link, and appends jsonBytes for all types.
 *  For batch-response/transaction-response, appends per-status counts. */
export const responseNote = (result: unknown, json: string): string | undefined => {
   if (!result || typeof result !== "object") return undefined
   const r = result as Record<string, unknown>
   const rt = r.resourceType
   if (typeof rt !== "string") return undefined
   const stats = bundleStats(result, json)
   if (!stats) return `${rt} jsonBytes=${Buffer.byteLength(json, "utf8")}`
   const parts = [
      `Bundle entries=${stats.entries}`,
      stats.total !== undefined ? `total=${stats.total}` : undefined,
      `jsonBytes=${stats.jsonBytes}`,
   ].filter(Boolean).join(" ")
   const base = stats.nextUrl ? `${parts}. Next: ${stats.nextUrl}` : parts
   const btype = r.type as string | undefined
   if ((btype === "batch-response" || btype === "transaction-response") && Array.isArray(r.entry)) {
      const counts: Record<string, number> = {}
      for (const e of r.entry as Array<Record<string, unknown>>) {
         const resp = e?.response as Record<string, unknown> | undefined
         const code = typeof resp?.status === "string" ? resp.status.split(" ")[0] : "unknown"
         counts[code] = (counts[code] ?? 0) + 1
      }
      const statusParts = Object.entries(counts).map(([code, n]) => `${n}x${code}`).join(", ")
      return `${base} status: ${statusParts}`
   }
   return base
}

/** Builds a summary note for a coalesced multi-page fetch. */
export const coalesceNote = (
   pages: number, upstream: number, returned: number, hasMore: boolean, reason?: string,
): string => {
   const parts = [
      `Prefetched ${pages} page${pages > 1 ? "s" : ""} (${upstream} upstream → ${returned} compact)`,
      reason ? `stopped: ${reason}` : undefined,
      hasMore ? "More available — call paginate with the next link (responseMode=compact)." : undefined,
   ].filter(Boolean)
   return parts.join(". ")
}
