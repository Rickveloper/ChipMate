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
const recentPanel = document.querySelector("#recentPanel");
const recentList = document.querySelector("#recentList");
const favoritesPanel = document.querySelector("#favoritesPanel");
const favoritesList = document.querySelector("#favoritesList");
const clearRecentButton = document.querySelector("#clearRecentButton");
const clearFavoritesButton = document.querySelector("#clearFavoritesButton");

let activeCategorySlug = "";
let currentCategories = FALLBACK_CATEGORIES;
let lastAnswerData = null;
let lastQuestion = "";

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

window.addEventListener("online", checkHealth);
window.addEventListener("offline", updateConnectionStatus);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

checkHealth();
loadCategories();
renderSearchMemory();
