/* Sushi Counter — all data lives in localStorage, nothing leaves the device. */
(() => {
  "use strict";

  const STORAGE_KEY = "sushi-counter-v1";
  const POP_EMOJI = ["🍣", "🍤", "🍙", "🥢", "🍥", "🥟", "🍚", "✨"];

  const $ = (id) => document.getElementById(id);
  const els = {
    sushiBtn: $("sushi-btn"),
    count: $("count"),
    popLayer: $("pop-layer"),
    goalStatus: $("goal-status"),
    progressBar: $("progress-bar"),
    progressSwimmer: $("progress-swimmer"),
    goalMinus: $("goal-minus"),
    goalPlus: $("goal-plus"),
    goalInput: $("goal-input"),
    goalCheer: $("goal-cheer"),
    timerDisplay: $("timer-display"),
    timerToggle: $("timer-toggle"),
    timerReset: $("timer-reset"),
    spm: $("spm"),
    totalAllTime: $("total-all-time"),
    bestSession: $("best-session"),
    sessionsCount: $("sessions-count"),
    newSession: $("new-session"),
  };

  const defaultState = () => ({
    session: { count: 0, goal: 20, elapsedMs: 0 },
    allTime: { total: 0, bestSession: 0, sessions: 0 },
  });

  let state = load();
  // Timer runtime (not persisted as "running" — a reload resumes paused).
  let running = false;
  let startedAt = 0; // performance-independent wall clock anchor while running
  let tickHandle = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      return {
        session: { ...base.session, ...(parsed.session || {}) },
        allTime: { ...base.allTime, ...(parsed.allTime || {}) },
      };
    } catch {
      return defaultState();
    }
  }

  function save() {
    state.session.elapsedMs = elapsedMs();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked — the app still works for this session */
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
    void els.sushiBtn.offsetWidth; // restart animation
    els.sushiBtn.classList.add("boing");
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

  // ---- sessions ----
  function finishSession() {
    if (state.session.count > 0 || elapsedMs() > 0) {
      state.allTime.sessions += 1;
    }
    running = false;
    clearInterval(tickHandle);
    els.timerToggle.textContent = "▶ Start";
    state.session.count = 0;
    state.session.elapsedMs = 0;
    save();
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
    renderSpm();
  }

  function renderTime() {
    els.timerDisplay.textContent = formatTime(elapsedMs());
    renderSpm();
  }

  function renderSpm() {
    const minutes = elapsedMs() / 60000;
    const spm = minutes > 0 ? state.session.count / minutes : 0;
    // Cap silly values from sub-second sessions so the display stays readable.
    els.spm.textContent = (Math.min(spm, 999) || 0).toFixed(1);
  }

  // ---- wire up ----
  els.sushiBtn.addEventListener("click", addSushi);
  els.timerToggle.addEventListener("click", () => (running ? pauseTimer() : startTimer()));
  els.timerReset.addEventListener("click", resetTimer);
  els.goalMinus.addEventListener("click", () => setGoal(state.session.goal - 1));
  els.goalPlus.addEventListener("click", () => setGoal(state.session.goal + 1));
  els.goalInput.addEventListener("change", (e) => setGoal(e.target.value));
  els.newSession.addEventListener("click", finishSession);

  // Persist the ticking clock when the tab hides or closes.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });
  window.addEventListener("pagehide", save);

  render();
  renderTime();
})();
