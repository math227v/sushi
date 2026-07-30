import { betterAuth } from "better-auth";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, countUsers, DB_PATH } from "./db.js";

// Use BETTER_AUTH_SECRET if provided; otherwise generate one once and keep it
// next to the database so sessions survive restarts.
function loadSecret() {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const secretPath = path.join(path.dirname(DB_PATH), ".auth-secret");
  try {
    return fs.readFileSync(secretPath, "utf8").trim();
  } catch {
    const secret = crypto.randomBytes(32).toString("base64");
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    return secret;
  }
}

export const auth = betterAuth({
  database: db,
  secret: loadSecret(),
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:8080",
  trustedOrigins: (process.env.TRUSTED_ORIGINS || "http://localhost:8080")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false, // clients can never set their own role
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // The very first account on this instance becomes the admin.
          const role = countUsers() === 0 ? "admin" : "user";
          return { data: { ...user, role } };
        },
      },
    },
  },
});
