import assert from "node:assert/strict";
import dotenv from "dotenv";
import http from "node:http";
import jwt from "jsonwebtoken";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/* eslint-disable no-undef */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the correct env file regardless of current working directory.
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

process.env.TENANT_GUARD_ALLOW_FALLBACK = "true";
process.env.TENANT_ISOLATION_TEST = "true";
process.env.NODE_ENV = "test";

// Disable Supabase JWT verification to avoid network calls during tests.
// auth.ts decides at module-load time whether supabaseAuth is configured.
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";

const JWT_SECRET = process.env.JWT_SECRET;
assert.ok(typeof JWT_SECRET === "string" && JWT_SECRET.length > 0, "JWT_SECRET must be set");

const distAppPath = path.resolve(__dirname, "..", "dist", "src", "app.js");

function pathToFileUrl(p) {
  const resolved = path.resolve(p);
  const url = new URL(`file://${resolved}`);
  return url.toString();
}

const imported = await import(pathToFileUrl(distAppPath));

// dist/*.js is compiled to CommonJS with `exports.default = app`.
// Node ESM interop can wrap that, so handle a few shapes safely.
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

function requestJSON(server, method, pathname, { token, body } = {}) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const host = "127.0.0.1";
  const port = address.port;

  const payload = body ? Buffer.from(JSON.stringify(body)) : undefined;

  const headers = {
    "content-type": "application/json",
  };

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
    if (payload) req.write(payload);
    req.end();
  });
}

test("cross-tenant isolation: GET /acquisition/:companyId returns 401 when unauthenticated", async () => {
  const server = await startServer();
  try {
    const res = await requestJSON(server, "GET", "/acquisition/companyB");
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("cross-tenant isolation: authenticated companyA cannot query companyB (GET /acquisition/:companyId => 404)", async () => {
  const server = await startServer();
  try {
    const companyA = "companyA";
    const companyB = "companyB";

    const token = jwt.sign(
      { sub: companyA, email: "a@example.com", role: "user" },
      JWT_SECRET,
      { algorithm: "HS256" }
    );

    const res = await requestJSON(server, "GET", `/acquisition/${companyB}`, { token });
    assert.equal(res.status, 404);
    assert.equal(res.json.error, "Company not found");
  } finally {
    server.close();
  }
});

test("cross-tenant isolation: authenticated companyA cannot submit firmaContracts for companyB in body (POST /contracts/firma/send => 404)", async () => {
  const server = await startServer();
  try {
    const companyA = "companyA";
    const companyB = "companyB";

    const token = jwt.sign(
      { sub: companyA, email: "a@example.com", role: "user" },
      JWT_SECRET,
      { algorithm: "HS256" }
    );

    const res = await requestJSON(server, "POST", "/contracts/firma/send", {
      token,
      body: {
        clientName: "Client",
        clientContact: "555-5555",
        clientEmail: "client@example.com",
        companyId: companyB,
      },
    });

    assert.equal(res.status, 404);
    assert.equal(res.json.error, "Company not found");
  } finally {
    server.close();
  }
});
