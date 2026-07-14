import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { config } from "../../config/index.ts"
import { makeOperateHandler } from "../handlers/operate.ts"
import { readOnlyAnnotations, writeAnnotations } from "../annotations.ts"
import { fhirOutputSchema } from "../output.ts"

/** Registers the operate MCP tool with a dynamic description built from the enabled catalog. */
export const addOperate = (
   server: McpServer, enabledOps: OperationDefinition[],
): void => {
   const
      opSummaries = enabledOps.map((o) => {
         const
            target = o.resource ?? "any resource",
            level = o.level.join("/")
         return `${o.key} (${target} ${level}, ${o.method})`
      }),

      description = [
         "Invoke a FHIR named operation. Available operations: ",
         opSummaries.join(", "),
         ". Call capabilities for full parameter details.",
      ].join(""),
      annotations = enabledOps.every((o) => o.method === "GET")
         ? readOnlyAnnotations
         : writeAnnotations(false, false),

      shape: Record<string, z.ZodTypeAny> = {
         operation: z.string().describe("Operation catalog key (e.g. everything, lastn, validate, docref). Leading $ is optional."),
      }

   shape["resourceType"] = z.string().optional().describe("FHIR resource type — required for polymorphic operations like $validate")
   shape["id"] = z.string().optional().describe("Resource ID — required for instance-level operations like $everything")
   shape["params"] = z.object({}).passthrough().optional().describe("Operation parameters as key-value pairs")
   shape["body"] = z.string().optional().describe("FHIR JSON body for POST operations (e.g. resource to validate)")
   shape["fhirpath"] = z.string().optional().describe("FHIRPath expression for client-side projection of the response")
   if (config.responseMode !== "compact-locked")
      shape["responseMode"] = z.string().optional().describe("Response shape: compact or full")

   server.registerTool(
      "operate",
      { description, inputSchema: z.object(shape), outputSchema: fhirOutputSchema, annotations },
      makeOperateHandler(enabledOps),
   )
}
