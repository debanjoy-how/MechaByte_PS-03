const STORAGE_KEYS = {
  app: "focusflow-ai.app",
  theme: "focusflow-ai.theme",
  dailyGoal: "focusflow-ai.daily-goal",
};

const DURATIONS = {
  focus: 25 * 60 * 1000,
  break: 5 * 60 * 1000,
};

const DEFAULT_DAILY_GOAL = 4;

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
    sessionStartTime: null,
    selectedDistractions: [],
    distractionCount: 0,
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
  liveClock: document.getElementById("live-clock"),
  statusLine: document.getElementById("status-line"),
  themeToggle: document.getElementById("theme-toggle"),
  fullscreenToggle: document.getElementById("fullscreen-toggle"),
  modeChip: document.getElementById("mode-chip"),
  focusModeIndicator: document.getElementById("focus-mode-indicator"),
  timerRing: document.getElementById("timer-ring"),
  timerCaption: document.getElementById("timer-caption"),
  timerDisplay: document.getElementById("timer-display"),
  timerSubcaption: document.getElementById("timer-subcaption"),
  nextPhaseLabel: document.getElementById("next-phase-label"),
  phaseDescription: document.getElementById("phase-description"),
  phaseLength: document.getElementById("phase-length"),
  todayCount: document.getElementById("today-count"),
  focusDistractionCount: document.getElementById("focus-distraction-count"),
  totalSessions: document.getElementById("total-sessions"),
  totalTime: document.getElementById("total-time"),
  analyticsTotalSessions: document.getElementById("analytics-total-sessions"),
  analyticsTotalTime: document.getElementById("analytics-total-time"),
  sessionsChart: document.getElementById("sessions-chart"),
  currentStreak: document.getElementById("current-streak"),
  longestStreak: document.getElementById("longest-streak"),
  streakCaption: document.getElementById("streak-caption"),
  goalForm: document.getElementById("goal-form"),
  goalInput: document.getElementById("goal-input"),
  goalSaveBtn: document.getElementById("goal-save-btn"),
  goalTitle: document.getElementById("goal-title"),
  goalProgressChip: document.getElementById("goal-progress-chip"),
  goalProgressFill: document.getElementById("goal-progress-fill"),
  goalProgressText: document.getElementById("goal-progress-text"),
  productivityScore: document.getElementById("productivity-score"),
  productivityLabel: document.getElementById("productivity-label"),
  productivityCaption: document.getElementById("productivity-caption"),
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
  focusExitToast: document.getElementById("focus-exit-toast"),
  exportCanvas: document.getElementById("export-canvas"),
};

let state = loadState();
let tickHandle = null;
let liveClockHandle = null;
let analyticsChart = null;
let focusLockTargets = [];
let suppressFullscreenTracking = false;
let focusExitToastHandle = null;
let lastFullscreenWarningAt = 0;
const systemThemeQuery = window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

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

function getStoredThemePreference() {
  const storedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  return storedTheme === "dark" || storedTheme === "light" ? storedTheme : null;
}

function getResolvedTheme(preferredTheme = getStoredThemePreference()) {
  if (preferredTheme) {
    return preferredTheme;
  }

  return systemThemeQuery && systemThemeQuery.matches ? "dark" : "light";
}

function applyTheme(preferredTheme = getStoredThemePreference()) {
  const resolvedTheme = getResolvedTheme(preferredTheme);
  document.documentElement.setAttribute("data-theme", resolvedTheme);
  return resolvedTheme;
}

function getDailyGoal() {
  const storedGoal = Number(localStorage.getItem(STORAGE_KEYS.dailyGoal));
  if (!Number.isFinite(storedGoal) || storedGoal < 1) {
    return DEFAULT_DAILY_GOAL;
  }

  return Math.min(12, Math.round(storedGoal));
}

