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

const form = document.querySelector("#assistantForm");
const input = document.querySelector("#messageInput");
const askButton = document.querySelector("#askButton");
const newButton = document.querySelector("#newButton");
const categoryRail = document.querySelector("#categoryRail");
const answerEl = document.querySelector("#answer");
const statusEl = document.querySelector("#connectionStatus");

let activeCategorySlug = "";

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
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
  clearNode(categoryRail);
  categories.forEach((category) => {
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

function renderLoading(query) {
  clearNode(answerEl);
  const article = createElement("article", "answer-card loading-card");
  article.appendChild(createElement("p", "answer-kicker", "Working"));
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
    }
    if (source.note) item.appendChild(createElement("p", "", source.note));
    if (source.is_placeholder) item.appendChild(createElement("em", "", "Local seed data"));
    list.appendChild(item);
  });
  section.appendChild(list);
  parent.appendChild(section);
}

function appendRelated(parent, topics) {
  const section = createElement("section", "answer-section");
  section.appendChild(createElement("h3", "", "Related Topics"));
  const row = createElement("div", "related-row");
  (topics && topics.length ? topics : ["Speeds & feeds", "Inspection", "Tooling"]).forEach((topic) => {
    const button = createElement("button", "", topic);
    button.type = "button";
    button.addEventListener("click", () => {
      const prompt = `Ask about ${topic}.`;
      input.value = prompt;
      input.focus();
    });
    row.appendChild(button);
  });
  section.appendChild(row);
  parent.appendChild(section);
}

function renderAnswer(data) {
  clearNode(answerEl);
  activeCategorySlug = data.category?.slug || "";
  renderCategories(data.categories || FALLBACK_CATEGORIES);

  const answer = data.answer;
  if (!answer) return;

  const article = createElement("article", "answer-card");
  const header = createElement("header", "answer-header");
  header.appendChild(createElement("p", "answer-kicker", answer.title || data.category?.name || "ChipMate"));
  header.appendChild(createElement("h2", "", data.query || "Machining question"));
  article.appendChild(header);

  appendTextSection(article, "Direct Answer", answer.direct_answer);
  appendSteps(article, answer.steps);
  appendFormulas(article, answer.formulas);
  appendSources(article, answer.sources);
  appendRelated(article, answer.related_topics);

  if (answer.note) {
    const note = createElement("p", "answer-note", answer.note);
    article.appendChild(note);
  }

  answerEl.appendChild(article);
}

async function ask(message) {
  const query = (message || "").trim();
  if (!query) {
    input.focus();
    return;
  }

  askButton.disabled = true;
  renderLoading(query);

  try {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: query, state: {} }),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();
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

newButton.addEventListener("click", () => {
  input.value = "";
  activeCategorySlug = "";
  clearNode(answerEl);
  renderCategories(FALLBACK_CATEGORIES);
  input.focus();
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
