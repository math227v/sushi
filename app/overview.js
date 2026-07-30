/* Overview — day heatmap (more color = more sushi) and the session history list. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const api = (path) => fetch(path, { credentials: "same-origin" });

  const dayKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  async function load() {
    const meRes = await api("/api/me");
    if (!meRes.ok) return (window.location.href = "index.html");
    const [sessions, state] = await Promise.all([
      api("/api/sessions").then((r) => r.json()),
      api("/api/state").then((r) => r.json()),
    ]);
    renderHeatmap(sessions, state);
    renderSessions(sessions);
  }

  function renderHeatmap(sessions, state) {
    // sushi eaten per calendar day (finished sessions + today's live count)
    const counts = new Map();
    for (const s of sessions) {
      const key = dayKey(new Date(s.finishedAt));
      counts.set(key, (counts.get(key) || 0) + s.count);
    }
    const todayKey = dayKey(new Date());
    counts.set(todayKey, (counts.get(todayKey) || 0) + (state.session?.count || 0));

    // grid: 12 week columns, Monday-first, ending with the current week
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7 * 11);

    let max = 0;
    for (const v of counts.values()) max = Math.max(max, v);

    const grid = $("heatmap");
    grid.textContent = "";
    for (let w = 0; w < 12; w++) {
      const col = document.createElement("div");
      col.className = "hm-col";
      for (let d = 0; d < 7; d++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + w * 7 + d);
        const cell = document.createElement("span");
        cell.className = "hm-cell";
        if (date > today) {
          cell.dataset.level = "future";
        } else {
          const key = dayKey(date);
          const n = counts.get(key) || 0;
          const level = n === 0 ? 0 : Math.max(1, Math.ceil((n / max) * 4));
          cell.dataset.level = String(level);
          cell.dataset.date = key;
          cell.dataset.count = String(n);
          cell.title = `${n} sushi on ${key}`;
          if (key === todayKey) cell.classList.add("hm-today");
        }
        col.appendChild(cell);
      }
      grid.appendChild(col);
    }
  }

  function renderSessions(sessions) {
    $("session-total").textContent = `${sessions.length} finished`;
    $("no-sessions").hidden = sessions.length > 0;
    $("sessions-table").hidden = sessions.length === 0;
    const body = $("sessions-body");
    body.textContent = "";
    for (const s of sessions) {
      const minutes = s.elapsedMs / 60000;
      const spm = minutes > 0 ? Math.min(s.count / minutes, 999).toFixed(1) : "–";
      const when = new Date(s.finishedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const tr = document.createElement("tr");
      const cells = [
        when,
        `🍣 ${s.count}`,
        s.count >= s.goal ? `${s.goal} 🎉` : String(s.goal),
        formatTime(s.elapsedMs),
        spm,
        s.price > 0 ? s.price.toFixed(2) : "–",
        s.price > 0 && s.count > 0 ? (s.price / s.count).toFixed(2) : "–",
      ];
      for (const text of cells) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      }
      const actionTd = document.createElement("td");
      if (s.reopenable) {
        const btn = document.createElement("button");
        btn.className = "reopen-btn";
        btn.textContent = "↩ Reopen";
        btn.title = "Continue this session";
        btn.addEventListener("click", () => reopen(s.id, btn));
        actionTd.appendChild(btn);
      }
      tr.appendChild(actionTd);
      body.appendChild(tr);
    }
  }

  async function reopen(id, btn) {
    btn.disabled = true;
    const res = await fetch(`/api/sessions/${id}/reopen`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.ok) {
      window.location.href = "index.html";
      return;
    }
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Could not reopen this session 🥺");
    btn.disabled = false;
  }

  load();
})();
