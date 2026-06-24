import messages from "../../../config/messages/core.json" with { type: "json" }
import { config } from "../../config.ts"
import { isChunkUrl } from "../../fhir/transform/bundle-chunks.ts"

/** Validates a pagination URL against the configured FHIR server origin and path prefixes. Chunk URLs bypass validation. */
export const validatePageUrl = (url: string): string => {
   if (isChunkUrl(url)) return url
   const
      baseHref = config.fhirServerUrl.replace(/\/?$/, "/"),
      serverUrl = new URL(baseHref),
      nextUrl = new URL(url, baseHref)

   if (nextUrl.origin !== serverUrl.origin)
      throw new Error(messages.paginationOriginMismatch
         .replace("{actual}", nextUrl.origin)
         .replace("{expected}", serverUrl.origin))

   const
      basePath = serverUrl.pathname.replace(/\/*$/, "/"),
      prefixes = [...(basePath.length > 1 ? [basePath] : []), ...config.paginationPaths]
   if (prefixes.length && !prefixes.some((p) => nextUrl.pathname === p.slice(0, -1) || nextUrl.pathname.startsWith(p)))
      throw new Error(messages.paginationPathMismatch
         .replace("{actual}", nextUrl.pathname))
   return nextUrl.toString()
}
