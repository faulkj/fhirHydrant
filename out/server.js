#!/usr/bin/env node

// ts/server.ts
import { readFileSync as readFileSync2, watch } from "fs";
import { basename, dirname as dirname2, join as join2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { McpServer, StdioServerTransport } from "@modelcontextprotocol/server";

// ts/config.ts
var get = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};
var opt = (key) => process.env[key];
var parseTransport = () => {
  const val = (opt("MCP_TRANSPORT") ?? "http").toLowerCase();
  if (val !== "http" && val !== "stdio")
    throw new Error(
      `Invalid MCP_TRANSPORT="${val}" \u2014 must be "http" or "stdio"`
    );
  return val;
};
var parsePort = () => {
  const raw = opt("PORT") ?? "5000", port = parseInt(raw, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535)
    throw new Error(`Invalid PORT="${raw}" \u2014 must be 1\u201365535`);
  return port;
};
var parseAllowedHosts = () => opt("ALLOWED_HOSTS")?.split(",").map((s) => s.trim()).filter(Boolean) || void 0;
var config = {
  fhirBaseUrl: get("FHIR_BASE_URL").replace(/\/$/, ""),
  get fhirServerUrl() {
    return opt("FHIR_SERVER_URL") ?? `${this.fhirBaseUrl}/api/FHIR/R4`;
  },
  get fhirTokenEndpoint() {
    return opt("FHIR_TOKEN_URL") ?? `${this.fhirBaseUrl}/oauth2/token`;
  },
  fhirClientId: get("FHIR_CLIENT_ID"),
  fhirPrivateKey: get("FHIR_PRIVATE_KEY"),
  fhirJwksUrl: opt("FHIR_JWKS_URL"),
  fhirKeyId: opt("FHIR_KEY_ID"),
  port: parsePort(),
  bindHost: opt("BIND_HOST") ?? "127.0.0.1",
  allowedHosts: parseAllowedHosts(),
  transport: parseTransport(),
  debug: opt("DEBUG")?.toLowerCase() === "true"
};

// ts/fhir/auth.ts
import FHIRStarter from "fhirstarterjs";

// ts/fhir/definitions.ts
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import * as z from "zod";

// ts/fhir/validate-definitions.ts
var text = (value) => typeof value === "string" && value.trim() ? value.trim() : void 0;
var validateDefinitions = (raw) => {
  const errors = [];
  if (!Array.isArray(raw))
    return errors.push("definitions.json must be a JSON array"), { entries: [], errors };
  const seen = /* @__PURE__ */ new Set(), entries = [];
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push("definitions.json entries must be objects");
      continue;
    }
    const entry = value, searchParams = entry["searchParams"];
    if (searchParams !== void 0 && (!searchParams || typeof searchParams !== "object" || Array.isArray(searchParams))) {
      errors.push(
        `Invalid entry for resourceType "${text(entry["resourceType"]) ?? "(missing)"}": searchParams must be an object when provided`
      );
      continue;
    }
    const rt = text(entry["resourceType"]), name = text(entry["toolName"]), desc = text(entry["description"]);
    if (!rt || !name || !desc || typeof entry.supportsDirectRead !== "boolean") {
      errors.push(
        `Invalid entry for resourceType "${rt ?? "(missing)"}": requires resourceType, toolName, description (non-empty strings) and supportsDirectRead (boolean)`
      );
      continue;
    }
    if (seen.has(name)) {
      errors.push(`Duplicate toolName "${name}"`);
      continue;
    }
    seen.add(name);
    const params = searchParams ?? {};
    for (const [key, val] of Object.entries(params))
      if (typeof key !== "string" || typeof val !== "string")
        errors.push(`"${name}": searchParams keys and values must be strings (got key="${key}")`);
    if (!entry.supportsDirectRead && Object.keys(params).length === 0) {
      errors.push(`"${name}" has no searchParams and supportsDirectRead is false`);
      continue;
    }
    const rawRequire = entry["requireOneOf"], requireOneOf = Array.isArray(rawRequire) && rawRequire.length > 0 && rawRequire.every((v) => typeof v === "string" && v.trim()) ? rawRequire : void 0;
    if (rawRequire !== void 0 && !requireOneOf)
      errors.push(`"${name}": requireOneOf must be a non-empty array of strings when provided`);
    if (requireOneOf) {
      const paramKeys = new Set(Object.keys(params));
      for (const key of requireOneOf)
        if (!paramKeys.has(key))
          errors.push(`"${name}": requireOneOf key "${key}" is not in searchParams`);
    }
    entries.push({
      resourceType: rt,
      toolName: name,
      description: desc,
      supportsDirectRead: entry["supportsDirectRead"],
      searchParams: Object.keys(params).length > 0 ? params : void 0,
      requireOneOf
    });
  }
  return { entries, errors };
};

