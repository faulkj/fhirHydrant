import { compactNode } from "./compact-model.ts"

export const extractResponseMode = (args: Record<string, unknown>): ResponseMode | undefined => {
   const raw = args["responseMode"]
   delete args["responseMode"]
   return raw === "compact" || raw === "full" ? raw : undefined
}

export const compact = (data: unknown): unknown => {
   if (!data || typeof data !== "object") return data
   const r = data as Record<string, unknown>
   if (r.resourceType === "Bundle") {
      const
         entries = Array.isArray(r.entry)
            ? (r.entry as Record<string, unknown>[])
               .map((e) => {
                  const compacted = e.resource ? compactNode(e.resource, String((e.resource as Record<string, unknown>).resourceType), true) : undefined
                  return compacted !== undefined ? { resource: compacted } : undefined
               })
               .filter(Boolean)
            : undefined,
         out: Record<string, unknown> = { resourceType: "Bundle" }
      r.type !== undefined && (out.type = r.type)
      r.total !== undefined && (out.total = r.total)
      r.link !== undefined && (out.link = r.link)
      entries?.length && (out.entry = entries)
      return out
   }
   if (typeof r.resourceType === "string")
      return compactNode(data, r.resourceType as string, true) ?? data
   return data
}
