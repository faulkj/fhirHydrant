/** Number of LOINC results fetched per server round-trip */
export const LOINC_FETCH_SIZE = 500

const
   CACHE_TTL_MS = 30 * 60 * 1000,
   CACHE_MAX_ENTRIES = 25,
   cache = new Map<string, TerminologySearchCacheEntry>()

/** Builds a normalized cache key from a system name and search filter */
export const cacheKey = (system: string, filter: string): string =>
   `${system}:${filter.trim().toLowerCase()}`

/** Returns a cached entry if it exists and hasn't expired, updating its access time */
export const cacheGet = (key: string): TerminologySearchCacheEntry | undefined => {
   const entry = cache.get(key)
   if (!entry) return undefined
   if (Date.now() - entry.createdAt > CACHE_TTL_MS)
      return cache.delete(key), undefined
   return entry.accessedAt = Date.now(), entry
}

/** Stores a terminology search result in the LRU cache, pruning stale/overflow entries */
export const cacheSet = (key: string, entry: TerminologySearchCacheEntry): void => {
   entry.accessedAt = Date.now()
   cache.set(key, entry)
   prune()
}

const prune = (): void => {
   const now = Date.now()
   for (const [k, v] of cache)
      if (now - v.createdAt > CACHE_TTL_MS) cache.delete(k)

   while (cache.size > CACHE_MAX_ENTRIES) {
      let
         oldest: string | undefined,
         oldestTime = Infinity
      for (const [k, v] of cache)
         if (v.accessedAt < oldestTime) oldest = k, oldestTime = v.accessedAt
      oldest && cache.delete(oldest)
   }
}