// ts/fhir/definitions.ts
var packaged = join(dirname(fileURLToPath(import.meta.url)), "../..", "definitions.json");
var getDefinitionsPath = () => {
  const cwd = join(process.cwd(), "definitions.json");
  return existsSync(cwd) ? cwd : packaged;
};
var parse = () => {
  const raw = JSON.parse(
    readFileSync(getDefinitionsPath(), "utf8")
  ), result = validateDefinitions(raw);
  if (result.errors.length > 0)
    throw new Error(`definitions.json: ${result.errors.join("; ")}`);
  const seen = /* @__PURE__ */ new Set(), definitions = result.entries.map((entry) => {
    if (seen.has(entry.toolName))
      throw new Error(
        `definitions.json: duplicate toolName "${entry.toolName}"`
      );
    seen.add(entry.toolName);
    const params = entry.searchParams ?? {}, shape = Object.fromEntries(
      Object.entries(params).map(([key, desc]) => [
        key,
        z.string().optional().describe(desc)
      ])
    );
    if (entry.supportsDirectRead && !shape["_id"]) {
      shape["_id"] = z.string().optional().describe(
        `${entry.resourceType} resource ID \u2014 performs direct read when provided alone`
      );
      console.warn(
        `[definitions] "${entry.toolName}": auto-injected _id for supportsDirectRead`
      );
    }
    const schema = z.object(shape);
    return {
      resourceType: entry.resourceType,
      toolName: entry.toolName,
      description: entry.description,
      supportsDirectRead: entry.supportsDirectRead,
      requireOneOf: entry.requireOneOf,
      searchSchema: schema
    };
  }), scopes = definitions.map(
    (d) => d.supportsDirectRead ? `system/${d.resourceType}.rs` : `system/${d.resourceType}.s`
  );
  return { definitions, scopes };
};
var snapshot = parse();
var getDefinitions = () => snapshot.definitions;
var getScopes = () => snapshot.scopes;
var reloadDefinitions = () => {
  try {
    snapshot = parse();
    return true;
  } catch (err) {
    console.error(
      "[definitions] Reload failed \u2014 keeping last valid snapshot:",
      err instanceof Error ? err.message : err
    );
    return false;
  }
};

// ts/fhir/auth.ts
var starter;
var startAuth = async () => {
  starter = new FHIRStarter({
    clientId: config.fhirClientId,
    privateKey: config.fhirPrivateKey,
    tokenEndpointUrl: config.fhirTokenEndpoint,
    scopes: getScopes(),
    ...config.fhirJwksUrl && { jwksUrl: config.fhirJwksUrl },
    ...config.fhirKeyId && { keyId: config.fhirKeyId }
  });
  await starter.start();
};
var stopAuth = () => {
  starter?.stop();
};
var restartAuth = async () => {
  stopAuth();
  await startAuth();
};
var getTokenResponse = () => starter.tokenResponse();

// ts/fhir/registry.ts
import { z as z2 } from "zod";

// ts/fhir/client.ts
import FHIR from "fhirclient";
var smart = FHIR({});
var createFhirClient = () => smart.client({
  serverUrl: config.fhirServerUrl,
  tokenResponse: getTokenResponse()
});

