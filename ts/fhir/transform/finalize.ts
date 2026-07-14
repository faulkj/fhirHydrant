import messages from "../../../config/messages/core.json" with { type: "json" }
import { config } from "../../config/index.ts"
import { serializeEnvelope } from "./serialize.ts"
import { tryChunkBundle } from "./bundle-chunks.ts"

/**
 * Serializes → measures → applies the byte limit to an envelope.
 * Over-limit Bundles are chunked (data preserved); otherwise data is dropped
 * and the envelope is marked truncated. Never returns isError — truncation is
 * a successful-but-partial result so the output schema still validates.
 */
export const finalizeEnvelope = (
   envelope: FhirEnvelope, rawBundle?: unknown,
): { envelope: FhirEnvelope, text: string, isError: boolean } => {
   const
      text = serializeEnvelope(envelope),
      bytes = Buffer.byteLength(text, "utf8")
   if (bytes <= config.fhirMaxResponseBytes)
      return { envelope, text, isError: false }

   const chunkable = rawBundle ?? (envelope.isBundle ? envelope.data : undefined)
   if (chunkable) {
      const chunked = tryChunkBundle(chunkable, envelope, config.fhirMaxResponseBytes)
      if (chunked)
         return { envelope: chunked.envelope, text: serializeEnvelope(chunked.envelope), isError: false }
   }

   const truncated: FhirEnvelope = {
      ...envelope,
      status: "truncated",
      truncated: true,
      data: undefined,
      notes: [...envelope.notes, messages.responseTooLarge
         .replace("{bytes}", String(bytes))
         .replace("{limit}", String(config.fhirMaxResponseBytes))],
   }
   return { envelope: truncated, text: serializeEnvelope(truncated), isError: false }
}
