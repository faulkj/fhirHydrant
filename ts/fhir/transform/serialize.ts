/** Serializes an envelope to the tool text payload — minified when compacted, pretty when full. */
export const serializeEnvelope = (envelope: FhirEnvelope): string =>
   JSON.stringify(envelope, null, envelope.compacted ? 0 : 2)
