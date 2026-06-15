import assert from "node:assert/strict";
import dotenv from "dotenv";
import http from "node:http";
import jwt from "jsonwebtoken";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/* global process, URL */

// Load env from repo root when executed from anywhere
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

// Disable Supabase JWT verification to avoid network calls during tests.
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";

process.env.TENANT_GUARD_ALLOW_FALLBACK = "true";
process.env.TENANT_ISOLATION_TEST = "true";
process.env.NODE_ENV = "test";

const JWT_SECRET = process.env.JWT_SECRET;
assert.ok(typeof JWT_SECRET === "string" && JWT_SECRET.length > 0, "JWT_SECRET must be set");

// Use compiled app if present; fall back to loading src if dist isn't built.
const distAppPath = path.resolve(__dirname, "..", "dist", "src", "app.js");

function pathToFileUrl(p) {
  const resolved = path.resolve(p);
  return new URL(`file://${resolved}`).toString();
}

let appModule;
try {
  appModule = await import(pathToFileUrl(distAppPath));
} catch {
  // If dist doesn't exist, this test will fail loudly with a useful error.
  throw new Error(`Could not import compiled app at: ${distAppPath}`);
}

// dist/*.js is compiled to CommonJS with `exports.default = app`.
// Node ESM interop can wrap that, so handle a few shapes safely.
let app =
  appModule?.default?.default && typeof appModule.default.default?.listen === "function"
    ? appModule.default.default
    : appModule?.default?.listen
      ? appModule.default
      : appModule?.listen
        ? appModule
        : appModule;

assert.equal(typeof app?.listen, "function", "Express app must expose app.listen()");

function startServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => resolve(server));
    server.on("error", reject);
  });
}

function requestJSON(server, method, pathname, { token } = {}) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;

  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: pathname,
        headers,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const json = (() => {
            try {
              return data ? JSON.parse(data) : {};
            } catch {
              return { raw: data };
            }
          })();
          resolve({ status: res.statusCode, json });
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

test("cash-flow endpoint returns 200 with numeric aggregates when authenticated", async () => {
  const server = await startServer();
  try {
    const companyId = "companyA";
    const token = jwt.sign(
      { sub: companyId, email: "a@example.com", role: "user" },
      JWT_SECRET,
      { algorithm: "HS256" }
    );

    const res = await requestJSON(server, "GET", `/analytics/${companyId}/cash-flow`, { token });

    assert.equal(res.status, 200);
    assert.equal(typeof res.json?.cashIn, "number");
    assert.equal(typeof res.json?.cashOut, "number");
    assert.equal(typeof res.json?.realCashFlow, "number");
  } finally {
    server.close();
  }
});
