import { appendFile } from "node:fs/promises"
import { accessSync, constants } from "node:fs"
import { dirname } from "node:path"
import { AsyncLocalStorage } from "node:async_hooks"
import { log } from "./log.ts"
import { httpSink, toFhirAuditEvent } from "./audit-http.ts"

const auditContext = new AsyncLocalStorage<AuditContext>()

let sinks: AuditSinkFn[] = []

/** Initializes audit sinks from config. Call once at startup before any tool dispatch. */
export const initAuditSinks = (opts: AuditSinkInit): void => {
   sinks = []
   const active: string[] = []
   for (const name of opts.sinks) {
      if (name === "console")
         sinks.push((e) => console.log(`\x1b[33m🔍 ${JSON.stringify(e)}\x1b[0m`)),
         active.push("console")
      else if (name === "file") {
         try {
            try { accessSync(opts.file, constants.W_OK) }
            catch { accessSync(dirname(opts.file), constants.W_OK) }
            sinks.push((e) =>
               void appendFile(opts.file, JSON.stringify(e) + "\n", "utf8")
                  .catch((err) => log.error(`🔍 File write failed: ${err instanceof Error ? err.message : err}`)),
            )
            active.push("file")
         } catch {
            log.warn(`🔍 Audit file not writable: ${opts.file} — file sink disabled`)
         }
      }
      else if (name === "http" && opts.httpUrl) {
         const
            fhir = opts.httpFormat === "fhir-auditevent",
            shape = fhir ? toFhirAuditEvent : (e: AuditEvent) => e,
            contentType = fhir ? "application/fhir+json" : "application/json"
         sinks.push(httpSink(opts.httpUrl, shape, contentType, opts.httpAuth)),
         active.push(`http (${opts.httpFormat})`)
      }
   }
   active.length && log.info(`🔍 Active sinks: ${active.join(", ")}`)
}

/** Runs `fn` within an audit context so emitAudit can merge request-scoped fields automatically. */
export const withAuditContext = <T>(ctx: AuditContext, fn: () => T): T =>
   auditContext.run(ctx, fn)

/** Dispatches a structured audit event to all active sinks, merging request-scoped context. */
export const emitAudit = (event: AuditEvent): void => {
   const
      ctx = auditContext.getStore(),
      merged = ctx ? { ...ctx, ...event } : event
   for (const sink of sinks) sink(merged)
}

/** Returns elapsed milliseconds since `start`. */
export const auditTime = (start: number): number => Date.now() - start

/** Extracts an HTTP status code from common error shapes, or undefined. */
export const errorStatus = (err: unknown): number | undefined => {
   if (!err || typeof err !== "object") return undefined
   const 
      e = err as Record<string, unknown>,
      s = typeof e.status === "number" 
         ? e.status
         : typeof e.statusCode === "number" 
            ? e.statusCode
            : e.response && typeof e.response === "object" && typeof (e.response as Record<string, unknown>).status === "number"
               ? (e.response as Record<string, unknown>).status as number
               : undefined
   return s && s >= 100 && s < 600 ? s : undefined
}
