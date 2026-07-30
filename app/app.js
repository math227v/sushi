/* Sushi Counter — progress is stored per-user on the server (SQLite via Better Auth sessions). */
(() => {
  "use strict";

  const POP_EMOJI = ["🍣", "🍤", "🍙", "🥢", "🍥", "🥟", "🍚", "✨"];

  const $ = (id) => document.getElementById(id);
  const els = {
    authScreen: $("auth-screen"),
    appScreen: $("app-screen"),
    tabSignin: $("tab-signin"),
    tabSignup: $("tab-signup"),
    authForm: $("auth-form"),
    authName: $("auth-name"),
    authEmail: $("auth-email"),
    authPassword: $("auth-password"),
    authSubmit: $("auth-submit"),
    authError: $("auth-error"),
    userName: $("user-name"),
    adminLink: $("admin-link"),
    signOut: $("sign-out"),
    sushiBtn: $("sushi-btn"),
    minusBtn: $("minus-btn"),
    count: $("count"),
    popLayer: $("pop-layer"),
    goalStatus: $("goal-status"),
    progressBar: $("progress-bar"),
    progressSwimmer: $("progress-swimmer"),
    goalMinus: $("goal-minus"),
    goalPlus: $("goal-plus"),
    goalInput: $("goal-input"),
    goalCheer: $("goal-cheer"),
    priceInput: $("price-input"),
    perSushi: $("per-sushi"),
    timerDisplay: $("timer-display"),
    timerToggle: $("timer-toggle"),
    timerReset: $("timer-reset"),
    spm: $("spm"),
    totalAllTime: $("total-all-time"),
    bestSession: $("best-session"),
    sessionsCount: $("sessions-count"),
    newSession: $("new-session"),
  };

  let state = {
    session: { count: 0, goal: 20, elapsedMs: 0, price: 0 },
    allTime: { total: 0, bestSession: 0, sessions: 0 },
  };
  let running = false;
  let startedAt = 0;
  let tickHandle = null;
  let saveHandle = null;

  const api = (path, opts = {}) =>
    fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });

  // ---- server sync ----
  function snapshot() {
    return {
      session: { ...state.session, elapsedMs: elapsedMs() },
      allTime: { ...state.allTime },
    };
  }

  function save({ now = false } = {}) {
    clearTimeout(saveHandle);
    if (now) {
      const body = JSON.stringify(snapshot());
      // keepalive lets the request finish even when the tab is closing
      fetch("/api/state", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } else {
      saveHandle = setTimeout(() => save({ now: true }), 500);
    }
  }

  function elapsedMs() {
    return state.session.elapsedMs + (running ? Date.now() - startedAt : 0);
  }

  // ---- timer ----
  function startTimer() {
    if (running) return;
    running = true;
    startedAt = Date.now();
    els.timerToggle.textContent = "⏸ Pause";
    tickHandle = setInterval(renderTime, 250);
    renderTime();
  }

  function pauseTimer() {
    if (!running) return;
    state.session.elapsedMs += Date.now() - startedAt;
    running = false;
    els.timerToggle.textContent = "▶ Start";
    clearInterval(tickHandle);
    save();
    renderTime();
  }

  function resetTimer() {
    running = false;
    clearInterval(tickHandle);
    state.session.elapsedMs = 0;
    els.timerToggle.textContent = "▶ Start";
    save();
    renderTime();
  }

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  // ---- counting ----
  function addSushi() {
    state.session.count += 1;
    state.allTime.total += 1;
    if (state.session.count > state.allTime.bestSession) {
      state.allTime.bestSession = state.session.count;
    }
    if (!running) startTimer(); // timer starts on first sushi
    spawnPop();
    els.sushiBtn.classList.remove("boing");
    els.count.classList.remove("pop-count");
    void els.sushiBtn.offsetWidth; // restart animations
    els.sushiBtn.classList.add("boing");
    els.count.classList.add("pop-count");
    save();
    render();
  }

  function removeSushi() {
    if (state.session.count === 0) return;
    state.session.count -= 1;
    state.allTime.total = Math.max(0, state.allTime.total - 1);
    save();
    render();
  }

  function spawnPop() {
    const pop = document.createElement("span");
    pop.className = "pop";
    pop.textContent = POP_EMOJI[Math.floor(Math.random() * POP_EMOJI.length)];
    pop.style.left = 30 + Math.random() * 40 + "%";
    pop.style.top = 20 + Math.random() * 30 + "%";
    els.popLayer.appendChild(pop);
    setTimeout(() => pop.remove(), 1000);
  }

  // ---- goal ----
  function setGoal(value) {
    const goal = Math.min(999, Math.max(1, Math.floor(Number(value) || 1)));
    state.session.goal = goal;
    els.goalInput.value = goal;
    save();
    render();
  }

  // ---- price ----
  function setPrice(value) {
    const n = Number(value);
    state.session.price = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
    save();
    render();
  }

  // ---- sessions ----
  async function finishSession() {
    clearTimeout(saveHandle);
    const body = JSON.stringify(snapshot());
    running = false;
    clearInterval(tickHandle);
    els.timerToggle.textContent = "▶ Start";
    try {
      const res = await api("/api/sessions", { method: "POST", body });
      if (res.ok) state = await res.json();
    } catch {
      /* offline — state stays as-is and syncs next save */
    }
    els.priceInput.value = "";
    render();
    renderTime();
  }

  // ---- rendering ----
  function render() {
    const { count, goal } = state.session;
    els.count.textContent = count;
    els.goalStatus.textContent = `${count} / ${goal}`;
    const pct = Math.min(100, (count / goal) * 100);
    els.progressBar.style.width = pct + "%";
    els.progressSwimmer.style.left = pct + "%";
    els.goalCheer.hidden = count < goal;
    els.goalInput.value = goal;
    els.totalAllTime.textContent = state.allTime.total;
    els.bestSession.textContent = state.allTime.bestSession;
    els.sessionsCount.textContent = state.allTime.sessions;
    const { price } = state.session;
    els.perSushi.textContent =
      price > 0 && count > 0 ? `${(price / count).toFixed(2)} / 🍣` : "–";
    renderSpm();
  }

  function renderTime() {
    els.timerDisplay.textContent = formatTime(elapsedMs());
    renderSpm();
  }

  function renderSpm() {
    const minutes = elapsedMs() / 60000;
    const spm = minutes > 0 ? state.session.count / minutes : 0;
    els.spm.textContent = (Math.min(spm, 999) || 0).toFixed(1);
  }

  // ---- auth ----
  let mode = "signin";

  function setMode(next) {
    mode = next;
    els.tabSignin.classList.toggle("active", mode === "signin");
    els.tabSignup.classList.toggle("active", mode === "signup");
    els.authName.hidden = mode === "signin";
    els.authName.required = mode === "signup";
    els.authPassword.autocomplete = mode === "signin" ? "current-password" : "new-password";
    els.authSubmit.textContent = mode === "signin" ? "Sign in 🍜" : "Create account 🍱";
    els.authError.hidden = true;
  }

  async function submitAuth(e) {
    e.preventDefault();
    els.authError.hidden = true;
    els.authSubmit.disabled = true;
    try {
      const endpoint = mode === "signin" ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email";
      const body = {
        email: els.authEmail.value.trim(),
        password: els.authPassword.value,
      };
      if (mode === "signup") body.name = els.authName.value.trim();
      const res = await api(endpoint, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "That didn't work — check your details 🥺");
      }
      await enterApp();
    } catch (err) {
      els.authError.textContent = err.message;
      els.authError.hidden = false;
    } finally {
      els.authSubmit.disabled = false;
    }
  }

  async function signOut() {
    save({ now: true });
    await api("/api/auth/sign-out", { method: "POST", body: "{}" }).catch(() => {});
    running = false;
    clearInterval(tickHandle);
    showAuth();
  }

  function showAuth() {
    els.appScreen.hidden = true;
    els.authScreen.hidden = false;
  }

  async function enterApp() {
    const meRes = await api("/api/me");
    if (!meRes.ok) return showAuth();
    const me = await meRes.json();
    const stateRes = await api("/api/state");
    if (!stateRes.ok) return showAuth();
    state = await stateRes.json();
    running = false;
    clearInterval(tickHandle);
    els.timerToggle.textContent = "▶ Start";
    els.userName.textContent = `🐟 ${me.name}`;
    els.adminLink.hidden = me.role !== "admin";
    els.priceInput.value = state.session.price > 0 ? state.session.price : "";
    els.authScreen.hidden = true;
    els.appScreen.hidden = false;
    render();
    renderTime();
  }

  // ---- wire up ----
  els.tabSignin.addEventListener("click", () => setMode("signin"));
  els.tabSignup.addEventListener("click", () => setMode("signup"));
  els.authForm.addEventListener("submit", submitAuth);
  els.signOut.addEventListener("click", signOut);

  els.sushiBtn.addEventListener("click", addSushi);
  els.minusBtn.addEventListener("click", removeSushi);
  els.timerToggle.addEventListener("click", () => (running ? pauseTimer() : startTimer()));
  els.timerReset.addEventListener("click", resetTimer);
  els.goalMinus.addEventListener("click", () => setGoal(state.session.goal - 1));
  els.goalPlus.addEventListener("click", () => setGoal(state.session.goal + 1));
  els.goalInput.addEventListener("change", (e) => setGoal(e.target.value));
  els.priceInput.addEventListener("input", (e) => setPrice(e.target.value));
  els.newSession.addEventListener("click", finishSession);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && !els.appScreen.hidden) save({ now: true });
  });
  window.addEventListener("pagehide", () => {
    if (!els.appScreen.hidden) save({ now: true });
  });

  setMode("signin");
  enterApp(); // shows the auth screen if there is no session
})();
