const STORAGE_KEYS = {
  app: "focusflow-ai.app",
};

const DURATIONS = {
  focus: 25 * 60 * 1000,
  break: 5 * 60 * 1000,
};

const DISTRACTION_OPTIONS = [
  "Phone",
  "Social media",
  "Noise",
  "Messages",
  "Tab switching",
  "Fatigue",
  "Hunger",
  "Daydreaming",
];

const DEFAULT_SUMMARY = {
  headline: "Complete a focus session to generate your first recap.",
  body: "Your summary will include the finished task, detected distractions, and a few practical suggestions to strengthen the next session.",
  suggestions: ["Start a 25-minute focus block to unlock tailored suggestions."],
};

const DEFAULT_STATE = {
  timer: {
    mode: "focus",
    running: false,
    remainingMs: DURATIONS.focus,
    targetEndTime: null,
    selectedDistractions: [],
    pendingSession: null,
  },
  sessions: [],
  streak: {
    current: 0,
    longest: 0,
    lastCompletedDate: null,
  },
  summary: DEFAULT_SUMMARY,
};

const els = {
  todayLabel: document.getElementById("today-label"),
  statusLine: document.getElementById("status-line"),
  modeChip: document.getElementById("mode-chip"),
  timerRing: document.getElementById("timer-ring"),
  timerCaption: document.getElementById("timer-caption"),
  timerDisplay: document.getElementById("timer-display"),
  timerSubcaption: document.getElementById("timer-subcaption"),
  nextPhaseLabel: document.getElementById("next-phase-label"),
  phaseDescription: document.getElementById("phase-description"),
  phaseLength: document.getElementById("phase-length"),
  todayCount: document.getElementById("today-count"),
  totalSessions: document.getElementById("total-sessions"),
  totalTime: document.getElementById("total-time"),
  currentStreak: document.getElementById("current-streak"),
  longestStreak: document.getElementById("longest-streak"),
  streakCaption: document.getElementById("streak-caption"),
  distractionOptions: document.getElementById("distraction-options"),
  summaryHeadline: document.getElementById("summary-headline"),
  summaryBody: document.getElementById("summary-body"),
  summarySuggestions: document.getElementById("summary-suggestions"),
  historyList: document.getElementById("history-list"),
  weeklySummary: document.getElementById("weekly-summary"),
  startBtn: document.getElementById("start-btn"),
  pauseBtn: document.getElementById("pause-btn"),
  resetBtn: document.getElementById("reset-btn"),
  exportBtn: document.getElementById("export-btn"),
  modal: document.getElementById("session-modal"),
  modalCopy: document.getElementById("modal-copy"),
  sessionForm: document.getElementById("session-form"),
  taskInput: document.getElementById("task-input"),
  exportCanvas: document.getElementById("export-canvas"),
};

