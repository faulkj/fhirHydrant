import { randomUUID } from "crypto"

const
   CHUNK_PREFIX = "urn:fhirhydrant:chunk:",
   MAX_STORED = 200,
   store = new Map<string, string>()

/** Returns true when the URL is a synthetic local chunk reference. */
export const isChunkUrl = (url: string): boolean => url.startsWith(CHUNK_PREFIX)

/** Retrieves and removes a stored chunk by its synthetic URL. Returns the pre-serialized text or undefined if expired/evicted. */
export const retrieveChunk = (url: string): string | undefined => {
   const
      id = url.slice(CHUNK_PREFIX.length),
      text = store.get(id)
   text !== undefined && store.delete(id)
   return text
}

/**
 * Attempts to split an oversized transformed Bundle into byte-limit-safe chunks.
 * Returns the first chunk text ready to return, or undefined if chunking is not possible.
 * Remaining chunks are stored for retrieval via synthetic URLs embedded in each chunk's link[next].
 */
export const tryChunkBundle = (
   bundle: unknown, prefix: string, limit: number,
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

   const ranges = findChunkRanges(entries, shell, prefix, limit)
   if (!ranges || ranges.length < 2) return undefined
   if (ranges.length - 1 > MAX_STORED - store.size) return undefined

   const ids = ranges.slice(1).map(() => randomUUID())

   for (let i = ids.length - 1; i >= 0; i--) {
      const
         nextUrl = i === ids.length - 1 ? serverNextUrl : `${CHUNK_PREFIX}${ids[i + 1]}`,
         [start, end] = ranges[i + 1],
         text = renderChunk(shell, entries.slice(start, end), nextUrl, prefix)
      store.set(ids[i], text)
   }

   const firstNextUrl = `${CHUNK_PREFIX}${ids[0]}`
   return { text: renderChunk(shell, entries.slice(ranges[0][0], ranges[0][1]), firstNextUrl, prefix) }
}

const
   extractNextUrl = (b: Record<string, unknown>): string | undefined => {
      const links = Array.isArray(b.link) ? b.link as Record<string, unknown>[] : []
      return (links.find((l) => l?.relation === "next" && typeof l?.url === "string")?.url as string | undefined)
   },

   findChunkRanges = (
      entries: unknown[], shell: Record<string, unknown>, prefix: string, limit: number,
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
               size = Buffer.byteLength(renderChunk(shell, entries.slice(start, mid), "x", prefix), "utf8")
            size <= limit ? (best = mid, lo = mid + 1) : (hi = mid - 1)
         }
         if (best <= start) return undefined
         ranges.push([start, best])
         start = best
      }
      return ranges
   },

   renderChunk = (
      shell: Record<string, unknown>, entries: unknown[],
      nextUrl: string | undefined, prefix: string,
   ): string => {
      const out: Record<string, unknown> = { ...shell }
      entries.length && (out.entry = entries)
      nextUrl && (out.link = [{ relation: "next", url: nextUrl }])
      return `${prefix}${JSON.stringify(out)}`
   }
