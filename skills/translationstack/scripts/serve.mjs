// serve.mjs — TranslationStack dev server.
//
// Usage:
//   bun skills/translationstack/scripts/serve.mjs <project-dir> [--port 7878] [--host 127.0.0.1] [--open|--no-open]
//   node skills/translationstack/scripts/serve.mjs <project-dir> [--port 7878] [--host 127.0.0.1] [--open|--no-open]
//
// Endpoints:
//   GET /              → templates/review.html (live, re-read on every request so template edits apply)
//   GET /api/data      → project data as JSON
//   GET /api/stream    → Server-Sent Events; emits a "data" event whenever a project file changes
//   GET /api/health    → { ok: true, ts, projectId }
//
// Bun/Node compatible. Zero third-party dependencies.
// Default bind: 127.0.0.1 (loopback only). Pass --host 0.0.0.0 to expose on LAN (be careful).
//
// The server is designed to be left running in the background for the lifetime
// of the project. Re-invoking while a server is already listening on the same
// port is IDEMPOTENT: it probes the running server, prints its URL, optionally
// opens the browser, and exits 0. It does not kill the existing server.
//
// Stops cleanly on SIGINT / SIGTERM. All SSE clients are flushed and sockets destroyed.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadProject } from "./load-project.mjs";

// --- CLI parsing ---

const args = process.argv.slice(2);
let projectDirArg = null;
let port = 7878;
let host = "127.0.0.1";
let openBrowser = true; // default ON

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--port") {
    port = Number(args[i + 1]);
    i += 1;
  } else if (arg === "--host") {
    host = args[i + 1];
    i += 1;
  } else if (arg === "--open") {
    openBrowser = true;
  } else if (arg === "--no-open") {
    openBrowser = false;
  } else if (arg.startsWith("-")) {
    console.error(`unknown flag: ${arg}`);
    process.exit(2);
  } else if (!projectDirArg) {
    projectDirArg = arg;
  }
}

if (!projectDirArg) {
  console.error("usage: serve.mjs <project-dir> [--port 7878] [--host 127.0.0.1] [--open|--no-open]");
  process.exit(2);
}

if (!Number.isFinite(port) || port < 1 || port > 65535) {
  console.error(`invalid --port: ${port}`);
  process.exit(2);
}

const projectDir = path.resolve(projectDirArg);
const baseUrl = `http://${host}:${port}`;
const expectedProjectId = path.basename(projectDir);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(__dirname, "..", "templates", "review.html");

// --- Browser opener (best-effort) ---

function openInBrowser(url) {
  let cmd;
  let cmdArgs;
  if (process.platform === "darwin") {
    cmd = "open";
    cmdArgs = [url];
  } else if (process.platform === "win32") {
    // `start` is a cmd.exe builtin; can't be spawned directly.
    cmd = "cmd";
    cmdArgs = ["/c", "start", "", url];
  } else {
    cmd = "xdg-open";
    cmdArgs = [url];
  }
  try {
    const child = spawn(cmd, cmdArgs, {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", () => { /* ignore — headless env, missing xdg-open, etc. */ });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// --- Probe whether something is already listening on this URL ---

async function probeExistingServer() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    const res = await fetch(`${baseUrl}/api/health`, { cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.ok !== true) return null;
    return body;
  } catch {
    return null;
  }
}

function projectIdMatches(health) {
  if (!health?.projectId) return false;
  return (
    health.projectId === expectedProjectId ||
    health.projectId.endsWith(expectedProjectId) ||
    expectedProjectId.endsWith(health.projectId)
  );
}

// --- Project loader (cached, invalidated on file change) ---

let cachedData = null;
let cachedError = null;
let lastLoadedAt = 0;

async function getData() {
  try {
    const loaded = await loadProject(projectDir);
    cachedData = loaded.data;
    cachedError = null;
    lastLoadedAt = Date.now();
    return cachedData;
  } catch (e) {
    cachedError = e;
    return null;
  }
}

// --- SSE clients ---

/** @type {Set<import("node:http").ServerResponse>} */
const sseClients = new Set();

function sseSend(res, eventName, payload) {
  if (res.writableEnded || res.destroyed) return;
  try {
    if (eventName) res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    // Client disconnected mid-write; clean up below.
    sseClients.delete(res);
  }
}

function broadcastData() {
  for (const client of sseClients) {
    sseSend(client, "data", { ts: Date.now() });
  }
}

function broadcastError(message) {
  for (const client of sseClients) {
    sseSend(client, "error", { message });
  }
}

// --- File watching (debounced) ---

const WATCH_TARGETS = ["project.yaml", "chunk_manifest.yaml", "glossary", "translations", "review"];
const DEBOUNCE_MS = 200;

let debounceTimer = null;
function scheduleReload() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    const before = lastLoadedAt;
    await getData();
    if (cachedError) {
      broadcastError(cachedError.message);
    } else if (lastLoadedAt !== before) {
      broadcastData();
    }
  }, DEBOUNCE_MS);
}

