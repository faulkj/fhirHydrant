import type { McpServer, RegisteredTool } from "@modelcontextprotocol/server"
import { z } from "zod"
import { config } from "../../config/index.ts"
import { makeOperateHandler } from "../handlers/operate.ts"
import { inputDescription } from "../../fhir/model/input-descriptions.ts"
import { readOnlyAnnotations, writeAnnotations } from "../annotations.ts"
import { fhirOutputSchema } from "../output.ts"

/** Registers the operate MCP tool with a dynamic description built from the enabled catalog; returns its handle. */
export const addOperate = (
   server: McpServer, enabledOps: OperationDefinition[],
): RegisteredTool => {
   const
      opSummaries = enabledOps.map((o) => {
         const
            target = o.resource ?? inputDescription("operate.anyResource"),
            level = o.level.join("/")
         return `${o.key} (${target} ${level}, ${o.method})`
      }),

      description = [
         inputDescription("operate.descriptionPrefix"),
         opSummaries.join(", "),
         inputDescription("operate.descriptionSuffix"),
      ].join(""),
      annotations = enabledOps.every((o) => o.method === "GET")
         ? readOnlyAnnotations
         : writeAnnotations(false, false),

      shape: Record<string, z.ZodTypeAny> = {
         operation: z.string().describe(inputDescription("operate.operation")),
      }

   shape["resourceType"] = z.string().optional().describe(inputDescription("operate.resourceType"))
   shape["id"] = z.string().optional().describe(inputDescription("operate.id"))
   shape["params"] = z.object({}).passthrough().optional().describe(inputDescription("operate.params"))
   shape["body"] = z.string().optional().describe(inputDescription("operate.body"))
   shape["fhirpath"] = z.string().optional().describe(inputDescription("operate.fhirpath"))
   if (config.responseMode !== "compact-locked")
      shape["responseMode"] = z.enum(["compact", "full"]).optional().describe(inputDescription("operate.responseMode"))

   return server.registerTool(
      "operate",
      { title: inputDescription("operate.title"), description, inputSchema: z.object(shape), outputSchema: fhirOutputSchema, annotations },
      makeOperateHandler(enabledOps),
   )
}
