import { createHash } from "node:crypto"

const
   decoder = new TextDecoder("utf-8", { fatal: true }),
   base64Body = /^[A-Za-z0-9+/]*={0,2}$/

/** Drains a raw response body once under the byte limit; never returns partial content. */
export const drainBody = async (
   body: ReadableStream<Uint8Array> | null, limit: number,
): Promise<DrainResult> => {
   if (!body) return { ok: false, code: "unreadable-body", message: "Response body was empty or already consumed" }
   const chunks: Uint8Array[] = []
   let total = 0
   let over = false
   try {
      for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
         total += chunk.byteLength
         if (total > limit) { over = true; break }
         chunks.push(chunk)
      }
   } catch (err) {
      return { ok: false, code: "unreadable-body", message: err instanceof Error ? err.message : String(err) }
   }
   if (over) return { ok: false, code: "over-limit", message: `Artifact exceeds the ${limit}-byte limit` }
   const out = new Uint8Array(total)
   let offset = 0
   for (const c of chunks) { out.set(c, offset); offset += c.byteLength }
   return { ok: true, bytes: out }
}

/** Strictly decodes JSON FHIR Binary base64 to bytes, enforcing the byte limit before allocation. */
export const decodeBase64 = (data: string, limit: number): DrainResult => {
   const stripped = data.replace(/[\r\n\t ]/g, "")
   if (!base64Body.test(stripped) || stripped.length % 4 !== 0)
      return { ok: false, code: "malformed-base64", message: "Binary.data is not valid base64" }
   if (Math.floor(stripped.length / 4) * 3 > limit + 3)
      return { ok: false, code: "over-limit", message: `Artifact exceeds the ${limit}-byte limit` }
   const buf = Buffer.from(stripped, "base64")
   if (buf.toString("base64").replace(/=+$/, "") !== stripped.replace(/=+$/, ""))
      return { ok: false, code: "malformed-base64", message: "Binary.data is not canonical base64" }
   if (buf.byteLength > limit)
      return { ok: false, code: "over-limit", message: `Artifact exceeds the ${limit}-byte limit` }
   return { ok: true, bytes: new Uint8Array(buf) }
}

/** Returns the UTF-8 text when bytes decode losslessly, else undefined (caller keeps them as a blob). */
export const asUtf8 = (bytes: Uint8Array): string | undefined => {
   try { return decoder.decode(bytes) }
   catch { return undefined }
}

/** Lowercase hex SHA-256 of the decoded bytes. */
export const checksum = (bytes: Uint8Array): string =>
   createHash("sha256").update(bytes).digest("hex")
