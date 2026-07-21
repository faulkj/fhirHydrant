/** Message catalog domain names — one JSON file per domain under config/messages/. */
type MessageCatalog = "core" | "bundle" | "operations" | "write" | "terminology" | "artifact"

/** Exact key→string shape of each message catalog, derived from the packaged JSON defaults. */
interface MessageCatalogs {
   core: typeof import("../config/messages/core.json")
   bundle: typeof import("../config/messages/bundle.json")
   operations: typeof import("../config/messages/operations.json")
   write: typeof import("../config/messages/write.json")
   terminology: typeof import("../config/messages/terminology.json")
   artifact: typeof import("../config/messages/artifact.json")
}

/** Flat string-map config files loaded through the text overlay loader (non-message). */
type TextMap = Record<string, string>
