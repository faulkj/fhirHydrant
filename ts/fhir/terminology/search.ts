/** Searches LOINC codes with server-side pagination, local caching, and fallback broadening */
export { loincSearch }

/** Searches SNOMED codes via ValueSet/$expand with relevance scoring */
export { snomedSearch }

import { config } from "../../config.ts"
import { withRetry } from "../utils.ts"
import { txFetch } from "./systems.ts"
import { LOINC_FETCH_SIZE, cacheKey, cacheGet, cacheSet } from "./cache.ts"
import { scoreLoinc, scoreSnomed } from "./score.ts"

const
   LP_LA = /^L[AP]\d/,
   disp = (item: string) => item.split(" - ").slice(1).join(" - "),

   expandContains = (raw: unknown): Array<Record<string, unknown>> => {
      const exp = (raw as Record<string, unknown>)?.expansion as Record<string, unknown> | undefined
      return Array.isArray(exp?.contains) ? exp!.contains as Array<Record<string, unknown>> : []
   },

   fetchChunk = async (vsUrl: string, filter: string, offset: number, count: number): Promise<Record<string, unknown>> =>
      await withRetry(
         "code_search",
         (signal) => txFetch(
            config.fhirTerminologyBaseUrl!,
            `/ValueSet/$expand?url=${encodeURIComponent(vsUrl)}&filter=${encodeURIComponent(filter)}&count=${count}&offset=${offset}`,
            signal,
         ),
         2, config.fhirTerminologyTimeoutMs,
      ) as Record<string, unknown>

const
   loincSearch = async (vsUrl: string, filter: string, offset: number, count: number): Promise<{ page: string[], total: number, exhausted: boolean, fallback?: string }> => {
      const
         key = cacheKey("loinc", filter),
         hit = cacheGet(key),
         entry: TerminologySearchCacheEntry = hit ?? {
            items: [], codes: new Set<string>(), nextRawOffset: 0, exhausted: false,
            createdAt: Date.now(), accessedAt: Date.now(),
         }

      hit
         ? console.log(`🟢 code_search CACHE HIT — ${entry.items.length} cached for "${filter}"`)
         : console.log(`🔵 code_search FETCHING — "${filter}"`)

      let fetched = false
      const fill = async (serverFilter: string) => {
         while (entry.items.length < offset + count && !entry.exhausted) {
            fetched = true
            const
               raw = await fetchChunk(vsUrl, serverFilter, entry.nextRawOffset, LOINC_FETCH_SIZE),
               contains = expandContains(raw)

            entry.nextRawOffset += LOINC_FETCH_SIZE
            if (!contains.length) { entry.exhausted = true; break }

            for (const c of contains) {
               const code = String(c.code ?? "")
               if (LP_LA.test(code) || entry.codes.has(code)) continue
               entry.codes.add(code)
               entry.items.push(`${code} - ${c.display ?? "(no display)"}`)
            }

            if (contains.length < LOINC_FETCH_SIZE) entry.exhausted = true
         }
      }

      await fill(filter)

      let fallback: string | undefined
      const words = filter.toLowerCase().split(/\s+/).filter(Boolean)
      if (entry.items.length < 10 && words.length > 1) {
         const
            exact = entry.items.slice().sort((a, b) => scoreLoinc(disp(b), filter) - scoreLoinc(disp(a), filter)),
            exactCodes = new Set(exact.map(i => i.split(" - ")[0])),
            anchor = [...words].sort((a, b) => b.length - a.length)[0]
         console.log(`🟠 code_search FALLBACK — "${filter}" → "${anchor}" (${exact.length} exact kept)`)
         entry.items = []
         entry.codes = new Set<string>()
         entry.nextRawOffset = 0
         entry.exhausted = false
         await fill(anchor)
         if (entry.items.length) {
            const before = entry.items.length
            entry.items = entry.items
               .filter(item => !exactCodes.has(item.split(" - ")[0]))
               .filter(item => words.every(w => item.toLowerCase().includes(w)))
            console.log(`🟠 code_search FILTERED — ${before} → ${entry.items.length} (all words: ${words.join(", ")})`)
            entry.items.sort((a, b) => scoreLoinc(disp(b), filter) - scoreLoinc(disp(a), filter))
            entry.items = [...exact, ...entry.items]
            entry.codes = new Set(entry.items.map(i => i.split(" - ")[0]))
            if (entry.items.length > exact.length) fallback = anchor
         }
         else entry.items = exact

         fetched = false
      }

      if (fetched) entry.items.sort((a, b) => scoreLoinc(disp(b), filter) - scoreLoinc(disp(a), filter))

      cacheSet(key, entry)
      return { page: entry.items.slice(offset, offset + count), total: entry.items.length, exhausted: entry.exhausted, fallback }
   },

   snomedSearch = async (vsUrl: string, filter: string, offset: number, count: number): Promise<{ page: string[], total: number | undefined }> => {
      const
         raw = await fetchChunk(vsUrl, filter, offset, count),
         contains = expandContains(raw),
         exp = (raw as Record<string, unknown>).expansion as Record<string, unknown> | undefined,
         total = typeof exp?.total === "number" ? exp!.total as number : undefined,
         page = contains.map(c => `${c.code} - ${c.display ?? "(no display)"}`)
            .sort((a, b) => scoreSnomed(disp(b), filter) - scoreSnomed(disp(a), filter))

      return { page, total }
   }
