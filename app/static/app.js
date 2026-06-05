const STORAGE_KEY = "chipmate-reamer-state-v0.1";

const form = document.querySelector("#assistantForm");
const input = document.querySelector("#messageInput");
const resetButton = document.querySelector("#resetButton");
const followupsEl = document.querySelector("#followups");
const answerEl = document.querySelector("#answer");
const stateEl = document.querySelector("#stateSummary");
const statusEl = document.querySelector("#connectionStatus");
const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const searchResults = document.querySelector("#searchResults");

let state = loadState();

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function updateConnectionStatus() {
  const online = navigator.onLine;
  statusEl.textContent = online ? "Online" : "Offline";
  statusEl.classList.toggle("online", online);
  statusEl.classList.toggle("offline", !online);
}

function titleCase(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === undefined || value === null || value === "") return "Missing";
  return String(value)
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDiameter(value) {
  if (!value) return "Missing";
  return `${Number(value).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} in`;
}

function renderState() {
  const items = [
    ["Diameter", formatDiameter(state.diameter_in)],
    ["Operation", "Reaming"],
    ["Machine", titleCase(state.machine)],
    ["Material", titleCase(state.material)],
    ["Reamer", titleCase(state.tool_material)],
    ["Coolant", titleCase(state.coolant)],
  ];

  stateEl.innerHTML = items
    .map(
      ([label, value]) => `
        <div class="state-item">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `,
    )
    .join("");
}

function renderFollowups(missing) {
  followupsEl.innerHTML = "";
  if (!missing || missing.length === 0) return;

  followupsEl.innerHTML = missing
    .map((item) => {
      if (item.input_type === "number") {
        return `
          <div class="followup" data-field="${item.field}">
            <p>${item.question}</p>
            <div class="inline-entry">
              <input inputmode="decimal" type="number" min="0.01" max="6" step="0.001" placeholder="0.503" />
              <button class="secondary-button" type="button">Set</button>
            </div>
          </div>
        `;
      }
      const buttons = item.options
        .map(
          (option) => `
            <button
              class="choice-button"
              type="button"
              data-field="${item.field}"
              data-value="${String(option.value)}"
            >
              ${option.label}
            </button>
          `,
        )
        .join("");
      return `
        <div class="followup" data-field="${item.field}">
          <p>${item.question}</p>
          <div class="choice-grid">${buttons}</div>
        </div>
      `;
    })
    .join("");

  followupsEl.querySelectorAll(".choice-button").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.field;
      const rawValue = button.dataset.value;
      state[field] = rawValue === "true" ? true : rawValue === "false" ? false : rawValue;
      saveState();
      ask("");
    });
  });

  followupsEl.querySelectorAll(".inline-entry").forEach((row) => {
    const field = row.closest(".followup").dataset.field;
    const numberInput = row.querySelector("input");
    const button = row.querySelector("button");
    button.addEventListener("click", () => {
      const value = Number(numberInput.value);
      if (Number.isFinite(value) && value > 0) {
        state[field] = value;
        saveState();
        ask("");
      }
    });
  });
}

function renderAnswer(answer) {
  if (!answer) {
    answerEl.innerHTML = "";
    return;
  }
  answerEl.innerHTML = `
    <div class="rpm-readout">
      <span class="unit">Recommended spindle speed</span>
      <strong class="number">${answer.rpm}</strong>
      <span class="unit">RPM</span>
    </div>
    <div class="answer-details">
      <div class="detail-row"><strong>SFM:</strong> ${answer.sfm}</div>
      <div class="detail-row"><strong>Formula:</strong> ${answer.formula} = ${answer.rpm} RPM</div>
      <div class="citation"><strong>Source:</strong> ${answer.citation}</div>
      <div class="warning">${answer.placeholder_warning}</div>
    </div>
  `;
}

function renderError(message) {
  answerEl.innerHTML = `<div class="error-note">${message}</div>`;
}

async function ask(message) {
  renderState();
  try {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, state }),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();
    state = data.state || state;
    saveState();
    renderState();
    renderFollowups(data.missing || []);
    renderAnswer(data.answer);
  } catch (error) {
    renderError(navigator.onLine ? error.message : "Offline. Saved inputs remain on this device.");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value.trim());
  input.value = "";
});

resetButton.addEventListener("click", () => {
  state = {};
  saveState();
  renderState();
  renderFollowups([]);
  renderAnswer(null);
  input.focus();
});

document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.example;
    ask(input.value);
    input.value = "";
  });
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) {
    searchResults.innerHTML = "";
    return;
  }
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`Search failed: ${response.status}`);
    const data = await response.json();
    if (!data.results.length) {
      searchResults.innerHTML = `<div class="empty-note">No matches.</div>`;
      return;
    }
    searchResults.innerHTML = data.results
      .map(
        (item) => `
          <article class="search-result">
            <h3>${item.title}</h3>
            <p>${item.snippet || item.kind}</p>
          </article>
        `,
      )
      .join("");
  } catch (error) {
    searchResults.innerHTML = `<div class="error-note">${error.message}</div>`;
  }
});

window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

updateConnectionStatus();
renderState();
if (Object.keys(state).length) ask("");
