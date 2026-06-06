// check-dev.mjs — Smoke test for TranslationStack dev server.
//
// Usage:
//   bun skills/translationstack/scripts/check-dev.mjs <project-dir> [--port 7878] [--host 127.0.0.1]
//   node skills/translationstack/scripts/check-dev.mjs <project-dir> [--port 7878] [--host 127.0.0.1]
//
// Behavior:
//   1. Probe http://<host>:<port>/api/health (≤ 1s).
//   2. If a server is already serving our project, run checks against it.
//   3. If no server is running OR a different project's server is on the
//      port, FAIL with a clear hint to start serve.mjs. This script does
//      NOT spawn a server itself — the dev server is designed to be left
//      running in the background for the lifetime of the project.
//   4. Exit 0 on success, 1 on failure. All errors go to stderr.
//
// Bun/Node compatible. Zero third-party dependencies.

import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVE_PATH = path.join(__dirname, "serve.mjs");

// --- CLI ---

const args = process.argv.slice(2);
let projectDirArg = null;
let port = 7878;
let host = "127.0.0.1";

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--port") {
    port = Number(args[i + 1]);
    i += 1;
  } else if (arg === "--host") {
    host = args[i + 1];
    i += 1;
  } else if (arg.startsWith("-")) {
    console.error(`unknown flag: ${arg}`);
    process.exit(2);
  } else if (!projectDirArg) {
    projectDirArg = arg;
  }
}

if (!projectDirArg) {
  console.error("usage: check-dev.mjs <project-dir> [--port 7878] [--host 127.0.0.1]");
  process.exit(2);
}

const projectDir = path.resolve(projectDirArg);
const baseUrl = `http://${host}:${port}`;

// Derive the expected project id from the directory name. We use this to
// detect "wrong server on this port" — e.g., a leftover server from a
// different TranslationStack project.
const expectedProjectId = path.basename(projectDir);

function projectIdMatches(health) {
  if (!health || !health.projectId) return false;
  // project.yaml id may differ from the directory name, so accept either
  // an exact match OR a clear substring relationship.
  return (
    health.projectId === expectedProjectId ||
    health.projectId.endsWith(expectedProjectId) ||
    expectedProjectId.endsWith(health.projectId)
  );
}

// --- HTTP helpers ---

async function fetchWithTimeout(url, ms = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeHealth() {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/health`, 1000);
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.ok !== true) return null;
    if (!projectIdMatches(body)) return null;
    return body;
  } catch {
    return null;
  }
}

// Like probeHealth but does NOT filter by projectId. Used only to
// distinguish "no server" from "wrong project on this port".
async function probeHealthUnchecked() {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/health`, 1000);
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.ok !== true) return null;
    return body;
  } catch {
    return null;
  }
}

async function fetchData() {
  const res = await fetchWithTimeout(`${baseUrl}/api/data`, 4000);
  if (!res.ok) throw new Error(`GET /api/data -> HTTP ${res.status}`);
  return res.json();
}

async function fetchIndex() {
  const res = await fetchWithTimeout(`${baseUrl}/`, 4000);
  if (!res.ok) throw new Error(`GET / -> HTTP ${res.status}`);
  const text = await res.text();
  return { text, contentType: res.headers.get("content-type") || "" };
}

// --- Checks ---

const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function suggestStart() {
  return `start the dev server with: bun ${SERVE_PATH} ${projectDir} --port ${port} --host ${host}`;
}

async function runChecks() {
  console.log(`[check] probing ${baseUrl}/api/health`);
  const health = await probeHealth();

  if (!health) {
    // Either no server, or a server serving a different project.
    const otherHealth = await probeHealthUnchecked().catch(() => null);
    if (otherHealth?.projectId && otherHealth.projectId !== expectedProjectId) {
      throw new Error(
        `port ${port} is serving projectId="${otherHealth.projectId}", not "${expectedProjectId}"; ` +
          `stop the other server (lsof -nP -iTCP:${port} -sTCP:LISTEN) or pick a different --port`
      );
    }
    throw new Error(
      `no dev server running on ${baseUrl}; ${suggestStart()}`
    );
  }

  console.log(`[check] found running server (projectId=${health.projectId})`);

  // 1) /api/data
  console.log(`[check] GET /api/data`);
  let data;
  try {
    data = await fetchData();
    check("data endpoint returns valid JSON", typeof data === "object" && data !== null);
  } catch (e) {
    check("data endpoint returns valid JSON", false, e.message);
    return;
  }
  check("data has project.id", !!data.project?.id, data.project?.id ? "" : "missing project.id");
  check("data has stats object", typeof data.stats === "object" && data.stats !== null);
  check("data has chunks array", Array.isArray(data.chunks));
  check("data has glossary array", Array.isArray(data.glossary));
  check(
    "data.chunks reflects manifest",
    Array.isArray(data.chunks) && data.chunks.length > 0,
    `chunks.length=${data.chunks?.length}`
  );
  if (data.stats && typeof data.stats.chunks === "number") {
    check(
      "stats.chunks matches data.chunks length",
      data.stats.chunks === data.chunks.length,
      `stats=${data.stats.chunks} actual=${data.chunks.length}`
    );
  }
  if (data.project?.id) {
    check("project.id is a string", typeof data.project.id === "string" && data.project.id.length > 0);
  }

  // 2) /
  console.log(`[check] GET /`);
  try {
    const { text, contentType } = await fetchIndex();
    check("index returns HTML", /text\/html/i.test(contentType), `content-type=${contentType}`);
    check("index references translationstack", /TranslationStack/i.test(text));
    check("index has data slot", /id="translationstack-data"/.test(text));
  } catch (e) {
    check("index returns HTML", false, e.message);
  }
}

// --- Main ---

(async () => {
  try {
    await runChecks();
  } catch (e) {
    failures.push({ name: "fatal", detail: e.message });
    console.error(`[check] fatal: ${e.message}`);
  }

  if (failures.length === 0) {
    console.log(`[check] OK — all checks passed`);
    process.exit(0);
  } else {
    console.error(`[check] FAIL — ${failures.length} check(s) failed`);
    process.exit(1);
  }
})();
