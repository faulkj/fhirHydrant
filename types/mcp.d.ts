/** A single parameter definition in config/core-tools.json. */
interface CoreToolParam {
   type: "string" | "boolean"
   optional?: boolean
   description: string
}

/** A single entry in config/core-tools.json. */
interface CoreToolDef {
   name: string
   description: string
   params: Record<string, CoreToolParam>
}

/** Parsed stats from a FHIR Bundle response — shared between response notes and audit. */
interface BundleStats {
   entries: number
   total: number | undefined
   jsonBytes: number
   nextUrl: string | undefined
}
