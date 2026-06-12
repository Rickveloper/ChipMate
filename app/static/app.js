const FALLBACK_CATEGORIES = [
  { name: "Speeds & Feeds", slug: "speeds-feeds" },
  { name: "Tooling", slug: "tooling" },
  { name: "Materials", slug: "materials" },
  { name: "GD&T", slug: "gdt" },
  { name: "Inspection", slug: "inspection" },
  { name: "Blueprint Reading", slug: "blueprint-reading" },
  { name: "Manual Machining", slug: "manual-machining" },
  { name: "CNC", slug: "cnc" },
  { name: "Formulas", slug: "formulas" },
  { name: "Calculator", slug: "calculator" },
  { name: "Tap Drill Charts", slug: "tap-drill-charts" },
  { name: "Reamers", slug: "reamers" },
  { name: "Threading", slug: "threading" },
];

const STORAGE_KEYS = {
  recent: "chipmate.recentSearches.v0.3",
  favorites: "chipmate.favorites.v0.3",
};
const MAX_RECENT = 8;
const MAX_FAVORITES = 12;

const PROMPT_SUGGESTIONS = [
  {
    label: "1/4-20 tap drill",
    prompt: "What tap drill should I use for 1/4-20 in mild steel?",
  },
  {
    label: "RPM from SFM",
    prompt: "Calculate RPM for a 0.5 in carbide end mill at 400 SFM.",
  },
  {
    label: "4-jaw chuck",
    prompt: "How do I indicate a part in a 4-jaw chuck?",
  },
  {
    label: "True position",
    prompt: "Explain true position with MMC for a hole pattern.",
  },
  {
    label: "G54 offsets",
    prompt: "How should I check G54 work offsets before running a CNC program?",
  },
  {
    label: "Bore gage",
    prompt: "How do I set and use a dial bore gage?",
  },
  {
    label: "Reaming",
    prompt: "What should I check before reaming an aluminum hole to size?",
  },
];

const DEFAULT_REFINEMENTS = [
  { label: "Shop checklist", context: "Turn this answer into a practical shop checklist." },
  { label: "Inspection checks", context: "Add first-piece and inspection checks for this question." },
  { label: "Troubleshoot", context: "Add troubleshooting guidance for common problems." },
];

const CATEGORY_REFINEMENTS = {
  "speeds-feeds": [
    { label: "Math check", context: "Show the RPM, feed, and unit assumptions for this question." },
    { label: "Troubleshoot", context: "Add troubleshooting guidance for chatter, heat, finish, and tool wear." },
    { label: "Setup limits", context: "Add setup and workholding checks that affect speeds and feeds." },
  ],
  "tap-drill-charts": [
    { label: "Thread fit", context: "Focus on thread percentage, class of fit, and tap drill choice." },
    { label: "Tapping tips", context: "Add tapping setup, fluid, and chip control guidance." },
    { label: "Formula", context: "Show the tap drill formula and unit assumptions." },
  ],
  reamers: [
    { label: "Pre-hole", context: "Focus on pre-hole size, alignment, stock allowance, and finish." },
    { label: "Troubleshoot", context: "Add troubleshooting guidance for bellmouth, oversize, chatter, and poor finish." },
    { label: "Inspection checks", context: "Add inspection checks for size, roundness, taper, and finish." },
  ],
  gdt: [
    { label: "Plain English", context: "Explain this GD&T answer in plain English." },
    { label: "Datum frame", context: "Focus on the datum reference frame and setup implications." },
    { label: "Inspection checks", context: "Add inspection checks for this GD&T question." },
  ],
  inspection: [
    { label: "Gage setup", context: "Focus on gage setup, zeroing, repeatability, and uncertainty." },
    { label: "First piece", context: "Add first-piece inspection checks for this question." },
    { label: "Troubleshoot", context: "Add troubleshooting guidance for questionable measurements." },
  ],
  "manual-machining": [
    { label: "Setup steps", context: "Turn this into a manual machine setup checklist." },
    { label: "Indicator checks", context: "Focus on indicating, runout, backlash, and measurement checks." },
    { label: "Mistakes", context: "Add common mistakes and troubleshooting guidance." },
  ],
  cnc: [
    { label: "Dry run", context: "Focus on dry-run, single-block, clearance, and offset checks." },
    { label: "Offsets", context: "Focus on work offsets, tool length offsets, and cutter compensation." },
    { label: "Inspection checks", context: "Add first-piece inspection checks for this CNC question." },
  ],
  formulas: [
    { label: "Math check", context: "Show the formula, units, and arithmetic assumptions." },
    { label: "Shop range", context: "Add a practical shop sanity check for the calculated result." },
    { label: "Inspection checks", context: "Add checks to verify the calculated result in the shop." },
  ],
  calculator: [
    { label: "Math check", context: "Show the formula, units, and arithmetic assumptions." },
    { label: "Shop range", context: "Add a practical shop sanity check for the calculated result." },
    { label: "Inspection checks", context: "Add checks to verify the calculated result in the shop." },
  ],
  threading: [
    { label: "Thread fit", context: "Focus on thread form, class of fit, pitch, and gaging." },
    { label: "Formula", context: "Show the thread or tap drill formula and unit assumptions." },
    { label: "Troubleshoot", context: "Add threading troubleshooting guidance for torn threads and poor fit." },
  ],
};