// ts/fhir/registry.ts
var retryable = (err) => {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("econnreset") || msg.includes("epipe") || msg.includes("etimedout") || msg.includes("socket hang up") || msg.includes("forcibly closed") || msg.includes("network") || msg.includes("fetch failed");
  }
  return false;
};
var withRetry = async (label, fn, attempts = 3) => {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i + 1 >= attempts || !retryable(err)) throw err;
      const delay = 1e3 * 2 ** i;
      console.warn(`[fhir] ${label} transient error, retrying in ${delay}ms (${i + 1}/${attempts})`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
};
var buildSearchUrl = (resourceType, args) => {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(args))
    val !== void 0 && val !== "" && params.append(key, String(val));
  const qs = params.toString();
  return qs ? `${resourceType}?${qs}` : resourceType;
};
var isDirectRead = (args, supportsDirectRead) => {
  if (!supportsDirectRead) return void 0;
  const id = typeof args["_id"] === "string" && args["_id"] ? args["_id"] : void 0;
  if (!id) return void 0;
  const otherKeys = Object.entries(args).some(
    ([k, v]) => k !== "_id" && v !== void 0 && v !== ""
  );
  return otherKeys ? void 0 : id;
};
var makeHandler = (def) => async (args) => {
  const directId = isDirectRead(args, def.supportsDirectRead);
  if (!directId && def.requireOneOf) {
    const ok = def.requireOneOf.some((k) => {
      const v = args[k];
      return typeof v === "string" && v !== "";
    });
    if (!ok)
      return {
        content: [{ type: "text", text: `Search requires at least one of: ${def.requireOneOf.join(", ")}` }],
        isError: true
      };
  }
  try {
    const client = createFhirClient(), url = directId ? `${def.resourceType}/${directId}` : buildSearchUrl(def.resourceType, args), op = directId ? "read" : "search";
    config.debug ? console.log(`[fhir] ${def.resourceType} ${op} \u2192 ${url}`) : console.log(`[fhir] ${def.resourceType} ${op}`);
    const result = await withRetry(`${def.resourceType} ${op}`, () => client.request(url)), summary = result && typeof result === "object" && result.resourceType === "Bundle" ? `Bundle total=${result.total ?? "?"}` : result?.resourceType ?? "ok";
    console.log(`[fhir] ${def.resourceType} OK ${summary}`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[fhir] ${def.resourceType} ERR ${message}`);
    return {
      content: [{ type: "text", text: message }],
      isError: true
    };
  }
};
var registerAll = (server) => {
  for (const def of getDefinitions())
    server.registerTool(
      def.toolName,
      { description: def.description, inputSchema: def.searchSchema },
      makeHandler(def)
    );
};
var validatePageUrl = (url) => {
  const baseHref = config.fhirServerUrl.replace(/\/?$/, "/"), serverUrl = new URL(baseHref), nextUrl = new URL(url, baseHref);
  if (nextUrl.origin !== serverUrl.origin)
    throw new Error(
      `Pagination URL origin "${nextUrl.origin}" does not match FHIR server origin "${serverUrl.origin}"`
    );
  if (!nextUrl.pathname.startsWith(serverUrl.pathname))
    throw new Error(
      `Pagination URL path "${nextUrl.pathname}" is outside FHIR server base path "${serverUrl.pathname}"`
    );
  return nextUrl.toString();
};
var registerCoreTools = (server) => {
  server.registerTool(
    "fhir_fetch_page",
    {
      description: `Fetch a single page of FHIR Bundle results using a pagination URL. The url must come from a FHIR Bundle's link array where relation is "next". Do not construct pagination URLs manually \u2014 only use links returned by the FHIR server.`,
      inputSchema: z2.object({
        url: z2.string().describe(
          "Pagination URL from a FHIR Bundle link[rel=next].url value"
        )
      })
    },
    async (args) => {
      try {
        const validatedUrl = validatePageUrl(args.url), client = createFhirClient();
        config.debug ? console.log(`[fhir] fetch_page \u2192 ${validatedUrl}`) : console.log("[fhir] fetch_page");
        const result = await withRetry("fetch_page", () => client.request(validatedUrl)), summary = result && typeof result === "object" && result.resourceType === "Bundle" ? `Bundle total=${result.total ?? "?"}` : "ok";
        console.log(`[fhir] fetch_page OK ${summary}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[fhir] fetch_page ERR ${message}`);
        return {
          content: [
            {
              type: "text",
              text: `${message}

Retry with the same url to resume from this page.`
            }
          ],
          isError: true
        };
      }
    }
  );
};

