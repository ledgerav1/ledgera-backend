import assert from "node:assert/strict";
import dotenv from "dotenv";
import http from "node:http";
import jwt from "jsonwebtoken";
import path from "node:path";
import test from "node:test";
import { URL, fileURLToPath } from "node:url";

/* global process */

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

const imported = await import(pathToFileUrl(distAppPath));

let app =
  imported?.default?.default && typeof imported.default.default?.listen === "function"
    ? imported.default.default
    : imported?.default?.listen
      ? imported.default
      : imported?.listen
        ? imported
        : imported;

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
  const host = "127.0.0.1";
  const port = address.port;

  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host,
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
          let parsed;
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            parsed = { raw: data };
          }
          resolve({ status: res.statusCode, json: parsed });
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

test("ServiceTitan OAuth callback rejects invalid state", async () => {
  const server = await startServer();
  try {
    const res = await requestJSON(
      server,
      "GET",
      "/oauth/servicetitan/callback?code=abc&state=invalid"
    );

    assert.equal(res.status, 400);
    assert.equal(res.json.raw, "Invalid OAuth state");
  } finally {
    server.close();
  }
});

test("ServiceTitan OAuth callback rejects state with wrong purpose", async () => {
  const server = await startServer();
  try {
    const state = jwt.sign(
      { purpose: "wrong_purpose", companyId: "companyA" },
      JWT_SECRET,
      { algorithm: "HS256", expiresIn: "15m" }
    );

    const res = await requestJSON(
      server,
      "GET",
      `/oauth/servicetitan/callback?code=abc&state=${encodeURIComponent(state)}`
    );

    assert.equal(res.status, 400);
    assert.equal(res.json.raw, "Invalid OAuth state");
  } finally {
    server.close();
  }
});
