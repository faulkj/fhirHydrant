import { config } from "./config/index.ts"

const
   noop = (..._: unknown[]) => {},
   tint = (method: "log" | "info" | "warn" | "error", code: string) =>
      (...args: unknown[]) => console[method](typeof args[0] === "string" ? `${code}${args[0]}\x1b[0m` : args[0], ...args.slice(1))

/** Level-gated logger. `log.log` always prints (bold green), `log.error` always prints (red/stderr), others respect LOG_LEVEL. */
export const log = Object.freeze({
   log: tint("info", "\x1b[1;92m"),
   error: tint("error", "\x1b[31m"),
   warn: config.logLevel >= 1 ? tint("warn", "\x1b[38;5;208m") : noop,
   info: config.logLevel >= 2 ? tint("info", "\x1b[96m") : noop,
   debug: config.logLevel >= 3 ? (...args: unknown[]) => console.log(...args) : noop,
})