function saveDailyGoal(goalValue) {
  localStorage.setItem(STORAGE_KEYS.dailyGoal, String(goalValue));
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

function formatClockTime(timestamp = Date.now()) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
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

function getTodaySessions() {
  const todayKey = getLocalDateKey(Date.now());
  return state.sessions.filter((session) => getLocalDateKey(session.timestamp) === todayKey);
}

function getTotalFocusDuration() {
  return state.sessions.reduce((sum, session) => sum + session.durationMs, 0);
}

function getSessionDistractionTotal(session) {
  return (session.distractionCount || 0) + (Array.isArray(session.distractions) ? session.distractions.length : 0);
}

function getTodayDistractionCount() {
  let total = getTodaySessions().reduce((sum, session) => sum + getSessionDistractionTotal(session), 0);

  if (state.timer.pendingSession && getLocalDateKey(state.timer.pendingSession.completedAt) === getLocalDateKey(Date.now())) {
    total += getSessionDistractionTotal(state.timer.pendingSession);
  }

  if (state.timer.mode === "focus") {
    total += state.timer.distractionCount + state.timer.selectedDistractions.length;
  }

  return total;
}

function getAnalyticsSeries(days = 7) {
  const end = startOfLocalDay(Date.now());
  const counts = new Map();

  state.sessions.forEach((session) => {
    const key = getLocalDateKey(session.timestamp);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return Array.from({ length: days }, (_, index) => {
    const dayStart = end - (days - index - 1) * 24 * 60 * 60 * 1000;
    const date = new Date(dayStart);
    const key = getLocalDateKey(dayStart);

    return {
      key,
      label: date.toLocaleDateString([], { weekday: "short" }),
      count: counts.get(key) || 0,
    };
  });
}

function getProductivityScoreData() {
  const sessions = getTodaySessionCount();
  const streak = getEffectiveStreak();
  const distractions = getTodayDistractionCount();
  const rawScore = sessions * 10 + streak * 5 - distractions * 2;
  const score = Math.max(0, Math.min(100, rawScore));
  let label = "😴 Improve";

  if (score >= 80) {
    label = "🔥 Excellent";
  } else if (score >= 50) {
    label = "⚡ Good";
  }

  return {
    score,
    label,
    details: `Today: ${sessions} session${sessions === 1 ? "" : "s"}, ${streak}-day streak, ${distractions} distraction mark${distractions === 1 ? "" : "s"}.`,
  };
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

function updateLiveClock() {
  els.liveClock.textContent = formatClockTime();
}

function startLiveClock() {
  if (liveClockHandle) {
    window.clearInterval(liveClockHandle);
  }

  updateLiveClock();
  liveClockHandle = window.setInterval(updateLiveClock, 1000);
}

function renderThemeToggle() {
  const activeTheme = getResolvedTheme();
  const nextTheme = activeTheme === "dark" ? "light" : "dark";
  els.themeToggle.textContent = `${nextTheme === "dark" ? "Dark" : "Light"} mode`;
}

function renderFullscreenToggle() {
  els.fullscreenToggle.textContent = getFullscreenElement() ? "Exit Fullscreen" : "Enter Fullscreen";
}

function getFullscreenElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null
  );
}

function getRequestFullscreenTarget() {
  return document.documentElement;
}

function getRequestFullscreenMethod() {
  const target = getRequestFullscreenTarget();
  return (
    target.requestFullscreen ||
    target.webkitRequestFullscreen ||
    target.msRequestFullscreen ||
    null
  );
}

function getExitFullscreenMethod() {
  return (
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.msExitFullscreen ||
    null
  );
}

function isFocusSessionActive() {
  return state.timer.running && state.timer.mode === "focus";
}

function isFocusModeImmersive() {
  return isFocusSessionActive() && Boolean(getFullscreenElement());
}

function setFocusModeClasses(isActive) {
  document.body.classList.toggle("focus-immersive", isActive);
  document.body.classList.toggle("focus-active", isActive);
  document.body.classList.toggle("blur-background", isActive);
}

function showFocusExitToast() {
  if (focusExitToastHandle) {
    window.clearTimeout(focusExitToastHandle);
  }

  els.focusExitToast.hidden = false;
  focusExitToastHandle = window.setTimeout(() => {
    els.focusExitToast.hidden = true;
    focusExitToastHandle = null;
  }, 3600);
}

function handleFullscreenExitWarning() {
  if (!isFocusSessionActive()) {
    return;
  }

  const now = Date.now();
  if (now - lastFullscreenWarningAt < 1200) {
    return;
  }

  lastFullscreenWarningAt = now;
  showFocusExitToast();
  updateDistractionCount("fullscreen exit", "⚠️ You exited Focus Mode. Stay consistent!");
}

function updateDistractionCount(reason, warningMessage) {
  if (!isFocusSessionActive()) {
    return;
  }

  state.timer.distractionCount += 1;
  saveState();
  updateStatusLine(warningMessage || `Focus interruption detected: ${reason}.`);
  render();
}

async function enableFocusMode() {
  if (!isFocusSessionActive() || getFullscreenElement()) {
    return;
  }

  const root = getRequestFullscreenTarget();
  const requestFullscreen = getRequestFullscreenMethod();

  if (typeof requestFullscreen !== "function") {
    updateStatusLine("Focus Mode is running, but fullscreen is not supported in this browser.");
    return;
  }

  try {
    await requestFullscreen.call(root);
  } catch (error) {
    console.warn("Unable to enter fullscreen mode.", error);
    updateStatusLine("Focus Mode started without fullscreen permission.");
  }
}

async function disableFocusMode(options = {}) {
  const { suppressWarning = true } = options;
  const exitFullscreen = getExitFullscreenMethod();

  if (!getFullscreenElement() || typeof exitFullscreen !== "function") {
    setFocusModeClasses(false);
    return;
  }

  suppressFullscreenTracking = suppressWarning;

  try {
    await exitFullscreen.call(document);
  } catch (error) {
    console.warn("Unable to exit fullscreen mode cleanly.", error);
  } finally {
    window.setTimeout(() => {
      suppressFullscreenTracking = false;
    }, 200);
  }
}

async function toggleFullscreen() {
  const fullscreenElement = getFullscreenElement();

  if (fullscreenElement) {
    handleFullscreenExitWarning();
    await disableFocusMode({ suppressWarning: true });
    render();
    return;
  }

  const requestFullscreen = getRequestFullscreenMethod();
  if (typeof requestFullscreen !== "function") {
    updateStatusLine("Fullscreen is not supported in this browser.");
    return;
  }

  try {
    await requestFullscreen.call(getRequestFullscreenTarget());
  } catch (error) {
    console.warn("Unable to toggle fullscreen mode.", error);
    updateStatusLine("Fullscreen could not be enabled.");
  }

  render();
}

function handleFullscreenChange() {
  const fullscreenActive = Boolean(getFullscreenElement());
  setFocusModeClasses(isFocusSessionActive() && fullscreenActive);

  if (suppressFullscreenTracking) {
    render();
    return;
  }

  if (!fullscreenActive) {
    setFocusModeClasses(false);
  }

  if (isFocusSessionActive() && !fullscreenActive) {
    handleFullscreenExitWarning();
  } else {
    render();
  }
}

function handleVisibilityChange() {
  if (document.hidden && isFocusSessionActive()) {
    updateDistractionCount("tab switch", "You left the study tab during Focus Mode. Come back and lock in.");
  }
}

function confirmFocusModeExit(actionLabel) {
  if (!isFocusSessionActive()) {
    return true;
  }

  return window.confirm(`Are you sure you want to ${actionLabel} and leave focus mode?`);
}

function updateFocusLockState() {
  const isLocked = state.timer.running;
  document.body.classList.toggle("focus-locked", isLocked);
  setFocusModeClasses(isFocusModeImmersive());

  focusLockTargets.forEach((element) => {
    if (!element || element === els.startBtn || element === els.pauseBtn || element === els.resetBtn) {
      return;
    }

    element.disabled = isLocked;
  });
}

function startTimer() {
  if (state.timer.running || state.timer.pendingSession) {
    return;
  }

  if (state.timer.mode === "focus" && !state.timer.sessionStartTime) {
    state.timer.sessionStartTime = Date.now();
  }

  state.timer.running = true;
  state.timer.targetEndTime = Date.now() + state.timer.remainingMs;
  saveState();
  render();
  enableFocusMode();
}

function pauseTimer() {
  if (!state.timer.running) {
    return;
  }

  if (!confirmFocusModeExit("pause this session")) {
    return;
  }

  state.timer.remainingMs = getRemainingMs();
  state.timer.running = false;
  state.timer.targetEndTime = null;
  disableFocusMode();
  saveState();
  render();
}

function resetTimer() {
  if (!confirmFocusModeExit("reset this session")) {
    return;
  }

  state.timer.running = false;
  state.timer.targetEndTime = null;
  state.timer.remainingMs = getPhaseDuration(state.timer.mode);
  if (state.timer.mode === "focus") {
    state.timer.sessionStartTime = null;
  }
  state.timer.distractionCount = 0;
  disableFocusMode();
  saveState();
  render();
}

function switchMode(nextMode) {
  state.timer.mode = nextMode;
  state.timer.running = false;
  state.timer.targetEndTime = null;
  state.timer.remainingMs = getPhaseDuration(nextMode);
  state.timer.sessionStartTime = null;
  state.timer.distractionCount = 0;
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
    startTime: state.timer.sessionStartTime || completedAt - DURATIONS.focus,
    endTime: completedAt,
    distractions: [...state.timer.selectedDistractions],
    distractionCount: state.timer.distractionCount,
  };
}

function completePhase(completedAt) {
  if (state.timer.mode === "focus") {
    createPendingSession(completedAt);
    switchMode("break");
    disableFocusMode();
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
  const interruptionLine = entry.distractionCount
    ? `Focus Mode recorded ${entry.distractionCount} interruption${entry.distractionCount === 1 ? "" : "s"} during this session.`
    : "Focus Mode stayed uninterrupted throughout the session.";

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

  if (entry.distractionCount > 0) {
    suggestions.push("Try keeping the tab visible and staying in fullscreen for the full block next time.");
  }

  suggestions.push(
    effectiveStreak > 1
      ? `Protect your ${effectiveStreak}-day streak with one more session before the day ends.`
      : "Stack one more session today to turn progress into a streak."
  );

  return {
    headline: `${entry.task} is logged and your focus data is updated.`,
    body: `${formatDuration(entry.durationMs)} of focused work was completed on ${entry.task}. ${distractionLine} ${interruptionLine}`,
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

  saveSessionWithTime({
    id: pending.id,
    task,
    durationMs: pending.durationMs,
    timestamp: pending.completedAt,
    startTime: pending.startTime,
    endTime: pending.endTime,
    distractions: [...pending.distractions],
    distractionCount: pending.distractionCount || 0,
  });
}

function saveSessionWithTime(entry) {
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

function renderFocusModeUi() {
  const focusActive = isFocusSessionActive();
  const focusInterruptedCount = state.timer.distractionCount;
  els.focusDistractionCount.textContent = String(focusInterruptedCount);

  if (isFocusModeImmersive()) {
    els.focusModeIndicator.textContent = "🧠 Focus Mode Active";
  } else if (focusActive) {
    els.focusModeIndicator.textContent = "🧠 Focus Mode Running";
  } else if (state.timer.pendingSession) {
    els.focusModeIndicator.textContent = "🧠 Focus session complete";
  } else {
    els.focusModeIndicator.textContent = "🧠 Focus Mode ready";
  }
}

function renderGoalTracking() {
  const dailyGoal = getDailyGoal();
  const completedToday = getTodaySessionCount();
  const progress = Math.min(100, Math.round((completedToday / dailyGoal) * 100));

  els.goalInput.value = String(dailyGoal);
  els.goalTitle.textContent = `Target ${dailyGoal} session${dailyGoal === 1 ? "" : "s"}`;
  els.goalProgressChip.textContent = `${progress}%`;
  els.goalProgressFill.style.width = `${progress}%`;
  els.goalProgressText.textContent = `${completedToday} / ${dailyGoal} sessions completed today`;
}

function renderProductivityScore() {
  const { score, label, details } = getProductivityScoreData();
  els.productivityScore.textContent = `${score} / 100`;
  els.productivityLabel.textContent = label;
  els.productivityCaption.textContent = details;
}

function renderAnalytics() {
  const totalDuration = getTotalFocusDuration();
  const series = getAnalyticsSeries();
  const labels = series.map((item) => item.label);
  const data = series.map((item) => item.count);
  const theme = getResolvedTheme();
  const textColor = theme === "dark" ? "#a6b9bf" : "#5f7279";
  const gridColor = theme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(17, 33, 41, 0.08)";
  const cardAccent = theme === "dark" ? "#7af0c4" : "#138e67";
  const warmAccent = theme === "dark" ? "rgba(255, 184, 92, 0.45)" : "rgba(200, 122, 19, 0.45)";

  els.analyticsTotalSessions.textContent = String(state.sessions.length);
  els.analyticsTotalTime.textContent = formatDuration(totalDuration);

  if (typeof Chart === "undefined" || !els.sessionsChart) {
    return;
  }

  const chartConfig = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Sessions per day",
          data,
          backgroundColor: data.map((value) => (value ? cardAccent : warmAccent)),
          borderRadius: 12,
          borderSkipped: false,
          maxBarThickness: 44,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          displayColors: false,
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: textColor,
            font: {
              family: "IBM Plex Mono",
            },
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: textColor,
            font: {
              family: "IBM Plex Mono",
            },
          },
          grid: {
            color: gridColor,
          },
        },
      },
    },
  };

  if (!analyticsChart) {
    analyticsChart = new Chart(els.sessionsChart, chartConfig);
    return;
  }

  analyticsChart.data = chartConfig.data;
  analyticsChart.options = chartConfig.options;
  analyticsChart.update();
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
  const totalDuration = getTotalFocusDuration();
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
  renderSessionHistory();
}

