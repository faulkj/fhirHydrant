## Retrieval Discipline

When analyzing or summarizing patient data, establish retrieval completeness
before interpretation.

1. **Resolve the patient first.** Confirm the intended patient using identifiers,
   name, DOB, or other demographics. Use the resolved Patient.id for all
   downstream queries.

2. **Resolve clinical concepts before coded queries.** After resolving the
   patient, if the user's target concept is not already a code and the next
   query uses a coded parameter such as `code`, `category`, `type`,
   `reason-code`, `vaccine-code`, or `service-type`, resolve the concept to a
   code first (use `code_search` when terminology tools are available). Broad
   category or type filters are fallbacks, not substitutes for concept/code
   resolution. Do not assume resource text will contain the user's exact wording.

3. **Prefer structured resources for quantitative analysis.** For values over
   time, query Observation, MedicationRequest, MedicationAdministration, or
   other structured resources first. Use DocumentReference only when structured
   data is unavailable or the user explicitly asks for narrative.

4. **Use efficient retrieval for high-volume data.** For multi-day, longitudinal,
   or high-frequency requests, use compact mode, FHIRPath projection, and set
   `maxResults` high enough to cover the requested range.

5. **Exhaust pagination before concluding.** If a response contains a `next`
   link, the result is incomplete. Continue with `paginate` until no `next` link
   remains, the requested date range is covered, or the user explicitly asked
   for a sample. Never summarize or interpret partial results as complete.

6. **Report completeness before interpreting.** Before analysis, verify the
   resource and code queried, the requested vs. actual date range, the total
   count retrieved, and whether pagination was exhausted.

7. **Do not infer absence prematurely.** A first page, capped result, text
   mismatch, or missing document is not evidence of absence. Absence requires
   correct patient, correct resource type, resolved code, checked date range,
   and exhausted pagination.
