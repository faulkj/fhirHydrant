import { randomUUID } from "crypto"
import { log } from "../../log.ts"
import { getCallerKey } from "../../mcp/authz/context.ts"
import { serializeEnvelope } from "./serialize.ts"

const
   CHUNK_PREFIX = "urn:fhirhydrant:chunk:",
   MAX_STORED = 200,
   store = new Map<string, { key: string, envelope: FhirEnvelope }>()

/** Returns true when the URL is a synthetic local chunk reference. */
export const isChunkUrl = (url: string): boolean => url.startsWith(CHUNK_PREFIX)

/** Retrieves and removes a stored chunk envelope by its synthetic URL, only for the caller that created it. Returns undefined if expired/evicted/foreign. */
export const retrieveChunk = (url: string): FhirEnvelope | undefined => {
   const
      id = url.slice(CHUNK_PREFIX.length),
      entry = store.get(id)
   if (!entry) return undefined
   if (entry.key !== getCallerKey()) return undefined
   store.delete(id)
   return entry.envelope
}

/**
 * Attempts to split an oversized transformed Bundle into byte-limit-safe chunk envelopes.
 * Returns the first chunk's envelope, or undefined if chunking is not possible. Remaining
 * chunks are stored for retrieval via synthetic URLs carried in each chunk's continuation.
 */
export const tryChunkBundle = (
   bundle: unknown, base: FhirEnvelope, limit: number,
): ChunkBuildResult | undefined => {
   if (!bundle || typeof bundle !== "object") return undefined
   const
      b = bundle as Record<string, unknown>,
      entries = Array.isArray(b.entry) ? b.entry as unknown[] : undefined
   if (b.resourceType !== "Bundle" || !entries || entries.length < 2) return undefined

   const
      serverNextUrl = extractNextUrl(b),
      shell: Record<string, unknown> = { resourceType: "Bundle" }
   b.type !== undefined && (shell.type = b.type)
   b.total !== undefined && (shell.total = b.total)

   const ranges = findChunkRanges(entries, shell, base, limit)
   if (!ranges || ranges.length < 2) return undefined
   if (ranges.length - 1 > MAX_STORED - store.size) return undefined

   const
      ids = ranges.slice(1).map(() => randomUUID()),
      key = getCallerKey()

   for (let i = ids.length - 1; i >= 0; i--) {
      const
         nextUrl = i === ids.length - 1 ? serverNextUrl : `${CHUNK_PREFIX}${ids[i + 1]}`,
         [start, end] = ranges[i + 1]
      store.set(ids[i], { key, envelope: chunkEnvelope(shell, entries.slice(start, end), nextUrl, base) })
   }

   log.debug(`📄 Bundle chunked into ${ids.length + 1} parts (${entries.length} entries)`)
   return { envelope: chunkEnvelope(shell, entries.slice(ranges[0][0], ranges[0][1]), `${CHUNK_PREFIX}${ids[0]}`, base) }
}

const
   extractNextUrl = (b: Record<string, unknown>): string | undefined => {
      const links = Array.isArray(b.link) ? b.link as Record<string, unknown>[] : []
      return (links.find((l) => l?.relation === "next" && typeof l?.url === "string")?.url as string | undefined)
   },

   chunkBundleData = (shell: Record<string, unknown>, entries: unknown[]): Record<string, unknown> => {
      const out: Record<string, unknown> = { ...shell }
      entries.length && (out.entry = entries)
      return out
   },

   chunkEnvelope = (
      shell: Record<string, unknown>, entries: unknown[],
      nextUrl: string | undefined, base: FhirEnvelope,
   ): FhirEnvelope => {
      const data = chunkBundleData(shell, entries)
      return {
         ...base,
         status: "ok",
         truncated: false,
         hasMore: !!nextUrl,
         bundle: { entries: entries.length, ...(typeof shell.total === "number" && { total: shell.total }), jsonBytes: Buffer.byteLength(JSON.stringify(data), "utf8") },
         ...(nextUrl
            ? { continuation: { kind: nextUrl.startsWith(CHUNK_PREFIX) ? "chunk" as const : "page" as const, url: nextUrl } }
            : { continuation: undefined }),
         data,
      }
   },

   findChunkRanges = (
      entries: unknown[], shell: Record<string, unknown>, base: FhirEnvelope, limit: number,
   ): [number, number][] | undefined => {
      const ranges: [number, number][] = []
      let start = 0
      while (start < entries.length) {
         let
            lo = start + 1,
            hi = entries.length,
            best = -1
         while (lo <= hi) {
            const
               mid = Math.floor((lo + hi) / 2),
               size = Buffer.byteLength(serializeEnvelope(chunkEnvelope(shell, entries.slice(start, mid), `${CHUNK_PREFIX}x`, base)), "utf8")
            size <= limit ? (best = mid, lo = mid + 1) : (hi = mid - 1)
         }
         if (best <= start) return undefined
         ranges.push([start, best])
         start = best
      }
      return ranges
   }
