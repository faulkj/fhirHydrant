import { spawn } from "node:child_process"
import { writeFileSync, appendFileSync } from "node:fs"

writeFileSync("probe-out.txt", "")
const env = { ...process.env, MCP_TRANSPORT: "http", FHIR_AUTH: "none", FHIR_SERVER_URL: "https://hapi.fhir.org/baseR4", FHIR_METADATA_MODE: "off", NODE_ENV: "production", PORT: "5098", MCP_BIND_HOST: "127.0.0.1", LOG_LEVEL: "info" }
const child = spawn("node", ["--experimental-strip-types", "ts/server.ts"], { env, stdio: ["ignore", "pipe", "pipe"] })
let ready = false
const w = (d) => { const s = d.toString(); appendFileSync("probe-out.txt", s); if (s.includes("listening")) ready = true }
child.stdout.on("data", w); child.stderr.on("data", w)
const post = (b) => fetch("http://127.0.0.1:5098/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify(b) }).then(r => r.text())
const waitReady = async () => { for (let i = 0; i < 60; i++) { if (ready) return; await new Promise(r => setTimeout(r, 250)) } }
;(async () => {
   await waitReady()
   appendFileSync("probe-out.txt", "\n__MARKER_REQ1__\n")
   await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "p", version: "1" } } })
   await new Promise(r => setTimeout(r, 500))
   appendFileSync("probe-out.txt", "\n__MARKER_REQ2__\n")
   await post({ jsonrpc: "2.0", id: 2, method: "tools/list" })
   await new Promise(r => setTimeout(r, 500))
   child.kill(); process.exit(0)
})()
setTimeout(() => { child.kill(); process.exit(1) }, 25000)