function shouldWatch(filename) {
  if (!filename) return false;
  return WATCH_TARGETS.some((target) => {
    if (target.endsWith(".yaml")) return filename === target;
    return filename === target || filename.startsWith(target + path.sep) || filename.startsWith(target + "/");
  });
}

let watcher = null;
function startWatcher() {
  try {
    watcher = fs.watch(projectDir, { recursive: true }, (_event, filename) => {
      if (shouldWatch(filename)) scheduleReload();
    });
    watcher.on("error", (e) => {
      // Some filesystems don't support recursive watch (e.g., older Linux). Fall back to non-recursive.
      try {
        watcher?.close();
      } catch {}
      watcher = fs.watch(projectDir, {}, (_event, filename) => {
        if (shouldWatch(filename)) scheduleReload();
      });
      watcher.on("error", (e2) => {
        console.error("[watch] error:", e2.message);
      });
    });
  } catch (e) {
    console.error("[watch] failed to start:", e.message);
  }
}

// --- HTTP handlers ---

const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store",
  Connection: "keep-alive",
  // Disable proxy buffering so events reach the browser immediately.
  "X-Accel-Buffering": "no",
};

function sendJson(res, status, body) {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  res.end(body);
}

async function handleIndex(res) {
  try {
    const html = await fs.promises.readFile(TEMPLATE_PATH, "utf8");
    res.writeHead(200, HTML_HEADERS);
    res.end(html);
  } catch (e) {
    // Do NOT include TEMPLATE_PATH in the response body — it would leak
    // an absolute filesystem path to any client that can reach the port.
    // The detail is logged to stderr for the operator.
    console.error(`[serve] template not readable: ${TEMPLATE_PATH}: ${e.message}`);
    sendText(res, 500, "template not readable");
  }
}

async function handleData(res) {
  const data = await getData();
  if (!data) {
    // Do NOT include cachedError.message in the response — V8's JSON.parse
    // error messages echo back file content. Log it for the operator and
    // give the client a stable, machine-readable error code.
    console.error(`[serve] data load failed: ${cachedError?.stack || cachedError?.message || cachedError}`);
    sendJson(res, 500, { error: "load failed", code: "project_load_error" });
    return;
  }
  sendJson(res, 200, data);
}

function handleHealth(res) {
  sendJson(res, 200, {
    ok: true,
    ts: Date.now(),
    projectId: cachedData?.project?.id || null,
    lastLoadedAt: lastLoadedAt || null,
  });
}

function handleStream(req, res) {
  res.writeHead(200, SSE_HEADERS);
  res.write(": stream open\n\n"); // SSE comment to flush headers

  sseClients.add(res);
  // Greet so the client knows the connection is live even before any change.
  sseSend(res, "hello", { ts: Date.now(), projectId: cachedData?.project?.id || null });

  const heartbeat = setInterval(() => {
    sseSend(res, "heartbeat", { ts: Date.now() });
  }, 30000);

  const cleanup = () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    if (!res.writableEnded) {
      try { res.end(); } catch {}
    }
  };
  req.on("close", cleanup);
  req.on("aborted", cleanup);
  res.on("close", cleanup);
}

