import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const
   packaged = join(dirname(fileURLToPath(import.meta.url)), "../..", "core-tools.json"),
   path = (): string => {
      const cwd = join(process.cwd(), "core-tools.json")
      return existsSync(cwd) ? cwd : packaged
   }

export const loadCoreTools = (): CoreToolDef[] =>
   JSON.parse(readFileSync(path(), "utf8")) as CoreToolDef[]
