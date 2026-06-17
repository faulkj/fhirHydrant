const
   VALID_LEVELS = new Set(["system", "type", "instance"]),
   VALID_METHODS = new Set(["GET", "POST"])

const text = (v: unknown): string | undefined =>
   typeof v === "string" && v.trim() ? v.trim() : undefined

/** Validates a single operation entry from config/operations.json. Returns the entry or pushes errors. */
export const validateOperationEntry = (
   value: unknown, seen: Set<string>, errors: string[],
): OperationDefinitionRaw | undefined => {
   if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push("operation entries must be objects")
      return undefined
   }
   const e = value as Record<string, unknown>

   const
      key = text(e["key"]),
      operation = text(e["operation"]),
      description = text(e["description"]),
      method = text(e["method"]),
      auditOperation = text(e["auditOperation"])

   if (!key || !operation || !description || !method || !auditOperation) {
      errors.push(`Operation "${key ?? "(missing)"}": requires key, operation, description, method, auditOperation`)
      return undefined
   }
   if (!operation.startsWith("$")) {
      errors.push(`"${key}": operation must start with $ (got "${operation}")`)
      return undefined
   }
   if (!VALID_METHODS.has(method)) {
      errors.push(`"${key}": method must be GET or POST`)
      return undefined
   }
   if (seen.has(key)) {
      errors.push(`Duplicate operation key "${key}"`)
      return undefined
   }
   seen.add(key)

   const level = e["level"]
   if (!Array.isArray(level) || level.length === 0 || !level.every((l) => VALID_LEVELS.has(l as string))) {
      errors.push(`"${key}": level must be a non-empty array of system|type|instance`)
      return undefined
   }

   if (typeof e["bundleResponse"] !== "boolean") {
      errors.push(`"${key}": bundleResponse must be a boolean`)
      return undefined
   }
   if (typeof e["affectsState"] !== "boolean") {
      errors.push(`"${key}": affectsState must be a boolean`)
      return undefined
   }

   const params = e["params"]
   if (!params || typeof params !== "object" || Array.isArray(params)) {
      errors.push(`"${key}": params must be an object`)
      return undefined
   }

   const requiresOneOf = e["requiresOneOf"]
   if (requiresOneOf !== undefined) {
      if (!Array.isArray(requiresOneOf) || !requiresOneOf.every((g) =>
         Array.isArray(g) && g.length > 0 && g.every((k: unknown) => typeof k === "string"))) {
         errors.push(`"${key}": requiresOneOf must be string[][]`)
         return undefined
      }
      const paramKeys = new Set(Object.keys(params as object))
      for (const group of requiresOneOf as string[][])
         for (const k of group)
            if (!paramKeys.has(k))
               errors.push(`"${key}": requiresOneOf references unknown param "${k}"`)
   }

   return value as unknown as OperationDefinitionRaw
}

/** Validates the full operations.json array. */
export const validateOperations = (raw: unknown): { entries: OperationDefinitionRaw[]; errors: string[] } => {
   if (!Array.isArray(raw)) return { entries: [], errors: ["config/operations.json must be an array"] }
   const
      errors: string[] = [],
      seen = new Set<string>(),
      entries = raw
         .map((v) => validateOperationEntry(v, seen, errors))
         .filter((v): v is OperationDefinitionRaw => v !== undefined)
   return { entries, errors }
}
