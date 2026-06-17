import messages from "../../../config/messages.json" with { type: "json" }
import { config } from "../../config.ts"
import { extractFhirPath, applyFhirPath } from "./fhirpath.ts"
import { extractResponseMode, resolveResponseMode, compact } from "./compact.ts"
import { bundleStats, responseNote } from "./response-notes.ts"
import { enforceByteLimit } from "../utils.ts"

/** Options for the shared response pipeline. */
interface PipelineOpts {
   args: Record<string, unknown>
   result: unknown
   bundleResponse: boolean
   defaultMode?: ResponseMode
}

/** Result from the response pipeline — ready to emit as MCP content. */
interface PipelineResult {
   text: string
   isError: boolean
   stats: BundleStats | undefined
   effectiveMode: ResponseMode
   compacted: boolean
   fhirpathFiltered: boolean
   fhirpathMatchCount: number
}

/** Applies FHIRPath, compact, byte-limit, and response notes to a FHIR response. */
export const applyResponsePipeline = (opts: PipelineOpts): PipelineResult | { error: string } => {
   const
      { args, result, bundleResponse, defaultMode } = opts,
      fhirpathExpr = extractFhirPath(args),
      explicit = extractResponseMode(args),
      resolved = resolveResponseMode(explicit, undefined)

   if (!resolved) return { error: "Invalid responseMode — must be \"compact\" or \"full\"" }

   const
      { effectiveMode, wasDefaulted } = resolved,
      mode = defaultMode && wasDefaulted ? defaultMode : effectiveMode

   let
      json = JSON.stringify(result, null, 2),
      stats = bundleResponse ? bundleStats(result, json) : undefined,
      filtered = false,
      matchCount = 0,
      compacted = false

   if (fhirpathExpr) {
      const fp = applyFhirPath(result, fhirpathExpr)
      if ("error" in fp) return { error: messages.fhirpathError.replace("{error}", fp.error) }
      filtered = true
      matchCount = fp.nodes.length
      json = JSON.stringify(fp.nodes, null, 2)
   }

   if (mode === "compact") {
      json = JSON.stringify(compact(JSON.parse(json)))
      compacted = true
   }

   const sourceBytes = Buffer.byteLength(json, "utf8")
   const notes = [
      bundleResponse && stats ? responseNote(result, json) : undefined,
      filtered ? messages.fhirpathFiltered.replace("{matchCount}", String(matchCount)).replace("{sourceBytes}", String(sourceBytes)) : undefined,
      wasDefaulted && compacted ? messages.responseModeCompact : undefined,
   ].filter(Boolean)

   const
      prefix = notes.length ? notes.join("\n") + "\n\n" : "",
      shaped = enforceByteLimit(`${prefix}${json}`, config.fhirMaxResponseBytes)

   return {
      text: shaped.text,
      isError: !!shaped.isError,
      stats,
      effectiveMode: mode,
      compacted,
      fhirpathFiltered: filtered,
      fhirpathMatchCount: matchCount,
   }
}