const form = document.querySelector("#assistantForm");
const input = document.querySelector("#messageInput");
const askButton = document.querySelector("#askButton");
const newButton = document.querySelector("#newButton");
const categoryRail = document.querySelector("#categoryRail");
const answerEl = document.querySelector("#answer");
const statusEl = document.querySelector("#connectionStatus");
const typingSuggestions = document.querySelector("#typingSuggestions");
const calculatorPanel = document.querySelector("#calculatorPanel");
const recentPanel = document.querySelector("#recentPanel");
const recentList = document.querySelector("#recentList");
const favoritesPanel = document.querySelector("#favoritesPanel");
const favoritesList = document.querySelector("#favoritesList");
const clearRecentButton = document.querySelector("#clearRecentButton");
const clearFavoritesButton = document.querySelector("#clearFavoritesButton");
const offlineStorageStatus = document.querySelector("#offlineStorageStatus");
const appShellCacheState = document.querySelector("#appShellCacheState");
const quickReferenceCacheState = document.querySelector("#quickReferenceCacheState");
const handbookCacheState = document.querySelector("#handbookCacheState");
const cacheAppShellButton = document.querySelector("#cacheAppShellButton");
const cacheQuickReferenceButton = document.querySelector("#cacheQuickReferenceButton");
const cacheHandbookButton = document.querySelector("#cacheHandbookButton");
const clearOfflineCacheButton = document.querySelector("#clearOfflineCacheButton");

let activeCategorySlug = "";
let currentCategories = FALLBACK_CATEGORIES;
let lastAnswerData = null;
let lastQuestion = "";
let offlineStorageSupported = false;
let offlineServiceWorker = null;
let offlineServiceWorkerRegistration = null;
let offlineCacheRepairAttempted = false;

const OFFLINE_CACHE_PREFIX = "chipmate-";
const OFFLINE_CONTROLLER_RELOAD_KEY = "chipmate.serviceWorkerControllerReloaded.v0.7";

const OFFLINE_CACHE_CONTROLS = [
  {
    group: "appShell",
    button: cacheAppShellButton,
    state: appShellCacheState,
  },
  {
    group: "quickReference",
    button: cacheQuickReferenceButton,
    state: quickReferenceCacheState,
  },
  {
    group: "handbook",
    button: cacheHandbookButton,
    state: handbookCacheState,
  },
];

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function itemId(query) {
  return normalizeText(query).toLowerCase();
}

function readStoredList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.query).slice(0, 50) : [];
  } catch {
    return [];
  }
}

function writeStoredList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage can fail in private browsing or restricted webviews. The app still works without it.
  }
}

function getRecentSearches() {
  return readStoredList(STORAGE_KEYS.recent).slice(0, MAX_RECENT);
}

function getFavorites() {
  return readStoredList(STORAGE_KEYS.favorites).slice(0, MAX_FAVORITES);
}

function isFavorite(query) {
  const id = itemId(query);
  return Boolean(id && getFavorites().some((item) => item.id === id));
}

function saveRecentSearch(query, data) {
  const cleanQuery = normalizeText(query);
  if (!cleanQuery) return;
  const id = itemId(cleanQuery);
  const item = {
    id,
    query: cleanQuery,
    category: data?.category?.name || "",
    title: data?.answer?.title || "",
    createdAt: new Date().toISOString(),
  };
  const list = [item, ...getRecentSearches().filter((entry) => entry.id !== id)].slice(0, MAX_RECENT);
  writeStoredList(STORAGE_KEYS.recent, list);
  renderSearchMemory();
}

function toggleFavorite(data) {
  const cleanQuery = normalizeText(data?.query || lastQuestion);
  if (!cleanQuery) return false;
  const id = itemId(cleanQuery);
  const existing = getFavorites();
  const alreadySaved = existing.some((item) => item.id === id);
  const next = alreadySaved
    ? existing.filter((item) => item.id !== id)
    : [
        {
          id,
          query: cleanQuery,
          category: data?.category?.name || "",
          title: data?.answer?.title || "",
          preview: data?.answer?.direct_answer || "",
          createdAt: new Date().toISOString(),
        },
        ...existing,
      ].slice(0, MAX_FAVORITES);
  writeStoredList(STORAGE_KEYS.favorites, next);
  renderSearchMemory();
  renderTypingSuggestions();
  return !alreadySaved;
}

