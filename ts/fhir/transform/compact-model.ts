import { fhirModel, fhirVersionLabel } from "./fhir-model.ts"
import { log } from "../../log.ts"
import { simplifyByType } from "./compact-simplifiers.ts"

/** Recursively compacts a FHIR value using type metadata and registered simplifiers. */
export const compactNode = (value: unknown, path: string, isRoot: boolean): unknown => {
   if (value === null || value === undefined) return undefined
   if (Array.isArray(value)) {
      const arr = value.map((item, i) => compactNode(item, path, false)).filter((v) => v !== undefined)
      return arr.length ? arr : undefined
   }
   if (typeof value !== "object") return value

   const
      obj = value as Record<string, unknown>,
      type = resolveType(path),
      simplified = simplifyByType(type, obj, isType)
   if (simplified !== undefined) return simplified

   const out: Record<string, unknown> = {}
   for (const [key, val] of Object.entries(obj)) {
      if (NOISE.has(key)) continue
      if (key.startsWith("_")) continue
      if (key === "id" && !isRoot) continue
      if (key === "resourceType") {
         out[key] = val
         continue
      }

      const
         childPath = `${path}.${key}`,
         childType = resolveType(childPath),
         compacted = compactNode(val, childType && !isType(childType, "BackboneElement") ? childType : childPath, false)
      if (compacted !== undefined) out[key] = compacted
   }
   return Object.keys(out).length ? out : undefined
}

const
   raw = fhirModel as Record<string, unknown>,
   p2t = raw.path2TypeWithoutElements as Record<string, string | string[]> | undefined,
   t2p = raw.type2Parent as Record<string, string> | undefined,
   modelOk = !!(p2t && t2p)

modelOk || log.warn(`⚠️ fhirpath model metadata unavailable for ${fhirVersionLabel} — compact will use key-only stripping`)

const
   NOISE = new Set(["meta", "text", "contained", "extension", "modifierExtension", "implicitRules", "language"]),

   resolveType = (path: string): string | undefined => {
      if (!modelOk) return undefined
      const types = p2t![path]
      if (types) return Array.isArray(types) ? types[0] : types
      if (t2p![path]) return path
      return undefined
   },

   isType = (type: string | undefined, ancestor: string): boolean => {
      if (!type || !modelOk) return false
      let cur: string | undefined = type
      while (cur) {
         if (cur === ancestor) return true
         cur = t2p![cur]
      }
      return false
   }
