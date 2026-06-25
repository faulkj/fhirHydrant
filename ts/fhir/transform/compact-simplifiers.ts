const pick = (obj: Record<string, unknown>, keys: string[]): Record<string, unknown> | undefined => {
   const out: Record<string, unknown> = {}
   let any = false
   for (const k of keys) {
      const v = obj[k]
      if (v !== undefined && v !== null) out[k] = v, any = true
   }
   return any ? out : undefined
}

const
   simplifyCoding = (v: Record<string, unknown>) => pick(v, ["code", "display"]),

   quantitySimplifier = (v: Record<string, unknown>) => pick(v, ["value", "unit"]),

   SIMPLIFIERS: Record<string, (v: Record<string, unknown>) => unknown> = {
      CodeableConcept: (v) => {
         const
            coding = Array.isArray(v.coding)
               ? v.coding.map((c: Record<string, unknown>) => simplifyCoding(c)).filter(Boolean)
               : undefined,
            text = v.text,
            textIsDup = coding?.length === 1 && text === (coding[0] as Record<string, unknown>).display
         if (!coding?.length && !text) return undefined
         const out: Record<string, unknown> = {}
         coding?.length && (out.coding = coding)
         text && !textIsDup && (out.text = text)
         return out
      },
      Coding: simplifyCoding,
      Reference: (v) =>
         typeof v.reference === "string"
            ? v.reference
            : pick(v, ["display", "identifier"]),
      Identifier: (v) => pick(v, ["system", "value"]),
      HumanName: (v) => pick(v, ["family", "given", "text"]),
      Address: (v) => pick(v, ["line", "city", "state", "postalCode"]),
      ContactPoint: (v) => pick(v, ["system", "value"]),
      Period: (v) => pick(v, ["start", "end"]),
      CodeableReference: (v) => {
         const
            ref = typeof v.reference === "object" && v.reference ? SIMPLIFIERS.Reference(v.reference as Record<string, unknown>) : undefined,
            concept = typeof v.concept === "object" && v.concept ? SIMPLIFIERS.CodeableConcept(v.concept as Record<string, unknown>) : undefined
         if (!ref && !concept) return undefined
         const out: Record<string, unknown> = {}
         ref !== undefined && (out.reference = ref)
         concept !== undefined && (out.concept = concept)
         return out
      },
   }

/** Infers a compact primitive representation from object shape alone. */
export const inferByShape = (v: Record<string, unknown>): unknown => {
   if (Array.isArray(v.coding) || (typeof v.text === "string" && v.coding === undefined && v.system === undefined))
      return SIMPLIFIERS.CodeableConcept(v)
   if (typeof v.value === "number" && typeof v.unit === "string")
      return quantitySimplifier(v)
   if (typeof v.system === "string" && (typeof v.code === "string" || typeof v.display === "string"))
      return simplifyCoding(v)
   if (typeof v.reference === "string")
      return SIMPLIFIERS.Reference(v)
   if ((typeof v.reference === "object" && v.reference) || (typeof v.concept === "object" && v.concept))
      return SIMPLIFIERS.CodeableReference(v)
   return undefined
}

/** Compacts an object using known FHIR type simplifiers. */
export const simplifyByType = (
   type: string | undefined,
   value: Record<string, unknown>,
   isType: (type: string | undefined, ancestor: string) => boolean,
): unknown => {
   if (!type) return inferByShape(value)
   if (SIMPLIFIERS[type]) return SIMPLIFIERS[type](value)
   if (isType(type, "Quantity")) return quantitySimplifier(value)
   return undefined
}
