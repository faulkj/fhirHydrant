import { config } from "../../config/index.ts"
import { log } from "../../log.ts"
import { withRetry, enforceByteLimit } from "../utils.ts"
import { compact } from "./compact.ts"
import { tryChunkBundle } from "./bundle-chunks.ts"
import { coalesceNote } from "./response-notes.ts"

/**
 * Coalesces multiple upstream FHIR pages into one compact Bundle.
 * Compacts each page immediately and accumulates only compact entries.
 * Returns a complete MCP-ready response with notes and audit stats.
 */
export const coalesce = async (
   firstResult: unknown,
   client: { request: (opts: { url: string, signal?: AbortSignal }) => Promise<unknown> },
   label: string,
   maxResults?: number,
   t0?: number,
): Promise<CoalesceResult> => {
   const
      start = t0 ?? Date.now(),
      entries: unknown[] = [],
      seen = new Set<string>(),
      cap = maxResults ?? config.prefetchMaxEntries

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

      const pageJson = JSON.stringify(current)
      rawBytes += Buffer.byteLength(pageJson, "utf8")

      const pageEntries = Array.isArray(b.entry) ? b.entry as unknown[] : []
      entriesSeen += pageEntries.length

      const compacted = compact(current) as Record<string, unknown>
      const compactEntries = Array.isArray(compacted.entry) ? compacted.entry as unknown[] : []
      for (const entry of compactEntries) {
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
         current = await withRetry(
            label,
            (signal) => client.request({ url: nextUrl!, signal }),
            3,
            config.fhirRequestTimeoutMs,
         )
      } catch {
         truncated = true
         truncateReason = "fetchError"
         break
      }
   }

   truncated && log.debug(`📦 Coalesce truncated: ${truncateReason} after ${pages} pages, ${entries.length} entries`)
   dupsSkipped && log.debug(`📦 ${label}: deduplicated ${dupsSkipped} included resource(s) across pages`)

   const bundle: Record<string, unknown> = { resourceType: "Bundle" }
   bundleType !== undefined && (bundle.type = bundleType)
   serverTotal !== undefined && (bundle.total = serverTotal)
   entries.length && (bundle.entry = entries)
   truncated && nextUrl && (bundle.link = [{ relation: "next", url: nextUrl }])

   const
      hasMore = truncated && !!nextUrl,
      note = coalesceNote(pages, entriesSeen, entries.length, hasMore, truncated ? truncateReason : undefined, serverTotal),
      json = JSON.stringify(bundle),
      prefix = `${note}\n\n`,
      shaped = enforceByteLimit(`${prefix}${json}`, config.fhirMaxResponseBytes)

   let
      text = shaped.text,
      isError = !!shaped.isError
   if (shaped.isError) {
      const chunked = tryChunkBundle(bundle, prefix, config.fhirMaxResponseBytes)
      if (chunked) text = chunked.text, isError = false
   }

   return {
      text,
      isError,
      pagesFetched: pages,
      entriesSeen,
      entriesReturned: entries.length,
      rawBytes,
      truncated,
      ...(truncateReason && { truncateReason }),
   }
}
