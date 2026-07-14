import { config } from "../../config/index.ts"
import { enforceByteLimit } from "../utils.ts"
import { coalescePages } from "./coalesce-pages.ts"
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
      cap = maxResults ?? config.prefetchMaxEntries,
      s = await coalescePages(firstResult, client, label, cap, start),
      bundle: Record<string, unknown> = { resourceType: "Bundle" }

   s.bundleType !== undefined && (bundle.type = s.bundleType)
   s.serverTotal !== undefined && (bundle.total = s.serverTotal)
   s.entries.length && (bundle.entry = s.entries)
   s.truncated && s.nextUrl && (bundle.link = [{ relation: "next", url: s.nextUrl }])

   const
      hasMore = s.truncated && !!s.nextUrl,
      note = coalesceNote(s.pages, s.entriesSeen, s.entries.length, hasMore, s.truncated ? s.truncateReason : undefined, s.serverTotal),
      prefix = `${[note, ...s.outcomeNotes].join("\n")}\n\n`,
      shaped = enforceByteLimit(`${prefix}${JSON.stringify(bundle)}`, config.fhirMaxResponseBytes)

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
      pagesFetched: s.pages,
      entriesSeen: s.entriesSeen,
      entriesReturned: s.entries.length,
      rawBytes: s.rawBytes,
      truncated: s.truncated,
      ...(s.truncateReason && { truncateReason: s.truncateReason }),
   }
}