const server = http.createServer(async (req, res) => {
  // Only GET is allowed. Reject everything else.
  if (req.method !== "GET") {
    sendText(res, 405, "method not allowed");
    return;
  }
  // Strip query string for routing.
  const url = (req.url || "/").split("?")[0];

  try {
    if (url === "/" || url === "/index.html") {
      await handleIndex(res);
    } else if (url === "/api/data") {
      await handleData(res);
    } else if (url === "/api/stream") {
      handleStream(req, res);
    } else if (url === "/api/health") {
      handleHealth(res);
    } else {
      sendText(res, 404, "not found");
    }
  } catch (e) {
    // Same info-disclosure concern: log full detail to stderr, return a
    // generic error code to the client.
    console.error("[serve] handler error:", e);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "internal", code: "handler_error" });
    } else {
      try { res.end(); } catch {}
    }
  }
});

// --- Lifecycle ---

function shutdown(signal) {
  console.log(`\n[serve] received ${signal}, shutting down`);
  for (const client of sseClients) {
    try { client.end(); } catch {}
  }
  sseClients.clear();
  try { watcher?.close(); } catch {}
  server.close(() => {
    process.exit(0);
  });
  // Force exit after 2s if close hangs.
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Graceful EADDRINUSE: don't crash with a Node stack trace. Instead, check
// whether the existing listener is a TranslationStack server. If it is,
// behave idempotently (print URL, optionally open browser, exit 0). If it
// is not, fail with a helpful diagnostic (exit 2).
server.on("error", async (e) => {
  if (e && e.code === "EADDRINUSE") {
    const existing = await probeExistingServer();
    if (existing) {
      if (!projectIdMatches(existing)) {
        console.error(
          `[serve] port ${port} is already serving projectId="${existing.projectId}", not "${expectedProjectId}"`
        );
        console.error(`       stop the other server (lsof -nP -iTCP:${port} -sTCP:LISTEN) or pick a different --port`);
        process.exit(2);
      }
      console.log(`TranslationStack dev server: already running on ${baseUrl}`);
      console.log(`  project: ${existing.projectId || "?"}`);
      console.log(`  pid:     (see lsof -nP -iTCP:${port} -sTCP:LISTEN)`);
      console.log(`  open:    ${baseUrl}`);
      if (openBrowser) {
        if (openInBrowser(baseUrl)) {
          console.log(`  browser: opening (best effort)`);
        } else {
          console.log(`  browser: could not auto-open (no GUI?); URL above`);
        }
      }
      process.exit(0);
    }
    console.error(`[serve] port ${port} in use by a non-TranslationStack listener (${host}:${port})`);
    console.error(`       find the owner: lsof -nP -iTCP:${port} -sTCP:LISTEN`);
    process.exit(2);
  }
  console.error(`[serve] listen error: ${e.message}`);
  process.exit(2);
});

server.listen(port, host, async () => {
  await getData(); // warm cache so first /api/data request is fast
  startWatcher();
  console.log("TranslationStack dev server");
  console.log(`  project: ${projectDir}`);
  console.log(`  serving: ${baseUrl}`);
  console.log(`  pid:     ${process.pid}`);
  console.log(`  watching: project files (debounced ${DEBOUNCE_MS}ms)`);
  console.log(`  open:    ${baseUrl}`);
  if (host === "0.0.0.0" || host === "::") {
    console.warn(`  WARNING: serving on ${host} — exposed to LAN.`);
  }
  if (openBrowser) {
    if (openInBrowser(baseUrl)) {
      console.log(`  browser: opening (best effort)`);
    } else {
      console.log(`  browser: could not auto-open (no GUI?); open the URL above manually`);
    }
  } else {
    console.log(`  browser: skipped (--no-open)`);
  }
  console.log(`  stop:    Ctrl-C`);
  if (cachedError) {
    console.error(`  initial load warning: ${cachedError.message}`);
  }
});
