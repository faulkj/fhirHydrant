## Terminology Resolution

When the user provides a plain-language clinical term, abbreviation, device name,
or measurement name instead of a precise code, resolve it to a code before
querying coded FHIR resources. Use `code_search` to find matching code/display
pairs, and `terminology_lookup` to confirm what a known code means. Broad
category or type filters are fallbacks, not substitutes for code resolution.
Do not assume resource text will contain the user's exact wording.
