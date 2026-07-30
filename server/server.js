import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";
import { getState, saveState, adminListUsers, adminGlobalStats, adminDeleteUser } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

const app = express();
app.disable("x-powered-by");

// Better Auth owns /api/auth/* (must be mounted before express.json()).
app.all("/api/auth/*", toNodeHandler(auth));
app.use(express.json());

async function requireUser(req, res, next) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) return res.status(401).json({ error: "unauthorized" });
    req.user = session.user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "admin only" });
  next();
}

app.get("/api/me", requireUser, (req, res) => {
  const { id, name, email, role } = req.user;
  res.json({ id, name, email, role });
});

app.get("/api/state", requireUser, (req, res) => {
  res.json(getState(req.user.id));
});

app.put("/api/state", requireUser, (req, res) => {
  res.json(saveState(req.user.id, req.body));
});

app.get("/api/admin/stats", requireUser, requireAdmin, (req, res) => {
  res.json(adminGlobalStats());
});

app.get("/api/admin/users", requireUser, requireAdmin, (req, res) => {
  res.json(adminListUsers());
});

app.delete("/api/admin/users/:id", requireUser, requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "you cannot delete yourself" });
  }
  const deleted = adminDeleteUser(req.params.id);
  if (!deleted) return res.status(404).json({ error: "user not found" });
  res.json({ ok: true });
});

app.get("/api/healthz", (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, "..", "app")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal error" });
});

app.listen(PORT, () => {
  console.log(`🍣 Sushi Counter listening on http://localhost:${PORT}`);
});
