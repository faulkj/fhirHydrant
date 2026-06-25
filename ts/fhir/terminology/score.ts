
// ── helpers ──────────────────────────────────────────────────────────

const
   PANEL_WORDS = ["panel", "report", "summary", "device", "attachment", "monitor"],
   TIMED_WORDS = ["challenge", "post ", "pre ", "tolerance", "clearance"],

   toks = (s: string): Set<string> =>
      new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean)),

   hasAny = (d: string, words: string[]): boolean =>
      words.some(w => d.includes(w)),

   countMatched = (qt: Set<string>, dt: Set<string>): number => {
      let n = 0
      for (const t of qt)
         if (dt.has(t)) n++
      return n
   }

// ── LOINC scorer ─────────────────────────────────────────────────────

/** Scores a LOINC concept's display against a search query for relevance ranking */
export const scoreLoinc = (display: string, query: string): number => {
   const
      d = display.toLowerCase(),
      q = query.trim().toLowerCase()

   if (d.includes("deprecated")) return -1000

   const
      bracketIdx = d.indexOf("["),
      dashIdx = d.indexOf("--"),
      cutIdx = bracketIdx >= 0 && dashIdx >= 0
         ? Math.min(bracketIdx, dashIdx)
         : bracketIdx >= 0
            ? bracketIdx
            : dashIdx >= 0
               ? dashIdx
               : d.length,
      main = d.slice(0, cutIdx),
      qt = toks(q),
      dt = toks(main),
      matched = countMatched(qt, dt)

   let score = d.startsWith(q) ? 500 : matched * 40

   if (!d.startsWith(q)) {
      if (main.includes(q)) score += 60
      else if (d.slice(0, bracketIdx >= 0 ? bracketIdx : d.length).includes(q)) score += 30
   }

   const words = d.split(/\s+/).length
   if (dashIdx >= 0 && d.indexOf(q) > dashIdx && !main.includes(q)) score -= 50
   hasAny(d, PANEL_WORDS) && (score -= 30)
   hasAny(d, TIMED_WORDS) && !hasAny(q, TIMED_WORDS) && (score -= 20)
   hasAny(d, ["serum", "plasma", "blood", "urine", "csf"]) && (score += 10)
   words > 4 && (score -= (words - 4) * 4)

   return score
}

// ── SNOMED scorer ────────────────────────────────────────────────────

/** Scores a SNOMED concept's display against a search query for relevance ranking */
export const scoreSnomed = (display: string, query: string): number => {
   const
      d = display.toLowerCase(),
      q = query.trim().toLowerCase(),
      core = d.replace(/\s*\([^)]*\)\s*$/, "")

   if (core === q) return 500
   if (core.startsWith(q)) return 300

   const
      qt = toks(q),
      dt = toks(core),
      matched = countMatched(qt, dt)

   if (matched === qt.size && qt.size > 0) return 200 + matched * 10
   if (core.includes(q)) return 150
   return matched * 20
}