function renderSessionHistory() {
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
      const focusModeText = `Focus interruptions: ${session.distractionCount || 0}`;

      return `
        <article class="history-item">
          <div class="history-item__top">
            <h3>${escapeHtml(session.task)}</h3>
            <strong>${formatDuration(session.durationMs)}</strong>
          </div>
          <div class="history-item__times">
            <span>Start: ${escapeHtml(formatTime(session.startTime || session.timestamp))}</span>
            <span>End: ${escapeHtml(formatTime(session.endTime || session.timestamp))}</span>
          </div>
          <div class="history-item__meta">
            <span>${escapeHtml(formatDateTime(session.timestamp))}</span>
            <span>${escapeHtml(getLocalDateKey(session.timestamp))}</span>
          </div>
          <p>${escapeHtml(distractionText)} • ${escapeHtml(focusModeText)}</p>
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
  renderThemeToggle();
  renderFullscreenToggle();
  updateFocusLockState();
  renderStatusLine();
  renderFocusModeUi();
  renderTimerOnly();
  renderStats();
  renderGoalTracking();
  renderProductivityScore();
  renderAnalytics();
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

function handleThemeToggle() {
  const nextTheme = getResolvedTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEYS.theme, nextTheme);
  applyTheme(nextTheme);
  render();
}

function handleGoalSubmit(event) {
  event.preventDefault();

  const nextGoal = Number(els.goalInput.value);
  if (!Number.isFinite(nextGoal) || nextGoal < 1) {
    els.goalInput.value = String(getDailyGoal());
    return;
  }

  saveDailyGoal(Math.min(12, Math.round(nextGoal)));
  renderGoalTracking();
  render();
}

function handleSystemThemeChange() {
  if (getStoredThemePreference()) {
    return;
  }

  applyTheme();
  render();
}

function attachEvents() {
  els.startBtn.addEventListener("click", startTimer);
  els.pauseBtn.addEventListener("click", pauseTimer);
  els.resetBtn.addEventListener("click", resetTimer);
  els.exportBtn.addEventListener("click", exportPng);
  els.themeToggle.addEventListener("click", handleThemeToggle);
  els.fullscreenToggle.addEventListener("click", toggleFullscreen);
  els.goalForm.addEventListener("submit", handleGoalSubmit);
  els.distractionOptions.addEventListener("change", handleDistractionChange);

  els.sessionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSession(els.taskInput.value);
  });

  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  document.addEventListener("MSFullscreenChange", handleFullscreenChange);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  if (systemThemeQuery && typeof systemThemeQuery.addEventListener === "function") {
    systemThemeQuery.addEventListener("change", handleSystemThemeChange);
  } else if (systemThemeQuery && typeof systemThemeQuery.addListener === "function") {
    systemThemeQuery.addListener(handleSystemThemeChange);
  }
}

function init() {
  applyTheme();
  focusLockTargets = [...document.querySelectorAll(".focus-lock-target")];
  startLiveClock();
  syncTimerAfterReload();
  attachEvents();
  ensureTicker();
  render();
}

init();
