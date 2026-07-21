import { loadMessages } from "../../config/text.ts"

const messages = loadMessages("bundle")

/** Set of write-type Bundle entry actions. */
export const WRITE_ACTIONS = new Set<ToolAction>(["create", "update", "patch", "delete"])

/** Maps write actions to their CapabilityStatement interaction names. */
export const WRITE_INTERACTION: Record<WriteAction, string> = {
   create: "create", update: "update", patch: "patch", delete: "delete",
}

/** Builds a BundleGuardResult error response. */
export const err = (text: string): BundleGuardResult =>
   ({ ok: false, response: { content: [{ type: "text" as const, text }], isError: true } })

/** Error for unsupported bundle entry patterns. */
export const unsupported = (i: number) => err(messages.bundleEntryUnsupported.replace("{index}", String(i)))

/** Error for blocked bundle entries with a reason. */
export const blocked = (i: number, reason: string) =>
   err(messages.bundleEntryBlocked.replace("{index}", String(i)).replace("{reason}", reason))

/** Resolves a Bundle entry's HTTP method + hasId to a ToolAction. */
export const resolveAction = (method: string, hasId: boolean): ToolAction | undefined => {
   if (method === "GET") return hasId ? "read" : "search"
   if (method === "POST" && !hasId) return "create"
   if (method === "PUT" && hasId) return "update"
   if (method === "PATCH" && hasId) return "patch"
   if (method === "DELETE" && hasId) return "delete"
   return undefined
}
