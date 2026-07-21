import { loadText } from "../../config/text.ts"

const descriptions = loadText("messages/input-schema.json")

/** Returns a configured input-schema description by key, throwing if the packaged default is missing. */
export const inputDescription = (key: string): string => {
   const val = descriptions[key]
   if (!val) throw new Error(`config/messages/input-schema.json: missing description "${key}"`)
   return val
}
