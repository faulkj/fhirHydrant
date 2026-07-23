import fhirStarter from "@fhirstarter/backend"
import { get, opt } from "./parsers.ts"

const
   decodePem = (raw: string): string =>
      Buffer.from(raw.replace(/\s/g, ""), "base64").toString("utf-8").trim(),

   deriveKid = (pem: string): string =>
      fhirStarter.thumbprint(pem).slice(0, 12),

   parseKey = (pem: string, envVar: string): KeyPair => {
      try {
         return { kid: deriveKid(pem), privateKey: pem }
      } catch (e) {
         throw new Error(`${envVar}: ${(e as Error).message} — ensure the value is a base64-encoded PKCS#8 PEM (RSA or EC P-384)`)
      }
   }

/** Parses FHIR_ACTIVE_KEY and optional FHIR_RETIRED_KEYS into key pairs with thumbprint-derived kids. */
export const parseKeys = (): { activeKey: KeyPair, retiredKeys: KeyPair[] } => {
   const
      activePem = decodePem(get("FHIR_ACTIVE_KEY")),
      activeKey = parseKey(activePem, "FHIR_ACTIVE_KEY"),
      rawRetired = opt("FHIR_RETIRED_KEYS"),
      retiredKeys: KeyPair[] = rawRetired
         ? rawRetired.split(",").map((s) => s.trim()).filter(Boolean)
            .map((b64, i) => parseKey(decodePem(b64), `FHIR_RETIRED_KEYS[${i + 1}]`))
         : [],
      kids = new Set<string>([activeKey.kid])
   for (const { kid } of retiredKeys) {
      if (kids.has(kid))
         throw new Error(`Duplicate derived kid "${kid}" — the same key appears in both FHIR_ACTIVE_KEY and FHIR_RETIRED_KEYS`)
      kids.add(kid)
   }
   return { activeKey, retiredKeys }
}
