import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { config } from "../config.ts"
import { getDefinitions } from "./definitions.ts"
import { createFhirClient } from "./client.ts"

const
   retryable = (err: unknown): boolean => {
      if (err instanceof Error) {
         const msg = err.message.toLowerCase()
         return (
            msg.includes("econnreset") ||
            msg.includes("epipe") ||
            msg.includes("etimedout") ||
            msg.includes("socket hang up") ||
            msg.includes("forcibly closed") ||
            msg.includes("network") ||
            msg.includes("fetch failed")
         )
      }
      return false
   },
   withRetry = async <T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> => {
      for (let i = 0; i < attempts; i++) {
         try {
            return await fn()
         } catch (err) {
            if (i + 1 >= attempts || !retryable(err)) throw err
            const delay = 1000 * 2 ** i
            console.warn(`[fhir] ${label} transient error, retrying in ${delay}ms (${i + 1}/${attempts})`)
            await new Promise((r) => setTimeout(r, delay))
         }
      }
      throw new Error("unreachable")
   }

const
   buildSearchUrl = (
      resourceType: string,
      args: Record<string, unknown>,
   ): string => {
      const params = new URLSearchParams()
      for (const [key, val] of Object.entries(args))
         val !== undefined && val !== "" && params.append(key, String(val))
      const qs = params.toString()
      return qs ? `${resourceType}?${qs}` : resourceType
   },
   isDirectRead = (
      args: Record<string, unknown>,
      supportsDirectRead: boolean,
   ): string | undefined => {
      if (!supportsDirectRead) return undefined
      const id =
         typeof args["_id"] === "string" && args["_id"] ?
            args["_id"]
         :  undefined
      if (!id) return undefined
      const otherKeys = Object.entries(args).some(
         ([k, v]) => k !== "_id" && v !== undefined && v !== "",
      )
      return otherKeys ? undefined : id
   },
   makeHandler =
      (def: ResourceDefinition) => async (args: Record<string, unknown>) => {
         try {
            const
               client = createFhirClient(),
               directId = isDirectRead(args, def.supportsDirectRead),
               url =
                  directId ?
                     `${def.resourceType}/${directId}`
                  :  buildSearchUrl(def.resourceType, args),
               op = directId ? "read" : "search"

            config.debug ?
               console.log(`[fhir] ${def.resourceType} ${op} → ${url}`)
            :  console.log(`[fhir] ${def.resourceType} ${op}`)

            const
               result = await withRetry(`${def.resourceType} ${op}`, () => client.request(url)),
               summary =
                  (
                     result &&
                     typeof result === "object" &&
                     (result as Record<string, unknown>).resourceType ===
                        "Bundle"
                  ) ?
                     `Bundle total=${(result as Record<string, unknown>).total ?? "?"}`
                  :  ((result as Record<string, unknown>)?.resourceType ??
                     "ok")
            console.log(`[fhir] ${def.resourceType} OK ${summary}`)
            return {
               content: [
                  {
                     type: "text" as const,
                     text: JSON.stringify(result, null, 2),
                  },
               ],
            }
         } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[fhir] ${def.resourceType} ERR ${message}`)
            return {
               content: [{ type: "text" as const, text: message }],
               isError: true,
            }
         }
      }

/** Registers an MCP tool for every ResourceDefinition in the current snapshot. */
export const registerAll = (server: McpServer): void => {
   for (const def of getDefinitions())
      server.registerTool(
         def.toolName,
         { description: def.description, inputSchema: def.searchSchema },
         makeHandler(def),
      )
}

const validatePageUrl = (url: string): string => {
   const
      baseHref = config.fhirServerUrl.replace(/\/?$/, "/"),
      serverUrl = new URL(baseHref),
      nextUrl = new URL(url, baseHref)

   if (nextUrl.origin !== serverUrl.origin)
      throw new Error(
         `Pagination URL origin "${nextUrl.origin}" does not match FHIR server origin "${serverUrl.origin}"`,
      )

   return nextUrl.toString()
}

/** Registers built-in infrastructure tools (e.g. pagination) on the server. */
export const registerCoreTools = (server: McpServer): void => {
   server.registerTool(
      "fhir_fetch_page",
      {
         description:
            "Fetch a single page of FHIR Bundle results using a pagination URL. " +
            'The url must come from a FHIR Bundle\'s link array where relation is "next". ' +
            "Do not construct pagination URLs manually — only use links returned by the FHIR server.",
         inputSchema: z.object({
            url: z
               .string()
               .describe(
                  "Pagination URL from a FHIR Bundle link[rel=next].url value",
               ),
         }),
      },
      async (args: { url: string }) => {
         try {
            const
               validatedUrl = validatePageUrl(args.url),
               client = createFhirClient()

            config.debug ?
               console.log(`[fhir] fetch_page → ${validatedUrl}`)
            :  console.log("[fhir] fetch_page")

            const
               result = await withRetry("fetch_page", () => client.request(validatedUrl)),
               summary =
                  (
                     result &&
                     typeof result === "object" &&
                     (result as Record<string, unknown>).resourceType ===
                        "Bundle"
                  ) ?
                     `Bundle total=${(result as Record<string, unknown>).total ?? "?"}`
                  :  "ok"
            console.log(`[fhir] fetch_page OK ${summary}`)
            return {
               content: [
                  {
                     type: "text" as const,
                     text: JSON.stringify(result, null, 2),
                  },
               ],
            }
         } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[fhir] fetch_page ERR ${message}`)
            return {
               content: [
                  {
                     type: "text" as const,
                     text: `${message}\n\nRetry with the same url to resume from this page.`,
                  },
               ],
               isError: true,
            }
         }
      },
   )
}
