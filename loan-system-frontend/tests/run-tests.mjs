import assert from "node:assert/strict";

import {
  clearAuth,
  getAuth,
  getRole,
  getTokenExpiry,
  isAuthed,
  isTokenExpired,
  saveAuth,
} from "../src/auth/auth.js";
import { buildDefaultCreditline, calculateTermMonths } from "../src/utils/application.js";

function toBase64Url(value) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makeToken(payload) {
  return `header.${toBase64Url(payload)}.signature`;
}

function installStorage() {
  const store = new Map();
  global.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function run(name, fn) {
  try {
    installStorage();
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

global.atob = (value) => Buffer.from(value, "base64").toString("utf8");

run("getTokenExpiry returns milliseconds", () => {
  const token = makeToken({ exp: 2000 });
  assert.equal(getTokenExpiry(token), 2000 * 1000);
});

run("isTokenExpired treats malformed tokens as expired", () => {
  assert.equal(isTokenExpired("bad-token"), true);
});

run("saveAuth/getAuth round-trip valid auth state", () => {
  const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 });

  saveAuth({ token, role: "ANALYST", user_id: 7 });

  assert.equal(getRole(), "ANALYST");
  assert.deepEqual(getAuth(), {
    token,
    role: "ANALYST",
    user_id: 7,
  });
  assert.equal(isAuthed(), true);
});

run("expired token is cleared and treated as logged out", () => {
  const token = makeToken({ exp: Math.floor(Date.now() / 1000) - 10 });

  saveAuth({ token, role: "ADMIN", user_id: 9 });

  assert.equal(isAuthed(), false);
  assert.equal(global.localStorage.getItem("token"), null);
  assert.equal(getAuth(), null);
});

run("clearAuth removes all stored auth fields", () => {
  saveAuth({
    token: makeToken({ exp: Math.floor(Date.now() / 1000) + 60 }),
    role: "ADMIN",
    user_id: 3,
  });

  clearAuth();

  assert.equal(global.localStorage.getItem("token"), null);
  assert.equal(global.localStorage.getItem("role"), null);
  assert.equal(global.localStorage.getItem("user_id"), null);
});

run("calculateTermMonths returns ceiling of amount divided by payment plan", () => {
  assert.equal(calculateTermMonths(25000000, 5000000), "5");
  assert.equal(calculateTermMonths("1000", "300"), "4");
});

run("calculateTermMonths returns empty string for invalid values", () => {
  assert.equal(calculateTermMonths("", 100), "");
  assert.equal(calculateTermMonths(100, 0), "");
  assert.equal(calculateTermMonths(-1, 100), "");
});

run("buildDefaultCreditline uses client account when present", () => {
  const originalNow = Date.now;
  Date.now = () => 1712345678901;

  try {
    assert.equal(
      buildDefaultCreditline({ account: "5226274-02/004" }),
      "AUTO-522627402004-45678901",
    );
  } finally {
    Date.now = originalNow;
  }
});

run("buildDefaultCreditline falls back to client id when account is missing", () => {
  const originalNow = Date.now;
  Date.now = () => 1700000012345;

  try {
    assert.equal(buildDefaultCreditline({ id: 44 }), "AUTO-44-00012345");
  } finally {
    Date.now = originalNow;
  }
});

if (!process.exitCode) {
  console.log("All frontend tests passed.");
}
