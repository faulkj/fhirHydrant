import { config } from "../../config/index.ts"
import r4 from "fhirpath/fhir-context/r4/index.js"
import r5 from "fhirpath/fhir-context/r5/index.js"

/** The fhirpath model context matching the configured FHIR_VERSION. R4B maps to R4. */
export const fhirModel = config.fhirVersion === "R5" ? r5 : r4

/** Human-readable label for the active FHIR version (e.g. "R4B (using R4 model)"). */
export const fhirVersionLabel = config.fhirVersion === "R4B"
   ? "R4B (using R4 model)"
   : config.fhirVersion
