const text = (value: unknown): string | undefined =>
   typeof value === "string" && value.trim() ? value.trim() : undefined

/** Validates raw definitions array shape and returns cleaned entries + errors. */
export const validateDefinitions = (raw: unknown): ValidationResult => {
   const errors: string[] = []

   if (!Array.isArray(raw))
      return (errors.push("definitions.json must be a JSON array"), { entries: [], errors })

   const
      seen = new Set<string>(),
      entries: ResourceDefinitionRaw[] = []

   for (const value of raw) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
         errors.push("definitions.json entries must be objects")
         continue
      }

      const
         entry = value as Record<string, unknown>,
         searchParams = entry["searchParams"]

      if (
         searchParams !== undefined &&
         (!searchParams || typeof searchParams !== "object" || Array.isArray(searchParams))
      ) {
         errors.push(
            `Invalid entry for resourceType "${text(entry["resourceType"]) ?? "(missing)"}": searchParams must be an object when provided`,
         )
         continue
      }

      const
         rt = text(entry["resourceType"]),
         name = text(entry["toolName"]),
         desc = text(entry["description"])

      if (!rt || !name || !desc || typeof entry.supportsDirectRead !== "boolean") {
         errors.push(
            `Invalid entry for resourceType "${rt ?? "(missing)"}": requires resourceType, toolName, description (non-empty strings) and supportsDirectRead (boolean)`,
         )
         continue
      }

      if (seen.has(name)) {
         errors.push(`Duplicate toolName "${name}"`)
         continue
      }
      seen.add(name)

      const params = (searchParams ?? {}) as Record<string, unknown>

      for (const [key, val] of Object.entries(params))
         if (typeof key !== "string" || typeof val !== "string")
            errors.push(`"${name}": searchParams keys and values must be strings (got key="${key}")`)

      if (!entry.supportsDirectRead && Object.keys(params).length === 0) {
         errors.push(`"${name}" has no searchParams and supportsDirectRead is false`)
         continue
      }

      const
         rawRequire = entry["requireOneOf"],
         requireOneOf =
            Array.isArray(rawRequire) && rawRequire.length > 0 && rawRequire.every((v: unknown) => typeof v === "string" && v.trim()) ?
               (rawRequire as string[])
            :  undefined

      if (rawRequire !== undefined && !requireOneOf)
         errors.push(`"${name}": requireOneOf must be a non-empty array of strings when provided`)

      if (requireOneOf) {
         const paramKeys = new Set(Object.keys(params))
         for (const key of requireOneOf)
            if (!paramKeys.has(key))
               errors.push(`"${name}": requireOneOf key "${key}" is not in searchParams`)
      }

      entries.push({
         resourceType: rt,
         toolName: name,
         description: desc,
         supportsDirectRead: entry["supportsDirectRead"] as boolean,
         searchParams:
            Object.keys(params).length > 0 ?
               (params as Record<string, string>) :
               undefined,
         requireOneOf,
      })
   }

   return { entries, errors }
}
