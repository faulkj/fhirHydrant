import { config } from "../../config/index.ts"
import { log } from "../../log.ts"
import { withRetry } from "../utils.ts"
import { compact } from "./compact.ts"
import { outcomeNote } from "./outcomes.ts"

/**
 * Walks upstream FHIR pages, compacting and deduplicating entries until a
 * truncation limit is hit or pagination ends. Returns the accumulated state
 * for the caller to shape into an MCP response.
 */
export const coalescePages = async (
   firstResult: unknown,
   client: { request: (opts: { url: string, signal?: AbortSignal }) => Promise<unknown> },
   label: string,
   cap: number,
   start: number,
): Promise<CoalescePages> => {
   const
      entries: unknown[] = [],
      seen = new Set<string>(),
      outcomeNotes = new Set<string>()

   let
      pages = 0,
      entriesSeen = 0,
      dupsSkipped = 0,
      rawBytes = 0,
      nextUrl: string | undefined = undefined,
      truncated = false,
      truncateReason: string | undefined = undefined,
      bundleType: unknown = undefined,
      serverTotal: number | undefined = undefined,
      current: unknown = firstResult

   while (current) {
      const b = current as Record<string, unknown>
      if (pages === 0) {
         bundleType = b.type
         typeof b.total === "number" && (serverTotal = b.total)
      }

      rawBytes += Buffer.byteLength(JSON.stringify(current), "utf8")

      const pageOutcome = outcomeNote(current)
      pageOutcome && outcomeNotes.add(pageOutcome)

      entriesSeen += Array.isArray(b.entry) ? b.entry.length : 0

      const
         compacted = compact(current) as Record<string, unknown>,
         compactEntries = Array.isArray(compacted.entry) ? compacted.entry as unknown[] : []
      for (const entry of compactEntries) {
         const res = (entry as Record<string, unknown>)?.resource as Record<string, unknown> | undefined
         if (res?.resourceType === "OperationOutcome") continue
         const url = (entry as Record<string, unknown>)?.fullUrl as string | undefined
         if (url && seen.has(url)) {
            dupsSkipped++
            continue
         }
         url && seen.add(url)
         entries.push(entry)
      }
      pages++

      const links = Array.isArray(b.link) ? b.link as Record<string, unknown>[] : []
      nextUrl = links.find((l) => l?.relation === "next" && typeof l?.url === "string")?.url as string | undefined

      if (!nextUrl) break
      if (pages >= config.prefetchMaxPages)
         truncated = true, truncateReason = "maxPages"
      else if (entries.length >= cap)
         truncated = true, truncateReason = "maxResults"
      else if (entriesSeen >= config.prefetchMaxEntries)
         truncated = true, truncateReason = "maxEntries"
      else if (rawBytes >= config.prefetchMaxBytes)
         truncated = true, truncateReason = "maxBytes"
      else if (Date.now() - start >= config.prefetchTimeoutMs)
         truncated = true, truncateReason = "timeout"
      if (truncated) break

      try {
         log.debug(`📦 ${label} fetching page ${pages + 1} → ${nextUrl}`)
         current = await withRetry(label, (signal) => client.request({ url: nextUrl!, signal }), 3, config.fhirRequestTimeoutMs)
      } catch {
         truncated = true, truncateReason = "fetchError"
         break
      }
   }

   truncated && log.debug(`📦 Coalesce truncated: ${truncateReason} after ${pages} pages, ${entries.length} entries`)
   dupsSkipped && log.debug(`📦 ${label}: deduplicated ${dupsSkipped} included resource(s) across pages`)

   return { entries, outcomeNotes, pages, entriesSeen, rawBytes, nextUrl, truncated, truncateReason, bundleType, serverTotal }
}
