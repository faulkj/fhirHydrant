declare module "content-disposition" {
   /** Parsed Content-Disposition header — type plus its parameters (e.g. filename). */
   interface ContentDisposition {
      type: string
      parameters: Record<string, string>
   }

   /** Parses a Content-Disposition header value (RFC 6266), decoding extended filename* values. */
   export function parse(header: string): ContentDisposition
}
