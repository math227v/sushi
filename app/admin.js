/* Admin dashboard — global stats and user management (admin role only). */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const api = (path, opts = {}) =>
    fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });

  let myId = null;

  async function load() {
    const meRes = await api("/api/me");
    if (!meRes.ok) return (window.location.href = "index.html");
    const me = await meRes.json();
    if (me.role !== "admin") {
      $("admin-denied").hidden = false;
      return;
    }
    myId = me.id;
    $("admin-content").hidden = false;
    await Promise.all([loadStats(), loadUsers()]);
  }

  async function loadStats() {
    const res = await api("/api/admin/stats");
    if (!res.ok) return;
    const s = await res.json();
    $("g-users").textContent = s.users;
    $("g-total").textContent = s.totalSushi;
    $("g-sessions").textContent = s.totalSessions;
    $("g-best").textContent = s.bestSession;
  }

  async function loadUsers() {
    const res = await api("/api/admin/users");
    if (!res.ok) return;
    const users = await res.json();
    const body = $("users-body");
    body.textContent = "";
    for (const u of users) {
      const tr = document.createElement("tr");
      const cells = [
        u.name,
        u.email,
        u.role === "admin" ? "👑 admin" : "user",
        String(u.total),
        String(u.bestSession),
        String(u.sessions),
        new Date(u.createdAt).toLocaleDateString(),
      ];
      for (const text of cells) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      }
      const actionTd = document.createElement("td");
      if (u.id !== myId) {
        const btn = document.createElement("button");
        btn.className = "danger-btn";
        btn.textContent = "🗑";
        btn.title = `Delete ${u.email}`;
        btn.addEventListener("click", async () => {
          if (!confirm(`Delete ${u.email} and all their sushi data?`)) return;
          const del = await api(`/api/admin/users/${encodeURIComponent(u.id)}`, { method: "DELETE" });
          if (del.ok) await Promise.all([loadStats(), loadUsers()]);
        });
        actionTd.appendChild(btn);
      }
      tr.appendChild(actionTd);
      body.appendChild(tr);
    }
  }

  load();
})();
