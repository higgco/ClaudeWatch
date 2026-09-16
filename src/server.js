const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { ingestOtlpLogs, ingestOtlpTraces } = require("./otlp");
const { decodeOtlpTraces } = require("./otlp-protobuf");
const apiRouter = require("./api");
const { getDb } = require("./db");
const {
  initAuth,
  isAuthEnabled,
  authMiddleware,
  loginHandler,
  logoutHandler,
  authCheckHandler,
  loginPageHandler,
} = require("./auth");
const { startBedrockPoller } = require("./bedrock");
const { isObscureMode, ensureAliasesForAllUsers } = require("./user-mask");
const { getBuildInfo } = require("./version");

const app = express();
const PORT = process.env.PORT || 3456;
const INGEST_TOKEN = process.env.INGEST_TOKEN || null;
const protobufBody = express.raw({
  type: ["application/x-protobuf", "application/protobuf"],
  limit: "10mb",
});

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));

// ── Auth routes (unauthenticated) ───────────────────────────────────────────
app.get("/login", loginPageHandler);
app.post("/auth/login", loginHandler);
app.post("/auth/logout", logoutHandler);
app.get("/auth/check", authCheckHandler);

// ── OTLP HTTP/JSON receiver ────────────────────────────────────────────────
// Claude Code sends to: POST /v1/logs
// If INGEST_TOKEN is set, requires Authorization: Bearer <token>.
// Clients configure this via OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <token>".
function ingestAuth(req, res, next) {
  if (!INGEST_TOKEN) return next();
  const header = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  const presented = m ? m[1].trim() : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(INGEST_TOKEN);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    const ip = req.ip || req.socket?.remoteAddress || "?";
    const reason = !header ? "missing Authorization header"
      : !m ? "Authorization header is not Bearer"
      : "token mismatch";
    console.warn(`[otlp] rejected unauthenticated ingest from ${ip} (${reason})`);
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const ingestLogsHandler = async (req, res) => {
  try {
    const count = await ingestOtlpLogs(req.body);
    console.log(`[otlp] ingested ${count} event(s)`);
    // OTLP expects empty 200 on success
    res.status(200).json({});
  } catch (err) {
    console.error("[otlp] ingest error:", err);
    res.status(500).json({ error: err.message });
  }
};

const ingestTracesHandler = async (req, res) => {
  try {
    let payload = req.body;
    if (Buffer.isBuffer(payload)) {
      // express.raw inflates gzip/deflate/br request bodies by default.
      payload = decodeOtlpTraces(payload);
    }
    const count = await ingestOtlpTraces(payload || {});
    if (count > 0 || process.env.OTLP_DEBUG) {
      console.log(`[otlp] ingested ${count} LiteLLM request span(s)`);
    }
    res.status(200).json({});
  } catch (err) {
    console.error("[otlp] trace ingest error:", err);
    res.status(500).json({ error: err.message });
  }
};

app.post("/v1/logs", ingestAuth, ingestLogsHandler);
// Also accept the protobuf-style route that some exporters use
app.post("/v1/logs/", ingestAuth, ingestLogsHandler);
app.post("/v1/traces", ingestAuth, protobufBody, ingestTracesHandler);
app.post("/v1/traces/", ingestAuth, protobufBody, ingestTracesHandler);

// ── Auth middleware (everything below requires login) ────────────────────────
app.use(authMiddleware);

// ── Protected static files & API ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/api", apiRouter);

// ── Seed demo data (opt-in via env) ─────────────────────────────────────────
async function maybeSeedDemo() {
  if (process.env.SEED_DEMO !== "1") return;
  const db = await getDb();
  const count = db.prepare("SELECT COUNT(*) AS v FROM api_requests");
  count.step();
  const existing = count.getAsObject().v;
  count.free();
  if (existing > 0) return;

  console.log("[seed] populating demo data...");
  const { seedDemoData } = require("./seed");
  await seedDemoData();
  console.log("[seed] done.");
}

// ── Start ───────────────────────────────────────────────────────────────────
(async () => {
  await getDb(); // ensure DB is initialized
  await initAuth(); // ensure auth password exists
  await startBedrockPoller(); // start background sync if configured
  if (isObscureMode()) await ensureAliasesForAllUsers();
  await maybeSeedDemo();

  app.listen(PORT, () => {
    const auth = isAuthEnabled() ? "enabled" : "disabled (AUTH_DISABLED=1)";
    const ingestAuthState = INGEST_TOKEN ? "token required" : "open (no token)";
    const obscure = isObscureMode() ? "enabled (OBSCURE_USERS=1)" : "disabled";
    const { version, revision, builtAt } = getBuildInfo();
    const versionLine = builtAt
      ? `${version} (${revision}, built ${builtAt.slice(0, 10)})`
      : `${version} (${revision})`;
    console.log(`
┌──────────────────────────────────────────────────┐
│  ClaudeWatch                                     │
│  Version:    ${versionLine.padEnd(34)}│
│  Dashboard:  http://localhost:${PORT}               │
│  OTLP recv:  http://localhost:${PORT}/v1/{logs,traces}│
│  Auth:       ${auth.padEnd(35)}│
│  Ingest:     ${ingestAuthState.padEnd(35)}│
│  Obscure:    ${obscure.padEnd(35)}│
└──────────────────────────────────────────────────┘
    `);
  });
})();
