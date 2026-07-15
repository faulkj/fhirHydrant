import { config } from "../../config/index.ts"
import { log } from "../../log.ts"
import { createFhirClient } from "../auth/client.ts"
import { withRetry } from "../utils.ts"
import { metadataSignature } from "./metadata-signature.ts"

const stringsFrom = (value: unknown, key?: string): string[] =>
   Array.isArray(value)
      ? value.map((entry) => key ? (entry as Record<string, unknown>)[key] : entry as string).filter(Boolean) as string[]
      : []

let
   cache: CapabilitySummary | null = null,
   resourceIndex = new Map<string, ResourceMeta>(),
   systemInteractions = new Set<string>(),
   skipped: CapabilitySummary["skippedTools"] = [],
   signature = "",
   onChange: (() => void) | undefined

/** Registers the callback invoked after a fetched CapabilityStatement materially changes the gate-relevant surface. */
export const setMetadataChangeHandler = (handler: () => void): void => {
   onChange = handler
}

/** Fetches and caches the FHIR server's CapabilityStatement. Non-throwing. */
export const fetchMetadata = async (): Promise<void> => {
   try {
      const
         client = createFhirClient(),
         raw = await withRetry(
            "metadata",
            (signal) => client.request({ url: "metadata", signal }),
            3,
            config.fhirRequestTimeoutMs,
         ) as Record<string, unknown>

      if (raw?.resourceType !== "CapabilityStatement") {
         log.warn("🏥 Response is not a CapabilityStatement — skipping metadata gating")
         return
      }

      const
         restEntries = Array.isArray(raw.rest) ? raw.rest as Array<Record<string, unknown>> : [],
         serverRest = restEntries.find((r) => r.mode === "server") ?? restEntries[0]

      if (!serverRest) {
         log.warn("🏥 No rest entry found in CapabilityStatement — skipping metadata gating")
         return
      }

      const
         resources = Array.isArray(serverRest.resource) ? serverRest.resource as Array<Record<string, unknown>> : [],
         sysInteractions = new Set<string>(
            stringsFrom(serverRest.interaction, "code"),
         ),
         newIndex = new Map<string, ResourceMeta>(),
         summaryResources: CapabilitySummary["resources"] = []

      for (const res of resources) {
         const type = res.type as string | undefined
         if (!type) continue

         const
            interactions = new Set<string>(stringsFrom(res.interaction, "code")),
            searchParams = new Set<string>(stringsFrom(res.searchParam, "name")),
            includes = stringsFrom(res.searchInclude),
            revincludes = stringsFrom(res.searchRevInclude),
            operations = stringsFrom(res.operation, "name")

         newIndex.set(type, { interactions, searchParams, includes, revincludes, operations })
         summaryResources.push({
            type,
            interactions: [...interactions],
            searchParams: [...searchParams],
            operations,
            includes,
            revincludes,
         })
      }

      const nextSignature = metadataSignature(summaryResources, [...sysInteractions])
      resourceIndex = newIndex
      systemInteractions = sysInteractions
      cache = {
         serverUrl: config.fhirServerUrl,
         fetchedAt: new Date().toISOString(),
         mode: config.metadataMode,
         systemInteractions: [...sysInteractions],
         resources: summaryResources,
         skippedTools: skipped,
      }
      log.info(`🏥 Loaded CapabilityStatement — ${summaryResources.length} resource types`)

      if (nextSignature === signature) return
      const first = signature === ""
      signature = nextSignature
      if (first || !onChange) return
      // A failed refresh handler must not masquerade as a metadata fetch failure.
      try { onChange() }
      catch (err) { log.error("📋 Registration refresh failed after metadata change:", err instanceof Error ? err.message : err) }
   } catch (err) {
      log.warn(
         "🏥 Could not fetch CapabilityStatement — skipping metadata gating:",
         err instanceof Error ? err.message : err,
      )
   }
}

/** Whether a cached CapabilityStatement is available. */
export const isMetadataAvailable = (): boolean => cache !== null

/** Returns the set of system-level interactions advertised (e.g. batch, transaction). */
export const getSystemInteractions = (): Set<string> => systemInteractions

/** Returns parsed metadata for a single resource type, or undefined. */
export const getResourceMeta = (resourceType: string): ResourceMeta | undefined =>
   resourceIndex.get(resourceType)

/** Returns the trimmed, JSON-serializable capability summary, or null. */
export const getCapabilitySummary = (): CapabilitySummary | null => {
   if (!cache) return null
   return { ...cache, skippedTools: skipped }
}

/** Updates the skipped-tools state. Called by mcp/validation.ts after filtering. */
export const setSkippedTools = (list: CapabilitySummary["skippedTools"]): void => {
   skipped = list
   if (cache) cache.skippedTools = list
}
