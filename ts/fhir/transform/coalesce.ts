import { config } from "../../config/index.ts"
import { coalescePages } from "./coalesce-pages.ts"
import { finalizeEnvelope } from "./finalize.ts"
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
      envelope: FhirEnvelope = {
         status: "ok",
         responseMode: "compact",
         compacted: true,
         truncated: false,
         isBundle: true,
         hasMore,
         notes: [note, ...s.outcomeNotes],
         resourceType: "Bundle",
         bundle: { entries: s.entries.length, ...(s.serverTotal !== undefined && { total: s.serverTotal }), jsonBytes: Buffer.byteLength(JSON.stringify(bundle), "utf8") },
         ...(hasMore && s.nextUrl && { continuation: { kind: "page" as const, url: s.nextUrl } }),
         prefetch: { pages: s.pages, upstreamEntries: s.entriesSeen, returnedEntries: s.entries.length },
         data: bundle,
      },
      final = finalizeEnvelope(envelope, bundle)

   return {
      envelope: final.envelope,
      text: final.text,
      isError: final.isError,
      pagesFetched: s.pages,
      entriesSeen: s.entriesSeen,
      entriesReturned: s.entries.length,
      rawBytes: s.rawBytes,
      truncated: s.truncated,
      ...(s.truncateReason && { truncateReason: s.truncateReason }),
   }
}