function renderSearchMemory() {
  const recent = getRecentSearches();
  const favorites = getFavorites();

  recentPanel.hidden = recent.length === 0;
  clearNode(recentList);
  recent.forEach((item) => {
    recentList.appendChild(createMemoryItem(item, "Recent"));
  });

  favoritesPanel.hidden = favorites.length === 0;
  clearNode(favoritesList);
  favorites.forEach((item) => {
    favoritesList.appendChild(createMemoryItem(item, "Favorite"));
  });
}

function createMemoryItem(item, fallbackMeta) {
  const button = createElement("button", "memory-item");
  button.type = "button";
  button.appendChild(createElement("span", "memory-title", item.query));
  button.appendChild(createElement("span", "memory-meta", item.category || item.title || fallbackMeta));
  button.addEventListener("click", () => {
    input.value = item.query;
    ask(item.query);
  });
  return button;
}

function setConnectionStatus(label, status) {
  statusEl.textContent = label;
  statusEl.classList.toggle("online", status === "online");
  statusEl.classList.toggle("offline", status === "offline");
}

function updateConnectionStatus() {
  if (!navigator.onLine) {
    setConnectionStatus("Offline", "offline");
    return;
  }
  setConnectionStatus("Online", "online");
}

function setOfflineStorageStatus(label, tone = "") {
  offlineStorageStatus.textContent = label;
  offlineStorageStatus.classList.toggle("ready", tone === "ready");
  offlineStorageStatus.classList.toggle("error", tone === "error");
}

function setOfflineControlsEnabled(enabled) {
  const active = offlineStorageSupported && enabled;
  OFFLINE_CACHE_CONTROLS.forEach(({ button }) => {
    button.disabled = !active;
  });
  clearOfflineCacheButton.disabled = !active;
}

function setCacheState(element, cached) {
  element.textContent = cached ? "Cached" : "Not cached";
  element.classList.toggle("cached", cached);
}

function renderOfflineCacheStatus(groups = {}) {
  OFFLINE_CACHE_CONTROLS.forEach(({ group, button, state }) => {
    const cached = Boolean(groups[group]);
    setCacheState(state, cached);
    button.setAttribute("aria-pressed", cached ? "true" : "false");
  });
}

function getSessionFlag(key) {
  try {
    return sessionStorage.getItem(key) === "true";
  } catch {
    logOfflineCacheFailure("Could not read service worker reload flag from sessionStorage.");
    return false;
  }
}

function setSessionFlag(key) {
  try {
    sessionStorage.setItem(key, "true");
    return true;
  } catch {
    logOfflineCacheFailure("Could not write service worker reload flag to sessionStorage.");
    return false;
  }
}

function clearSessionFlag(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    logOfflineCacheFailure("Could not clear service worker reload flag from sessionStorage.");
  }
}

function logOfflineCacheFailure(message, error, context = {}) {
  const details = {
    hasController: Boolean(navigator.serviceWorker?.controller),
    controllerState: navigator.serviceWorker?.controller?.state || "none",
    serviceWorkerState: offlineServiceWorker?.state || "none",
    ...context,
  };

  if (error) {
    console.warn(`[ChipMate offline] ${message}`, details, error);
    return;
  }

  console.warn(`[ChipMate offline] ${message}`, details);
}

function withTimeout(promise, message, timeoutMs = 10000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

async function getActiveServiceWorker() {
  const registration = offlineServiceWorkerRegistration || (await navigator.serviceWorker.ready);
  const worker =
    registration.active ||
    navigator.serviceWorker.controller ||
    registration.waiting ||
    registration.installing ||
    offlineServiceWorker;
  offlineServiceWorker = worker;
  return worker;
}

function waitForServiceWorkerActivation(registration) {
  const worker = registration.installing || registration.waiting || registration.active;
  if (!worker) {
    return navigator.serviceWorker.ready.then((readyRegistration) => readyRegistration.active);
  }
  if (worker.state === "activated") return Promise.resolve(worker);

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Service worker activation timed out."));
    }, 8000);

    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") {
        window.clearTimeout(timeout);
        resolve(worker);
      }
    });
  });
}