// ts/server.ts
var { version: pkgVersion } = JSON.parse(
  readFileSync2(join2(dirname2(fileURLToPath2(import.meta.url)), "..", "package.json"), "utf8")
);
var SERVER_INFO = { name: "fhirhydrant", version: pkgVersion };
var SERVER_INSTRUCTIONS = readFileSync2(
  join2(dirname2(fileURLToPath2(import.meta.url)), "..", "instructions.md"),
  "utf8"
).trim();
var makeServer = () => {
  const s = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
  registerAll(s);
  registerCoreTools(s);
  return s;
};
var restartingAuth = false;
var startDefinitionsWatcher = () => {
  const defPath = getDefinitionsPath(), watchDir = dirname2(defPath), watchFile = basename(defPath);
  let debounce;
  watch(watchDir, (_eventType, filename) => {
    if (filename !== watchFile) return;
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const prevScopes = getScopes().join(","), ok = reloadDefinitions();
      if (!ok) return;
      console.log(`[definitions] Reloaded from ${watchFile}`);
      if (getScopes().join(",") !== prevScopes) {
        if (restartingAuth)
          return void console.log(
            "[definitions] Auth restart already in progress \u2014 skipping"
          );
        restartingAuth = true;
        try {
          console.log(
            "[definitions] Scopes changed \u2014 restarting auth..."
          );
          await restartAuth();
          console.log("[definitions] Auth restarted with new scopes");
        } catch (err) {
          console.error(
            "[definitions] Auth restart failed:",
            err instanceof Error ? err.message : err
          );
        } finally {
          restartingAuth = false;
        }
      }
    }, 300);
  });
  console.log(`[definitions] Watching ${watchFile} for changes`);
};
var startHttp = async () => {
  const { createMcpExpressApp } = await import("@modelcontextprotocol/express"), { NodeStreamableHTTPServerTransport } = await import("@modelcontextprotocol/node"), app = createMcpExpressApp(
    config.allowedHosts ? { allowedHosts: config.allowedHosts } : void 0
  ), server = makeServer(), transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: void 0
  });
  await server.connect(transport);
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.all("/mcp", async (req, res) => {
    const body = req.body, method = body?.method ?? req.method;
    method && console.log(`[mcp] ${method}`);
    await transport.handleRequest(req, res, req.body);
  });
  app.use((err, _req, res, _next) => {
    console.error("[http] Request error:", err.message);
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32700, message: "Parse error" },
      id: null
    });
  });
  const httpServer = app.listen(
    config.port,
    config.bindHost,
    () => console.log(`fhirhydrant listening on ${config.bindHost}:${config.port}`)
  );
  return () => new Promise((resolve) => {
    void transport.close();
    void server.close();
    httpServer.close(() => resolve());
    setTimeout(() => resolve(), 5e3);
  });
};
var startStdio = async () => {
  console.log = (...args) => console.error(...args);
  const server = makeServer(), transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("fhirhydrant running in stdio mode");
  return async () => {
    await transport.close();
    await server.close();
  };
};
await startAuth();
var close = config.transport === "stdio" ? await startStdio() : await startHttp();
process.env["NODE_ENV"] !== "production" && startDefinitionsWatcher();
var shutdownInProgress = false;
var shutdown = async (code = 0) => {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  console.log("Shutting down...");
  stopAuth();
  await close();
  process.exit(code);
};
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));
