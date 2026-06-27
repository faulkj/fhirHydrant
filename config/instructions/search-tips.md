When several candidate codes may be relevant, you can pass multiple codes to a
FHIR search parameter as a comma-separated list. For example, use `observation`
with `code: "41651-1,2345-7"` to search for Observations matching either code in
one FHIR call. Do not make many separate FHIR calls when one comma-separated
token search can safely answer the question.