async function sendServiceWorkerMessage(message) {
  if (!("serviceWorker" in navigator) || !("MessageChannel" in window)) {
    throw new Error("Offline cache controls are not available in this browser.");
  }

  const worker = await getActiveServiceWorker();
  if (!worker) throw new Error("Service worker is not ready.");

  console.debug("[ChipMate offline] Sending service worker message.", {
    type: message.type,
    workerState: worker.state,
    hasController: Boolean(navigator.serviceWorker.controller),
  });

  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      const error = new Error("Service worker did not respond.");
      channel.port1.close();
      logOfflineCacheFailure(`Service worker message timed out: ${message.type}`, error);
      reject(error);
    }, 8000);

    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      const data = event.data || {};
      if (data.ok) {
        resolve(data);
      } else {
        const error = new Error(data.error || "Offline cache action failed.");
        logOfflineCacheFailure(`Service worker message failed: ${message.type}`, error);
        reject(error);
      }
    };

    channel.port1.onmessageerror = (event) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      const error = new Error("Service worker sent an unreadable response.");
      logOfflineCacheFailure(`Service worker message response could not be read: ${message.type}`, error, {
        event,
      });
      reject(error);
    };

    try {
      worker.postMessage(message, [channel.port2]);
    } catch (error) {
      window.clearTimeout(timeout);
      channel.port1.close();
      logOfflineCacheFailure(`Could not post service worker message: ${message.type}`, error);
      reject(error);
    }
  });
}

function offlineStatusErrorLabel(error) {
  if (error?.message === "Load failed") return "Offline cache temporarily unavailable";
  return error?.message || "Offline cache status unavailable.";
}

async function clearChipMateCaches() {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  const chipMateKeys = keys.filter((key) => key.startsWith(OFFLINE_CACHE_PREFIX));
  console.info("[ChipMate offline] Clearing ChipMate caches.", { caches: chipMateKeys });
  await Promise.all(chipMateKeys.map((key) => caches.delete(key)));
}

async function unregisterOriginServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  if ("getRegistrations" in navigator.serviceWorker) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    console.info("[ChipMate offline] Unregistering service workers for recovery.", {
      count: registrations.length,
      scopes: registrations.map((registration) => registration.scope),
    });
    await Promise.all(registrations.map((registration) => registration.unregister()));
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) {
    console.info("[ChipMate offline] Unregistering service worker for recovery.", { scope: registration.scope });
    await registration.unregister();
  }
}

async function prepareServiceWorkerRegistration(registration) {
  offlineServiceWorkerRegistration = registration;

  try {
    await registration.update();
  } catch (error) {
    logOfflineCacheFailure("Service worker update check failed.", error);
  }

  const activatedWorker = await waitForServiceWorkerActivation(registration);
  const readyRegistration = await withTimeout(
    navigator.serviceWorker.ready,
    "Service worker ready timed out.",
    12000,
  );
  offlineServiceWorkerRegistration = registration.active ? registration : readyRegistration || registration;
  offlineServiceWorker =
    offlineServiceWorkerRegistration.active || activatedWorker || readyRegistration?.active || null;
  return offlineServiceWorkerRegistration;
}

function reloadOnceForServiceWorkerControl() {
  if (navigator.serviceWorker.controller) {
    clearSessionFlag(OFFLINE_CONTROLLER_RELOAD_KEY);
    return false;
  }

  if (getSessionFlag(OFFLINE_CONTROLLER_RELOAD_KEY)) {
    console.warn("[ChipMate offline] Service worker activated, but this page is still not controlled after one reload.");
    return false;
  }

  if (!setSessionFlag(OFFLINE_CONTROLLER_RELOAD_KEY)) {
    console.warn(
      "[ChipMate offline] Service worker activated without controlling this page. Skipping reload because sessionStorage is unavailable.",
    );
    return false;
  }

  console.info("[ChipMate offline] Service worker activated without controlling this page. Reloading once.");
  setOfflineStorageStatus("Offline cache ready, reloading", "ready");
  window.location.reload();
  return true;
}

async function repairOfflineCacheStatus(originalError, quiet = false) {
  if (offlineCacheRepairAttempted) {
    setOfflineControlsEnabled(false);
    setOfflineStorageStatus(offlineStatusErrorLabel(originalError), "error");
    return false;
  }

  offlineCacheRepairAttempted = true;
  logOfflineCacheFailure("Offline cache status check failed. Attempting repair.", originalError);
  if (!quiet) setOfflineStorageStatus("Repairing offline cache");
  setOfflineControlsEnabled(false);

  try {
    await unregisterOriginServiceWorkers();
    await clearChipMateCaches();
    offlineServiceWorker = null;
    offlineServiceWorkerRegistration = null;

    const registration = await navigator.serviceWorker.register("/service-worker.js");
    await prepareServiceWorkerRegistration(registration);
    offlineStorageSupported = true;

    if (reloadOnceForServiceWorkerControl()) return true;

    const data = await sendServiceWorkerMessage({ type: "GET_CACHE_STATUS" });
    renderOfflineCacheStatus(data.groups);
    setOfflineControlsEnabled(true);
    setOfflineStorageStatus("Offline cache repaired, reload if needed", "ready");
    return true;
  } catch (error) {
    logOfflineCacheFailure("Offline cache repair failed.", error);
    offlineStorageSupported = false;
    renderOfflineCacheStatus({});
    setOfflineControlsEnabled(false);
    setOfflineStorageStatus("Offline cache repair failed", "error");
    return false;
  }
}

