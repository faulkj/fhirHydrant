import type { ToolAnnotations } from "@modelcontextprotocol/server"

/** Annotations for tools that only read data and never mutate server state. */
export const readOnlyAnnotations: ToolAnnotations = {
   readOnlyHint: true,
   idempotentHint: true,
   openWorldHint: false,
}

/** Builds annotations for tools that can mutate server state. */
export const writeAnnotations = (destructive: boolean, idempotent: boolean): ToolAnnotations => ({
   readOnlyHint: false,
   destructiveHint: destructive,
   idempotentHint: idempotent,
   openWorldHint: false,
})
