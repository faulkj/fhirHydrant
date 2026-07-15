import messages from "../../../config/messages/write.json" with { type: "json" }
import { config } from "../../config/index.ts"
import { withRetry, formatFhirError } from "../../fhir/utils.ts"

const fatalIssues = (outcome: Record<string, unknown>): string[] => {
   if (!outcome || outcome["resourceType"] !== "OperationOutcome" || !Array.isArray(outcome["issue"])) return []
   return (outcome["issue"] as Array<Record<string, unknown>>)
      .filter((i) => i["severity"] === "fatal" || i["severity"] === "error")
      .map((i) => String((i["details"] as Record<string, unknown>)?.["text"] ?? i["diagnostics"] ?? i["code"] ?? "error"))
}

/** Runs server-side `$validate` for a create/update; returns a failure message when the server reports fatal/error issues. */
export const serverValidate = async (
   client: FhirClient, def: ResourceDefinition, op: WriteAction, body: unknown, id: string | undefined,
): Promise<string | undefined> => {
   const
      mode = op === "create" ? "create" : "update",
      url = op === "update" && id
         ? `${def.resource}/${id}/$validate?mode=${mode}`
         : `${def.resource}/$validate?mode=${mode}`
   try {
      const
         outcome = await withRetry(`${def.resource} $validate`, (signal) => client.request({
            url, method: "POST", body: JSON.stringify(body),
            headers: { "Content-Type": "application/fhir+json" }, signal,
         }), 3, config.fhirRequestTimeoutMs) as Record<string, unknown>,
         issues = fatalIssues(outcome)
      return issues.length ? messages.validateServerFailed.replace("{issues}", issues.join("\n")) : undefined
   } catch (err) {
      return messages.validateServerFailed.replace("{issues}", formatFhirError(err).client)
   }
}