async function refreshOfflineCacheStatus(quiet = false, allowRepair = true) {
  if (!offlineStorageSupported) {
    renderOfflineCacheStatus({});
    setOfflineControlsEnabled(false);
    return;
  }

  if (!quiet) setOfflineStorageStatus("Checking cache status");
  try {
    const data = await sendServiceWorkerMessage({ type: "GET_CACHE_STATUS" });
    renderOfflineCacheStatus(data.groups);
    setOfflineControlsEnabled(true);
    if (!quiet) setOfflineStorageStatus("Offline cache ready", "ready");
  } catch (error) {
    logOfflineCacheFailure("Offline cache status check failed.", error);
    setOfflineControlsEnabled(false);
    if (allowRepair) {
      await repairOfflineCacheStatus(error, quiet);
      return;
    }
    setOfflineStorageStatus(offlineStatusErrorLabel(error), "error");
  }
}

async function runOfflineCacheAction(button, pendingLabel, action) {
  const originalLabel = button.textContent;
  setOfflineControlsEnabled(false);
  button.textContent = pendingLabel;
  setOfflineStorageStatus(pendingLabel);

  try {
    const data = await action();
    renderOfflineCacheStatus(data.groups);
    setOfflineStorageStatus("Offline cache updated", "ready");
  } catch (error) {
    logOfflineCacheFailure("Offline cache action failed.", error);
    setOfflineStorageStatus(offlineStatusErrorLabel(error), "error");
  } finally {
    button.textContent = originalLabel;
    setOfflineControlsEnabled(true);
  }
}

function cacheOfflineGroup(group, button) {
  runOfflineCacheAction(button, "Caching", () => sendServiceWorkerMessage({ type: "CACHE_GROUP", group }));
}

function clearOfflineCache() {
  runOfflineCacheAction(clearOfflineCacheButton, "Clearing", () =>
    sendServiceWorkerMessage({ type: "CLEAR_OFFLINE_CACHE" }),
  );
}

async function checkHealth() {
  updateConnectionStatus();
  if (!navigator.onLine) return;
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) throw new Error("Health check failed");
    setConnectionStatus("Ready", "online");
  } catch {
    setConnectionStatus("Offline", "offline");
  }
}

function calculatorNumber(id) {
  const element = document.getElementById(id);
  const rawValue = element?.value.trim() || "";
  if (!rawValue) return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function positiveCalculatorNumber(id) {
  const value = calculatorNumber(id);
  return value !== null && value > 0 ? value : null;
}

function formatCalculatorNumber(value, maximumFractionDigits, minimumFractionDigits = 0) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits,
  });
}

function setCalculatorResult(id, value, unit, maximumFractionDigits, minimumFractionDigits = 0) {
  const output = document.getElementById(id);
  if (!output) return;

  if (!Number.isFinite(value)) {
    output.textContent = "--";
    output.classList.remove("ready");
    return;
  }

  output.textContent =
    `${formatCalculatorNumber(value, maximumFractionDigits, minimumFractionDigits)} ${unit}`.trim();
  output.classList.add("ready");
}

function calculateMachinistValues() {
  const rpmSfm = positiveCalculatorNumber("rpmSfmInput");
  const rpmDiameter = positiveCalculatorNumber("rpmDiameterInput");
  setCalculatorResult(
    "rpmResult",
    rpmSfm !== null && rpmDiameter !== null ? (rpmSfm * 3.82) / rpmDiameter : Number.NaN,
    "RPM",
    0,
  );

  const sfmRpm = positiveCalculatorNumber("sfmRpmInput");
  const sfmDiameter = positiveCalculatorNumber("sfmDiameterInput");
  setCalculatorResult(
    "sfmResult",
    sfmRpm !== null && sfmDiameter !== null ? (sfmRpm * sfmDiameter) / 3.82 : Number.NaN,
    "SFM",
    2,
  );

  const feedRpm = positiveCalculatorNumber("feedRpmInput");
  const feedChipLoad = positiveCalculatorNumber("feedChipLoadInput");
  const feedFlutes = positiveCalculatorNumber("feedFlutesInput");
  setCalculatorResult(
    "feedResult",
    feedRpm !== null && feedChipLoad !== null && feedFlutes !== null
      ? feedRpm * feedChipLoad * feedFlutes
      : Number.NaN,
    "IPM",
    3,
  );

  const inchTapMajor = positiveCalculatorNumber("inchTapMajorInput");
  const inchTapTpi = positiveCalculatorNumber("inchTapTpiInput");
  const inchTapDrill =
    inchTapMajor !== null && inchTapTpi !== null ? inchTapMajor - 1 / inchTapTpi : Number.NaN;
  setCalculatorResult("inchTapResult", inchTapDrill > 0 ? inchTapDrill : Number.NaN, "in", 4, 4);

  const metricTapMajor = positiveCalculatorNumber("metricTapMajorInput");
  const metricTapPitch = positiveCalculatorNumber("metricTapPitchInput");
  const metricTapDrill =
    metricTapMajor !== null && metricTapPitch !== null ? metricTapMajor - metricTapPitch : Number.NaN;
  setCalculatorResult("metricTapResult", metricTapDrill > 0 ? metricTapDrill : Number.NaN, "mm", 3, 3);

  const inchToMm = calculatorNumber("inchToMmInput");
  setCalculatorResult("inchToMmResult", inchToMm !== null ? inchToMm * 25.4 : Number.NaN, "mm", 4);

  const mmToInch = calculatorNumber("mmToInchInput");
  setCalculatorResult("mmToInchResult", mmToInch !== null ? mmToInch / 25.4 : Number.NaN, "in", 5);

  const truePositionX = calculatorNumber("truePositionXInput");
  const truePositionY = calculatorNumber("truePositionYInput");
  setCalculatorResult(
    "truePositionResult",
    truePositionX !== null && truePositionY !== null
      ? 2 * Math.sqrt(truePositionX ** 2 + truePositionY ** 2)
      : Number.NaN,
    "same units",
    4,
    4,
  );
}

