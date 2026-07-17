import { parse as parseDisposition } from "content-disposition"

const
   TEXT_SUBTYPES = new Set(["json", "xml", "csv", "ndjson", "rtf", "html", "javascript", "x-ndjson"]),
   EXT_BY_TYPE: Record<string, string> = {
      "application/pdf": "pdf", "application/json": "json", "application/xml": "xml",
      "application/zip": "zip", "application/dicom": "dcm", "application/octet-stream": "bin",
      "text/plain": "txt", "text/html": "html", "text/csv": "csv", "text/rtf": "rtf",
      "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "audio/mpeg": "mp3", "video/mp4": "mp4",
   },
   MEDIA_TOKEN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/,
   WIN_INVALID = /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e]/g,
   RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

/** Preserves the valid server Content-Type (with safe params); falls back to octet-stream. */
export const preserveMime = (header: string | null, jsonBinaryType?: string): string => {
   const candidate = (jsonBinaryType ?? header ?? "").trim()
   if (!candidate) return "application/octet-stream"
   return MEDIA_TOKEN.test(baseType(candidate)) ? candidate : "application/octet-stream"
}

/** Lowercased base media type (no parameters) for classification and extension inference. */
export const baseType = (mime: string): string =>
   mime.split(";")[0].trim().toLowerCase()

/** True when a media type should be emitted as MCP text (subject to a UTF-8 check by the caller). */
export const isTextualType = (mime: string): boolean => {
   const base = baseType(mime)
   if (base.startsWith("text/")) return true
   const [type, subtype = ""] = base.split("/")
   if (type !== "application") return false
   return subtype.endsWith("+json") || subtype.endsWith("+xml") || TEXT_SUBTYPES.has(subtype)
}

const extensionFor = (mime: string): string | undefined => {
   const base = baseType(mime)
   if (EXT_BY_TYPE[base]) return EXT_BY_TYPE[base]
   const subtype = base.split("/")[1] ?? ""
   if (subtype.endsWith("+json")) return "json"
   if (subtype.endsWith("+xml")) return "xml"
   return undefined
}

const sanitizeName = (raw: string): string | undefined => {
   const
      base = raw.replace(/^.*[\\/]/, "").replace(WIN_INVALID, "").replace(/[. ]+$/, "").trim(),
      clean = base === "." || base === ".." ? "" : base
   if (!clean || RESERVED.test(clean)) return undefined
   return Buffer.byteLength(clean, "utf8") > 200 ? clean.slice(0, 120) : clean
}

const fromDisposition = (header: string | null): string | undefined => {
   if (!header) return undefined
   try {
      const p = parseDisposition(header).parameters
      return sanitizeName(p["filename*"] ?? p.filename ?? "")
   } catch { return undefined }
}

/** Chooses a safe filename: sanitized Content-Disposition, else a neutral source/MIME-derived name. */
export const resolveFilename = (
   disposition: string | null, mime: string, source: ArtifactSource,
): string => {
   const fromHeader = fromDisposition(disposition)
   if (fromHeader) return fromHeader
   const
      stem = [source.resource, source.operation, source.id].filter(Boolean).join("-") || "artifact",
      ext = extensionFor(mime)
   return ext ? `${sanitizeName(stem) ?? "artifact"}.${ext}` : (sanitizeName(stem) ?? "artifact")
}