let state = loadState();
let tickHandle = null;

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.app);
    if (!saved) {
      return cloneDefaultState();
    }

    const parsed = JSON.parse(saved);
    return {
      ...cloneDefaultState(),
      ...parsed,
      timer: {
        ...cloneDefaultState().timer,
        ...(parsed.timer || {}),
      },
      streak: {
        ...cloneDefaultState().streak,
        ...(parsed.streak || {}),
      },
      summary: {
        ...DEFAULT_SUMMARY,
        ...(parsed.summary || {}),
      },
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch (error) {
    console.warn("Unable to read FocusFlow AI state from localStorage.", error);
    return cloneDefaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEYS.app, JSON.stringify(state));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function getLocalDateKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfLocalDay(timestamp) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isPreviousLocalDay(previousKey, currentKey) {
  const previous = dateFromKey(previousKey);
  previous.setDate(previous.getDate() + 1);
  return getLocalDateKey(previous.getTime()) === currentKey;
}

function getEffectiveStreak() {
  if (!state.streak.lastCompletedDate) {
    return 0;
  }

  const todayKey = getLocalDateKey(Date.now());
  if (
    state.streak.lastCompletedDate === todayKey ||
    isPreviousLocalDay(state.streak.lastCompletedDate, todayKey)
  ) {
    return state.streak.current;
  }

  return 0;
}

function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

function getPhaseDuration(mode) {
  return mode === "break" ? DURATIONS.break : DURATIONS.focus;
}

function getRemainingMs() {
  if (!state.timer.running || !state.timer.targetEndTime) {
    return state.timer.remainingMs;
  }

  return Math.max(0, state.timer.targetEndTime - Date.now());
}

function getTodaySessionCount() {
  const todayKey = getLocalDateKey(Date.now());
  return state.sessions.filter((session) => getLocalDateKey(session.timestamp) === todayKey).length;
}

function updateStreak(sessionTimestamp) {
  const currentDate = getLocalDateKey(sessionTimestamp);

  if (!state.streak.lastCompletedDate) {
    state.streak.current = 1;
  } else if (state.streak.lastCompletedDate === currentDate) {
    state.streak.current = Math.max(1, state.streak.current);
  } else if (isPreviousLocalDay(state.streak.lastCompletedDate, currentDate)) {
    state.streak.current += 1;
  } else {
    state.streak.current = 1;
  }

  state.streak.lastCompletedDate = currentDate;
  state.streak.longest = Math.max(state.streak.longest, state.streak.current);
}

function updateStatusLine(message) {
  els.statusLine.textContent = message;
}

function startTimer() {
  if (state.timer.running || state.timer.pendingSession) {
    return;
  }

  state.timer.running = true;
  state.timer.targetEndTime = Date.now() + state.timer.remainingMs;
  saveState();
  render();
}

function pauseTimer() {
  if (!state.timer.running) {
    return;
  }

  state.timer.remainingMs = getRemainingMs();
  state.timer.running = false;
  state.timer.targetEndTime = null;
  saveState();
  render();
}

function resetTimer() {
  state.timer.running = false;
  state.timer.targetEndTime = null;
  state.timer.remainingMs = getPhaseDuration(state.timer.mode);
  saveState();
  render();
}

function switchMode(nextMode) {
  state.timer.mode = nextMode;
  state.timer.running = false;
  state.timer.targetEndTime = null;
  state.timer.remainingMs = getPhaseDuration(nextMode);
}

function createPendingSession(completedAt) {
  const sessionId = `focus-${completedAt}`;
  const alreadyLogged = state.sessions.some((session) => session.id === sessionId);

  if (alreadyLogged) {
    return;
  }

  state.timer.pendingSession = {
    id: sessionId,
    completedAt,
    durationMs: DURATIONS.focus,
    distractions: [...state.timer.selectedDistractions],
  };
}

function completePhase(completedAt) {
  if (state.timer.mode === "focus") {
    createPendingSession(completedAt);
    switchMode("break");
    updateStatusLine("Focus session complete. Name the task to save your progress.");
    openSessionModal();
  } else {
    switchMode("focus");
    updateStatusLine("Break complete. Start the next focus block when you're ready.");
  }

  state.timer.selectedDistractions = [];
  saveState();
  render();
}

function tick() {
  if (!state.timer.running) {
    return;
  }

  const remainingMs = getRemainingMs();
  if (remainingMs <= 0) {
    completePhase(state.timer.targetEndTime || Date.now());
    return;
  }

  renderTimerOnly(remainingMs);
}

function ensureTicker() {
  if (tickHandle) {
    window.clearInterval(tickHandle);
  }

  tickHandle = window.setInterval(tick, 250);
}

function syncTimerAfterReload() {
  if (!state.timer.running || !state.timer.targetEndTime) {
    return;
  }

  const remainingMs = state.timer.targetEndTime - Date.now();
  if (remainingMs <= 0) {
    completePhase(state.timer.targetEndTime);
    return;
  }

  state.timer.remainingMs = remainingMs;
}

function createSummary(entry) {
  const effectiveStreak = getEffectiveStreak();
  const distractionLine = entry.distractions.length
    ? `You noticed ${entry.distractions.join(", ")} during the block, which gives us a clear pattern to work on.`
    : "You completed the block without recording any distractions, which is a strong signal that the environment is working.";

  const suggestions = [];

  if (entry.distractions.includes("Phone") || entry.distractions.includes("Messages")) {
    suggestions.push("Put your phone on Do Not Disturb before the next focus session starts.");
  }

  if (entry.distractions.includes("Tab switching") || entry.distractions.includes("Social media")) {
    suggestions.push("Keep only task-critical tabs open and park everything else in a reading list.");
  }

  if (entry.distractions.includes("Fatigue") || entry.distractions.includes("Hunger")) {
    suggestions.push("Add a quick pre-session energy check so breaks solve the right problem.");
  }

  if (!suggestions.length) {
    suggestions.push("Reuse this same setup for the next session because the conditions were stable.");
  }

  suggestions.push(
    effectiveStreak > 1
      ? `Protect your ${effectiveStreak}-day streak with one more session before the day ends.`
      : "Stack one more session today to turn progress into a streak."
  );

  return {
    headline: `${entry.task} is logged and your focus data is updated.`,
    body: `${formatDuration(entry.durationMs)} of focused work was completed on ${entry.task}. ${distractionLine}`,
    suggestions,
  };
}

function saveSession(taskName) {
  const pending = state.timer.pendingSession;
  if (!pending) {
    return;
  }

  const task = taskName.trim();
  if (!task) {
    return;
  }

  const duplicate = state.sessions.some((session) => session.id === pending.id);
  if (duplicate) {
    state.timer.pendingSession = null;
    saveState();
    closeSessionModal();
    render();
    return;
  }

  const entry = {
    id: pending.id,
    task,
    durationMs: pending.durationMs,
    timestamp: pending.completedAt,
    distractions: [...pending.distractions],
  };

  state.sessions.unshift(entry);
  updateStreak(entry.timestamp);
  state.summary = createSummary(entry);
  state.timer.pendingSession = null;
  state.timer.selectedDistractions = [];
  saveState();
  closeSessionModal();
  updateStatusLine(`Saved session for ${task}.`);
  render();
}

function openSessionModal() {
  const pending = state.timer.pendingSession;
  if (!pending) {
    return;
  }

  els.modal.hidden = false;
  els.modalCopy.textContent = `Your ${formatDuration(pending.durationMs)} focus session just ended. Give it a task name so it can be logged once and only once.`;
  els.taskInput.value = "";
  window.setTimeout(() => els.taskInput.focus(), 0);
}

function closeSessionModal() {
  els.modal.hidden = true;
}

function renderDistractionOptions() {
  els.distractionOptions.innerHTML = DISTRACTION_OPTIONS.map((option) => {
    const checked = state.timer.selectedDistractions.includes(option) ? "checked" : "";
    return `
      <label class="tag-toggle">
        <input type="checkbox" value="${escapeHtml(option)}" ${checked} />
        <span>${escapeHtml(option)}</span>
      </label>
    `;
  }).join("");
}

function renderSummary() {
  els.summaryHeadline.textContent = state.summary.headline;
  els.summaryBody.textContent = state.summary.body;
  els.summarySuggestions.innerHTML = state.summary.suggestions
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function renderStatusLine() {
  if (state.timer.pendingSession) {
    updateStatusLine("Focus session complete. Name the task to save your progress.");
    return;
  }

  if (state.timer.running) {
    updateStatusLine(
      state.timer.mode === "focus"
        ? "Focus block is live with timestamp-based accuracy."
        : "Break block is running. Recover, reset, and get ready."
    );
    return;
  }

  updateStatusLine(
    state.timer.mode === "focus"
      ? "Ready for your next deep work block."
      : "Break is loaded and paused. Start it when you are ready."
  );
}

function renderStats() {
  const totalDuration = state.sessions.reduce((sum, session) => sum + session.durationMs, 0);
  const effectiveStreak = getEffectiveStreak();

  els.totalSessions.textContent = String(state.sessions.length);
  els.totalTime.textContent = formatDuration(totalDuration);
  els.currentStreak.textContent = `${effectiveStreak} day${effectiveStreak === 1 ? "" : "s"}`;
  els.longestStreak.textContent = `${state.streak.longest} day${state.streak.longest === 1 ? "" : "s"}`;
  els.streakCaption.textContent = effectiveStreak
    ? "Your streak is safe if you studied today or yesterday."
    : "A missed local day resets the visible streak to zero.";
  els.todayCount.textContent = String(getTodaySessionCount());
}

function renderHistory() {
  if (!state.sessions.length) {
    els.historyList.innerHTML = `
      <article class="empty-state">
        <strong>No sessions logged yet.</strong>
        <p>Your finished Pomodoro blocks will appear here with task names and timestamps.</p>
      </article>
    `;
    return;
  }

  els.historyList.innerHTML = state.sessions
    .slice(0, 8)
    .map((session) => {
      const distractionText = session.distractions.length
        ? `Distractions: ${session.distractions.join(", ")}`
        : "Distractions: None recorded";

      return `
        <article class="history-item">
          <div class="history-item__top">
            <h3>${escapeHtml(session.task)}</h3>
            <strong>${formatDuration(session.durationMs)}</strong>
          </div>
          <div class="history-item__meta">
            <span>${escapeHtml(formatDateTime(session.timestamp))}</span>
            <span>${escapeHtml(getLocalDateKey(session.timestamp))}</span>
          </div>
          <p>${escapeHtml(distractionText)}</p>
        </article>
      `;
    })
    .join("");
}

function renderWeeklySummary() {
  const threshold = startOfLocalDay(Date.now()) - 6 * 24 * 60 * 60 * 1000;
  const counts = new Map();

  state.sessions.forEach((session) => {
    if (session.timestamp < threshold) {
      return;
    }

    session.distractions.forEach((item) => {
      counts.set(item, (counts.get(item) || 0) + 1);
    });
  });

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  if (!ranked.length) {
    els.weeklySummary.innerHTML = `
      <article class="empty-state">
        <strong>No distractions tracked this week.</strong>
        <p>Select distraction tags during focus sessions to reveal your patterns.</p>
      </article>
    `;
    return;
  }

  els.weeklySummary.innerHTML = ranked
    .map(([label, count]) => {
      const message = count === 1 ? "showed up once this week" : `showed up ${count} times this week`;
      return `
        <article class="weekly-item">
          <div class="weekly-item__top">
            <strong>${escapeHtml(label)}</strong>
            <span>${count}</span>
          </div>
          <p>${escapeHtml(message)} across your logged focus sessions.</p>
        </article>
      `;
    })
    .join("");
}

function renderTimerOnly(remainingMs = getRemainingMs()) {
  const mode = state.timer.mode;
  const duration = getPhaseDuration(mode);
  const elapsed = duration - remainingMs;
  const progress = Math.min(Math.max(elapsed / duration, 0), 1);

  els.todayLabel.textContent = new Date().toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  els.modeChip.textContent = mode === "focus" ? "Focus session" : "Break session";
  els.timerCaption.textContent = mode === "focus" ? "Deep work countdown" : "Recovery countdown";
  els.timerDisplay.textContent = formatClock(remainingMs);
  els.timerSubcaption.textContent = mode === "focus" ? "25 minutes of focus" : "5 minutes of recovery";
  els.timerRing.style.setProperty("--progress", String(progress));
  els.phaseLength.textContent = formatDuration(duration);
  els.nextPhaseLabel.textContent =
    mode === "focus" ? "Break unlocked after focus" : "Focus unlocked after break";
  els.phaseDescription.textContent = state.timer.running
    ? "The timer is active and derived from a fixed end timestamp."
    : "Start when ready. The countdown resumes from the exact remaining time.";
  els.startBtn.disabled = state.timer.running || Boolean(state.timer.pendingSession);
  els.pauseBtn.disabled = !state.timer.running;
}

function render() {
  renderStatusLine();
  renderTimerOnly();
  renderStats();
  renderSummary();
  renderHistory();
  renderWeeklySummary();
  renderDistractionOptions();

  if (state.timer.pendingSession) {
    openSessionModal();
  } else {
    closeSessionModal();
  }
}

function drawExportCard() {
  const canvas = els.exportCanvas;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const effectiveStreak = getEffectiveStreak();
  const totalDuration = state.sessions.reduce((sum, session) => sum + session.durationMs, 0);
  const recent = state.sessions.slice(0, 3);

  ctx.clearRect(0, 0, width, height);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#08131a");
  background.addColorStop(0.55, "#0d2630");
  background.addColorStop(1, "#132028");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(180, 120, 20, 180, 120, 320);
  glow.addColorStop(0, "rgba(122, 240, 196, 0.24)");
  glow.addColorStop(1, "rgba(122, 240, 196, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
  ctx.fillRect(60, 60, width - 120, height - 120);

  ctx.fillStyle = "#7af0c4";
  ctx.font = "600 20px 'IBM Plex Mono'";
  ctx.fillText("FOCUSFLOW AI // PROGRESS CARD", 96, 116);

  ctx.fillStyle = "#f5f2ea";
  ctx.font = "800 68px Syne";
  ctx.fillText("Your focus momentum", 92, 200);

  ctx.fillStyle = "#a6b9bf";
  ctx.font = "400 26px 'Space Grotesk'";
  ctx.fillText(new Date().toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }), 96, 246);

  const metrics = [
    { label: "Sessions", value: String(state.sessions.length) },
    { label: "Focus Time", value: formatDuration(totalDuration) },
    { label: "Streak", value: `${effectiveStreak} day${effectiveStreak === 1 ? "" : "s"}` },
  ];

  metrics.forEach((metric, index) => {
    const x = 96 + index * 270;
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.fillRect(x, 298, 230, 126);
    ctx.fillStyle = "#7af0c4";
    ctx.font = "600 16px 'IBM Plex Mono'";
    ctx.fillText(metric.label.toUpperCase(), x + 24, 338);
    ctx.fillStyle = "#f5f2ea";
    ctx.font = "700 38px 'Space Grotesk'";
    ctx.fillText(metric.value, x + 24, 388);
  });

  ctx.fillStyle = "#ffb85c";
  ctx.font = "600 18px 'IBM Plex Mono'";
  ctx.fillText("LATEST AI RECAP", 96, 492);

  ctx.fillStyle = "#f5f2ea";
  ctx.font = "700 34px 'Space Grotesk'";
  ctx.fillText(state.summary.headline.slice(0, 44), 96, 536);

  ctx.fillStyle = "#a6b9bf";
  ctx.font = "400 22px 'Space Grotesk'";
  wrapText(ctx, state.summary.body, 96, 574, 620, 32);

  ctx.fillStyle = "#7af0c4";
  ctx.font = "600 18px 'IBM Plex Mono'";
  ctx.fillText("RECENT TASKS", 810, 298);

  recent.forEach((session, index) => {
    const y = 336 + index * 94;
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.fillRect(780, y, 320, 72);
    ctx.fillStyle = "#f5f2ea";
    ctx.font = "700 24px 'Space Grotesk'";
    ctx.fillText(trimText(ctx, session.task, 260), 802, y + 30);
    ctx.fillStyle = "#a6b9bf";
    ctx.font = "400 18px 'Space Grotesk'";
    ctx.fillText(`${formatDuration(session.durationMs)} // ${formatDateTime(session.timestamp)}`, 802, y + 56);
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let currentY = y;

  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(nextLine).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
      return;
    }

    line = nextLine;
  });

  if (line) {
    ctx.fillText(line, x, currentY);
  }
}

function trimText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let trimmed = text;
  while (trimmed.length && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}...`;
}

function exportPng() {
  drawExportCard();
  const url = els.exportCanvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = url;
  link.download = `focusflow-progress-${getLocalDateKey(Date.now())}.png`;
  link.click();
  updateStatusLine("PNG progress card exported.");
}

function handleDistractionChange(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") {
    return;
  }

  if (input.checked) {
    state.timer.selectedDistractions = [...new Set([...state.timer.selectedDistractions, input.value])];
  } else {
    state.timer.selectedDistractions = state.timer.selectedDistractions.filter((item) => item !== input.value);
  }

  saveState();
}

function attachEvents() {
  els.startBtn.addEventListener("click", startTimer);
  els.pauseBtn.addEventListener("click", pauseTimer);
  els.resetBtn.addEventListener("click", resetTimer);
  els.exportBtn.addEventListener("click", exportPng);
  els.distractionOptions.addEventListener("change", handleDistractionChange);

  els.sessionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSession(els.taskInput.value);
  });
}

function init() {
  syncTimerAfterReload();
  attachEvents();
  ensureTicker();
  render();
}

init();