function initCalculator() {
  if (!calculatorPanel) return;
  calculatorPanel.querySelectorAll("input").forEach((field) => {
    field.addEventListener("input", calculateMachinistValues);
  });
  calculateMachinistValues();
}

function hideCalculator() {
  if (calculatorPanel) calculatorPanel.hidden = true;
}

function showCalculator() {
  if (!calculatorPanel) return;
  activeCategorySlug = "calculator";
  lastAnswerData = null;
  lastQuestion = "";
  input.value = "";
  typingSuggestions.hidden = true;
  clearNode(answerEl);
  calculatorPanel.hidden = false;
  calculateMachinistValues();
  renderCategories(currentCategories);
  window.requestAnimationFrame(() => {
    calculatorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderCategories(categories) {
  currentCategories = categories && categories.length ? categories : FALLBACK_CATEGORIES;
  clearNode(categoryRail);
  currentCategories.forEach((category) => {
    const button = createElement("button", "", category.name);
    button.type = "button";
    button.dataset.slug = category.slug;
    button.dataset.category = category.name;
    button.classList.toggle("active", category.slug === activeCategorySlug);
    button.addEventListener("click", () => {
      if (category.slug === "calculator") {
        showCalculator();
        return;
      }
      hideCalculator();
      const prompt = `Give me practical guidance on ${category.name}.`;
      input.value = prompt;
      ask(prompt);
    });
    categoryRail.appendChild(button);
  });
}

async function loadCategories() {
  try {
    const response = await fetch("/api/categories", { cache: "no-store" });
    if (!response.ok) throw new Error("Category request failed");
    const data = await response.json();
    renderCategories(data.categories || FALLBACK_CATEGORIES);
  } catch {
    renderCategories(FALLBACK_CATEGORIES);
  }
}

function renderLoading(query, contextLabel = "") {
  clearNode(answerEl);
  const article = createElement("article", "answer-card loading-card");
  article.appendChild(createElement("p", "answer-kicker", contextLabel ? `Refining - ${contextLabel}` : "Working"));
  article.appendChild(createElement("h2", "", query || "Machining question"));
  answerEl.appendChild(article);
}

function renderError(message) {
  clearNode(answerEl);
  const article = createElement("article", "error-note");
  article.textContent = message;
  answerEl.appendChild(article);
}

function appendTextSection(parent, title, text) {
  const section = createElement("section", "answer-section");
  section.appendChild(createElement("h3", "", title));
  section.appendChild(createElement("p", "", text || "No detail returned."));
  parent.appendChild(section);
}

function appendSteps(parent, steps) {
  const section = createElement("section", "answer-section");
  section.appendChild(createElement("h3", "", "Steps"));
  if (!steps || !steps.length) {
    section.appendChild(createElement("p", "", "No step sequence needed for this answer."));
    parent.appendChild(section);
    return;
  }
  const list = createElement("ol", "step-list");
  steps.forEach((step) => {
    list.appendChild(createElement("li", "", step));
  });
  section.appendChild(list);
  parent.appendChild(section);
}

function appendFormulas(parent, formulas) {
  const section = createElement("section", "answer-section");
  section.appendChild(createElement("h3", "", "Formulas"));
  if (!formulas || !formulas.length) {
    section.appendChild(createElement("p", "", "No formula is needed for this question."));
    parent.appendChild(section);
    return;
  }
  const list = createElement("div", "formula-list");
  formulas.forEach((formula) => {
    const item = createElement("div", "formula-item");
    item.appendChild(createElement("strong", "", formula.label || "Formula"));
    item.appendChild(createElement("code", "", formula.expression || ""));
    list.appendChild(item);
  });
  section.appendChild(list);
  parent.appendChild(section);
}

function appendSources(parent, sources) {
  const section = createElement("section", "answer-section");
  section.appendChild(createElement("h3", "", "Sources"));
  if (!sources || !sources.length) {
    section.appendChild(createElement("p", "", "No source records were returned."));
    parent.appendChild(section);
    return;
  }
  const list = createElement("div", "source-list");
  sources.forEach((source) => {
    const item = createElement("article", "source-item");
    const heading = createElement("strong", "", source.title || source.slug || "Source");
    item.appendChild(heading);
    if (source.publisher) item.appendChild(createElement("span", "", source.publisher));
    if (source.url && source.url.startsWith("http")) {
      const link = createElement("a", "", source.url);
      link.href = source.url;
      link.rel = "noreferrer";
      item.appendChild(link);
    } else if (source.url && source.url.startsWith("local://")) {
      item.appendChild(createElement("span", "", source.url.replace("local://", "")));
    }
    if (source.note) item.appendChild(createElement("p", "", source.note));
    if (source.is_placeholder) item.appendChild(createElement("em", "", "Local seed data"));
    list.appendChild(item);
  });
  section.appendChild(list);
  parent.appendChild(section);
}

function appendRefinements(parent, data) {
  const refinements = buildRefinements(data);
  if (!refinements.length) return;
  const section = createElement("section", "answer-section refinement-section");
  section.appendChild(createElement("h3", "", "Refine"));
  const row = createElement("div", "refinement-row");
  refinements.forEach((refinement) => {
    const button = createElement("button", "", refinement.label);
    button.type = "button";
    button.addEventListener("click", () => {
      const query = normalizeText(data.query || lastQuestion);
      const state = { ...(data.state || {}) };
      if (refinement.material) state.material = refinement.material;
      if (!query) return;
      ask(query, {
        context: refinement.context,
        contextLabel: refinement.label,
        state,
      });
    });
    row.appendChild(button);
  });
  section.appendChild(row);
  parent.appendChild(section);
}

function buildRefinements(data) {
  const categorySlug = data.category?.slug || "";
  const answerActions = Array.isArray(data.answer?.refinement_actions) ? data.answer.refinement_actions : [];
  const categoryRefinements = CATEGORY_REFINEMENTS[categorySlug] || DEFAULT_REFINEMENTS;
  const topicRefinements = (data.answer?.related_topics || []).slice(0, 3).map((topic) => ({
    label: topic,
    context: `Focus on ${topic} for this question.`,
  }));
  const refinements = answerActions.length ? answerActions : [...categoryRefinements, ...topicRefinements];
  const seen = new Set();
  return refinements
    .filter((refinement) => {
      const key = refinement.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function createFavoriteButton(data) {
  const button = createElement("button", "plain-button favorite-button");
  button.type = "button";
  const updateLabel = () => {
    button.textContent = isFavorite(data.query) ? "Saved" : "Favorite";
    button.classList.toggle("saved", isFavorite(data.query));
  };
  button.addEventListener("click", () => {
    toggleFavorite(data);
    updateLabel();
  });
  updateLabel();
  return button;
}

function renderAnswer(data) {
  clearNode(answerEl);
  lastAnswerData = data;
  lastQuestion = data.query || lastQuestion;
  activeCategorySlug = data.category?.slug || "";
  renderCategories(data.categories || currentCategories);

  const answer = data.answer;
  if (!answer) return;

  const article = createElement("article", "answer-card");
  const header = createElement("header", "answer-header");
  const titleRow = createElement("div", "answer-title-row");
  const titleBlock = createElement("div", "answer-title-block");
  titleBlock.appendChild(createElement("p", "answer-kicker", answer.title || data.category?.name || "ChipMate"));
  titleBlock.appendChild(createElement("h2", "", data.query || "Machining question"));
  titleRow.appendChild(titleBlock);
  titleRow.appendChild(createFavoriteButton(data));
  header.appendChild(titleRow);
  article.appendChild(header);

  appendTextSection(article, "Direct Answer", answer.direct_answer);
  appendRefinements(article, data);
  appendSteps(article, answer.steps);
  appendFormulas(article, answer.formulas);
  appendSources(article, answer.sources);

  if (answer.note) {
    const note = createElement("p", "answer-note", answer.note);
    article.appendChild(note);
  }

  answerEl.appendChild(article);
}

function suggestionCandidates(query) {
  const recent = getRecentSearches().map((item) => ({
    label: item.query,
    prompt: item.query,
    source: "Recent",
  }));
  const favorites = getFavorites().map((item) => ({
    label: item.query,
    prompt: item.query,
    source: "Favorite",
  }));
  const candidates = [...favorites, ...recent, ...PROMPT_SUGGESTIONS];
  const seen = new Set();
  const unique = candidates.filter((candidate) => {
    const key = itemId(candidate.prompt);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const cleanQuery = normalizeText(query).toLowerCase();
  if (!cleanQuery) return unique.slice(0, 5);

  const tokens = cleanQuery.split(" ").filter(Boolean);
  return unique
    .filter((candidate) => {
      const haystack = `${candidate.label} ${candidate.prompt} ${candidate.source || ""}`.toLowerCase();
      return haystack.includes(cleanQuery) || tokens.every((token) => haystack.includes(token));
    })
    .slice(0, 6);
}

function renderTypingSuggestions() {
  clearNode(typingSuggestions);
  const query = normalizeText(input.value);
  const inputIsActive = document.activeElement === input || form.contains(document.activeElement);
  const suggestions = suggestionCandidates(query).filter((suggestion) => itemId(suggestion.prompt) !== itemId(query));

  if (!inputIsActive || suggestions.length === 0) {
    typingSuggestions.hidden = true;
    return;
  }

  suggestions.forEach((suggestion) => {
    const button = createElement("button", "suggestion-chip");
    button.type = "button";
    button.appendChild(createElement("span", "suggestion-label", suggestion.label));
    if (suggestion.source) button.appendChild(createElement("span", "suggestion-source", suggestion.source));
    button.addEventListener("click", () => {
      input.value = suggestion.prompt;
      typingSuggestions.hidden = true;
      input.focus();
    });
    typingSuggestions.appendChild(button);
  });
  typingSuggestions.hidden = false;
}

async function ask(message, options = {}) {
  const query = normalizeText(message);
  if (!query) {
    input.focus();
    return;
  }

  askButton.disabled = true;
  typingSuggestions.hidden = true;
  hideCalculator();
  renderLoading(query, options.contextLabel || "");

  try {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: query, context: options.context || "", state: options.state || {} }),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();
    saveRecentSearch(query, data);
    renderAnswer(data);
    input.value = "";
  } catch (error) {
    renderError(navigator.onLine ? error.message : "Offline. Reconnect to ask ChipMate.");
  } finally {
    askButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value);
});

input.addEventListener("input", renderTypingSuggestions);
input.addEventListener("focus", renderTypingSuggestions);

document.addEventListener("click", (event) => {
  if (!form.contains(event.target)) typingSuggestions.hidden = true;
});

newButton.addEventListener("click", () => {
  input.value = "";
  activeCategorySlug = "";
  lastAnswerData = null;
  lastQuestion = "";
  hideCalculator();
  clearNode(answerEl);
  renderCategories(currentCategories);
  renderTypingSuggestions();
  input.focus();
});

clearRecentButton.addEventListener("click", () => {
  writeStoredList(STORAGE_KEYS.recent, []);
  renderSearchMemory();
  renderTypingSuggestions();
});

clearFavoritesButton.addEventListener("click", () => {
  writeStoredList(STORAGE_KEYS.favorites, []);
  renderSearchMemory();
  renderTypingSuggestions();
  if (lastAnswerData) renderAnswer(lastAnswerData);
});

cacheAppShellButton.addEventListener("click", () => {
  cacheOfflineGroup("appShell", cacheAppShellButton);
});

cacheQuickReferenceButton.addEventListener("click", () => {
  cacheOfflineGroup("quickReference", cacheQuickReferenceButton);
});

cacheHandbookButton.addEventListener("click", () => {
  cacheOfflineGroup("handbook", cacheHandbookButton);
});

clearOfflineCacheButton.addEventListener("click", clearOfflineCache);

window.addEventListener("online", checkHealth);
window.addEventListener("offline", updateConnectionStatus);

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !("MessageChannel" in window)) {
    offlineStorageSupported = false;
    renderOfflineCacheStatus({});
    setOfflineStorageStatus("Offline cache controls unavailable", "error");
    setOfflineControlsEnabled(false);
    return;
  }

  setOfflineControlsEnabled(false);
  try {
    const registration = await navigator.serviceWorker.register("/service-worker.js");
    await prepareServiceWorkerRegistration(registration);
    offlineStorageSupported = true;

    if (reloadOnceForServiceWorkerControl()) return;

    await refreshOfflineCacheStatus();
  } catch (error) {
    logOfflineCacheFailure("Service worker registration failed. Attempting offline cache repair.", error);
    await repairOfflineCacheStatus(error);
  }
}

setOfflineControlsEnabled(false);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    offlineServiceWorker = navigator.serviceWorker.controller || offlineServiceWorker;
    refreshOfflineCacheStatus(true);
  });
  window.addEventListener("load", registerServiceWorker);
} else {
  renderOfflineCacheStatus({});
  setOfflineStorageStatus("Offline cache controls unavailable", "error");
}

checkHealth();
loadCategories();
initCalculator();
renderSearchMemory();
