import { log } from "../../log.ts"
import { setAuditUser } from "../../audit.ts"
import { serveStatelessRequest } from "../transport/serve-request.ts"
import { getAuthzProvider } from "./providers.ts"
import { decideAuthz } from "./roles.ts"
import { withMcpContext } from "./context.ts"

/**
 * Handles one authz-enabled `/mcp` POST: validates the caller via the active provider,
 * derives their decision, then builds a fresh server + stateless transport inside the
 * request context so tools/list, schemas, and gates reflect that caller. Returns false
 * (401 already sent) when the credentials are missing or invalid; no further response then.
 */
export const handleAuthzRequest = async (
   authorization: string | undefined, req: Req, res: Res, body: unknown, factory: ServerFactory,
): Promise<boolean> => {
   const provider = await getAuthzProvider()
   let identity
   try {
      identity = await provider.validate(authorization)
   } catch (err) {
      log.debug(`🔒 Authorization rejected: ${err instanceof Error ? err.message : err}`)
      res.set("WWW-Authenticate", provider.challenge)
         .status(401)
         .json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null })
      return false
   }

   setAuditUser(identity.subject)
   const decision = decideAuthz(identity.roles)
   await withMcpContext({ decision, subject: identity.subject, mutable: {} }, () =>
      serveStatelessRequest(factory, req, res, body))
   return true
}
