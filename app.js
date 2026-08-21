const API_BASE = "https://golf-8-live-score.sd897v7sxf.chatgpt.site";
const DEFAULT_PARS = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const DEFAULT_PLAYER_DATA = [
  { id: 1, name: "HM", team: "B", flight: 1 },
  { id: 2, name: "JY", team: "B", flight: 1 },
  { id: 3, name: "Jeff", team: "A", flight: 1 },
  { id: 4, name: "Lawyer", team: "A", flight: 1 },
  { id: 5, name: "Pro Tan", team: "A", flight: 2 },
  { id: 6, name: "Scammer", team: "A", flight: 2 },
  { id: 7, name: "Petrus", team: "B", flight: 2 },
  { id: 8, name: "KC", team: "B", flight: 2 },
];

let pars = [...DEFAULT_PARS];
let draftPars = [...DEFAULT_PARS];
let players = buildPlayers(DEFAULT_PLAYER_DATA);
let draftPlayers = DEFAULT_PLAYER_DATA.map((player) => ({ ...player }));
let flight = 1;
let nine = "front";
let scorer = null;
let token = sessionStorage.getItem("golfbb_token") || "";
let editing = null;
let draftScore = null;
let toastTimer = null;

const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]).join("") : (parts[0] || "?").slice(0, 2)).toUpperCase();
}

function buildPlayers(settings, scores = []) {
  const result = settings.map((player) => ({ ...player, scores: Array(18).fill(null) }));
  for (const saved of scores) {
    const player = result.find((item) => item.id === Number(saved.playerId));
    if (player && saved.hole >= 0 && saved.hole < 18) player.scores[saved.hole] = Number(saved.strokes);
  }
  return result;
}

function scoreTotal(scores) {
  return scores.reduce((sum, score) => sum + (score ?? 0), 0);
}

function toPar(player) {
  return player.scores.reduce((sum, score, hole) => sum + (score === null ? 0 : score - pars[hole]), 0);
}

function formatToPar(value) {
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : String(value);
}

function currentHole() {
  return Math.max(0, ...players.map((player) => player.scores.reduce((last, score, index) => score === null ? last : index + 1, 0)));
}

function headers(json = false) {
  const value = {};
  if (json) value["Content-Type"] = "application/json";
  if (token) value.Authorization = `Bearer ${token}`;
  return value;
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Connection temporarily unavailable");
  return data;
}

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

function hydrateLive(data) {
  if (Array.isArray(data.pars) && data.pars.length === 18) pars = data.pars.map(Number);
  const settings = Array.isArray(data.players) && data.players.length === 8 ? data.players : DEFAULT_PLAYER_DATA;
  players = buildPlayers(settings, data.scores || []);
  render();
}

async function refreshLive(silent = true) {
  try {
    hydrateLive(await api("/api/live"));
  } catch (error) {
    if (!silent) showToast(error.message);
  }
}

function renderGroups() {
  for (const group of [1, 2]) {
    byId(`group-${group}`).innerHTML = players.filter((player) => player.flight === group).map((player) => `
      <div><span class="mini-avatar team-${player.team.toLowerCase()}">${escapeHtml(initials(player.name))}</span><p><strong>${escapeHtml(player.name)}</strong><small>Team ${player.team === "A" ? "Jahat" : "Baik"}</small></p></div>
    `).join("");
  }
}

function renderTeamTotals() {
  const totals = { A: 0, B: 0 };
  for (const player of players) totals[player.team] += scoreTotal(player.scores);
  byId("team-a-score").textContent = totals.A;
  byId("team-b-score").textContent = totals.B;
  const tied = totals.A === totals.B;
  const leader = tied ? null : totals.A < totals.B ? "A" : "B";
  const leadBy = Math.abs(totals.A - totals.B);
  byId("team-a-status").textContent = tied ? "TIED" : leader === "A" ? `LEADS BY ${leadBy}` : `TRAILS BY ${leadBy}`;
  byId("team-b-status").textContent = tied ? "TIED" : leader === "B" ? `LEADS BY ${leadBy}` : `TRAILS BY ${leadBy}`;
  byId("team-a-card").classList.toggle("leading", leader === "A");
  byId("team-b-card").classList.toggle("leading", leader === "B");
}

function renderScoreboard() {
  const activeHole = currentHole();
  const holes = nine === "front" ? Array.from({ length: 9 }, (_, index) => index) : Array.from({ length: 9 }, (_, index) => index + 9);
  const visiblePlayers = players.filter((player) => player.flight === flight);
  const canEditFlight = scorer?.flight === flight;
  let html = '<div class="grid-header player-column">PLAYER</div>';
  html += holes.map((hole) => `<div class="grid-header ${hole + 1 === activeHole ? "current" : ""}"><b>${hole + 1}</b><small>PAR ${pars[hole]}</small></div>`).join("");
  html += '<div class="grid-header total-column">TOTAL</div>';

  for (const player of visiblePlayers) {
    const safeName = escapeHtml(player.name);
    html += `<div class="score-row"><div class="player-cell"><span class="avatar team-${player.team.toLowerCase()}">${escapeHtml(initials(player.name))}</span><span class="player-name"><strong>${safeName}</strong><small>TEAM ${player.team === "A" ? "JAHAT" : "BAIK"}</small></span></div>`;
    html += holes.map((hole) => {
      const score = player.scores[hole];
      const diff = score === null ? 0 : score - pars[hole];
      const label = score === null ? "not entered" : `${score} strokes`;
      return `<button class="score-cell ${hole + 1 === activeHole ? "current" : ""} ${diff < 0 ? "under" : ""} ${diff > 0 ? "over" : ""}" data-player="${player.id}" data-hole="${hole}" aria-label="${safeName}, hole ${hole + 1}, ${label}" ${canEditFlight ? "" : "data-readonly=\"true\""}><span>${score ?? "–"}</span></button>`;
    }).join("");
    html += `<div class="total-cell"><strong>${scoreTotal(player.scores)}</strong><small>${formatToPar(toPar(player))}</small></div></div>`;
  }
  byId("score-grid").innerHTML = html;
}

function render() {
  const activeHole = currentHole();
  byId("current-status").textContent = activeHole === 0 ? "MATCH NOT STARTED" : `HOLE ${activeHole} IN PLAY`;
  byId("flight-title").textContent = `Flight ${flight} · Tee ${flight === 1 ? "08:10" : "08:20"}`;
  document.querySelectorAll("[data-flight]").forEach((button) => button.classList.toggle("active", Number(button.dataset.flight) === flight));
  document.querySelectorAll("[data-nine]").forEach((button) => button.classList.toggle("active", button.dataset.nine === nine));
  byId("permission-label").textContent = scorer ? `${scorer.label} · EDITING` : "GUEST · VIEW ONLY";
  byId("permission-pill").classList.toggle("can-edit", Boolean(scorer));
  byId("login-button").textContent = scorer ? "Sign Out" : "Scorer Sign In";
  byId("par-button").classList.toggle("hidden", !scorer);
  byId("match-button").classList.toggle("hidden", !scorer);
  renderTeamTotals();
  renderScoreboard();
  renderGroups();
}

function openAuth() {
  byId("auth-backdrop").classList.remove("hidden");
  byId("login-form").querySelector("input").focus();
}

function openScoreEditor(playerId, hole) {
  const player = players.find((item) => item.id === playerId);
  if (!scorer || !player || scorer.flight !== player.flight) {
    showToast("Guest access is view-only. Use the scorer account for this flight.");
    return;
  }
  editing = { playerId, hole };
  draftScore = player.scores[hole] ?? pars[hole];
  byId("editor-player").innerHTML = `<span class="avatar team-${player.team.toLowerCase()}">${escapeHtml(initials(player.name))}</span><span class="player-name"><strong>${escapeHtml(player.name)}</strong><small>TEAM ${player.team === "A" ? "JAHAT" : "BAIK"}</small></span>`;
  byId("editor-hole").textContent = `HOLE ${hole + 1}`;
  byId("editor-par").textContent = `PAR ${pars[hole]}`;
  updateScoreEditor();
  byId("score-backdrop").classList.remove("hidden");
}

function updateScoreEditor() {
  if (!editing) return;
  const par = pars[editing.hole];
  byId("draft-score").textContent = draftScore;
  byId("score-description").textContent = draftScore < par ? "UNDER PAR" : draftScore === par ? "EVEN PAR" : "OVER PAR";
}

function renderParEditor() {
  const front = draftPars.slice(0, 9).reduce((sum, par) => sum + par, 0);
  const back = draftPars.slice(9).reduce((sum, par) => sum + par, 0);
  byId("par-totals").innerHTML = `<span>FRONT 9<strong>${front}</strong></span><span>BACK 9<strong>${back}</strong></span><span>TOTAL PAR<strong>${front + back}</strong></span>`;
  byId("par-grid").innerHTML = draftPars.map((par, hole) => `<label class="par-field"><span>HOLE</span><strong>${String(hole + 1).padStart(2, "0")}</strong><select data-par-hole="${hole}" aria-label="Hole ${hole + 1} PAR">${[3, 4, 5, 6].map((value) => `<option value="${value}" ${value === par ? "selected" : ""}>PAR ${value}</option>`).join("")}</select></label>`).join("");
}

function renderMatchEditor() {
  const counts = {
    teamA: draftPlayers.filter((player) => player.team === "A").length,
    teamB: draftPlayers.filter((player) => player.team === "B").length,
    flight1: draftPlayers.filter((player) => player.flight === 1).length,
    flight2: draftPlayers.filter((player) => player.flight === 2).length,
  };
  byId("match-summary").innerHTML = `<span>JAHAT <strong>${counts.teamA}/4</strong></span><span>BAIK <strong>${counts.teamB}/4</strong></span><span>FLIGHT 1 <strong>${counts.flight1}/4</strong></span><span>FLIGHT 2 <strong>${counts.flight2}/4</strong></span>`;
  byId("player-settings-list").innerHTML = draftPlayers.map((player) => `<div class="player-setting-row"><span class="player-slot">${String(player.id).padStart(2, "0")}</span><label>PLAYER NAME<input value="${escapeHtml(player.name)}" maxlength="30" data-player-name="${player.id}" aria-label="Player ${player.id} name" /></label><label>TEAM<select data-player-team="${player.id}" aria-label="Player ${player.id} team"><option value="A" ${player.team === "A" ? "selected" : ""}>Jahat</option><option value="B" ${player.team === "B" ? "selected" : ""}>Baik</option></select></label><label>FLIGHT<select data-player-flight="${player.id}" aria-label="Player ${player.id} flight"><option value="1" ${player.flight === 1 ? "selected" : ""}>1</option><option value="2" ${player.flight === 2 ? "selected" : ""}>2</option></select></label></div>`).join("");
}

async function restoreSession() {
  if (!token) return;
  try {
    const data = await api("/api/auth/session", { headers: headers() });
    scorer = data.scorer;
    if (!scorer) throw new Error("Session expired");
  } catch {
    token = "";
    scorer = null;
    sessionStorage.removeItem("golfbb_token");
  }
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button, [data-close]");
  if (!target) return;
  if (target.dataset.flight) { flight = Number(target.dataset.flight); render(); return; }
  if (target.dataset.nine) { nine = target.dataset.nine; render(); return; }
  if (target.classList.contains("score-cell")) { openScoreEditor(Number(target.dataset.player), Number(target.dataset.hole)); return; }
  if (target.dataset.close) { byId(`${target.dataset.close}-backdrop`).classList.add("hidden"); }
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => backdrop.addEventListener("mousedown", (event) => {
  if (event.target === backdrop) backdrop.classList.add("hidden");
}));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelectorAll(".modal-backdrop").forEach((modal) => modal.classList.add("hidden"));
});

byId("login-button").addEventListener("click", () => {
  if (!scorer) return openAuth();
  scorer = null;
  token = "";
  sessionStorage.removeItem("golfbb_token");
  render();
  showToast("Switched to guest view");
});

byId("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api("/api/auth/login", { method: "POST", headers: headers(true), body: JSON.stringify({ id: String(form.get("scorerId") || "").trim().toLowerCase(), password: String(form.get("password") || "") }) });
    scorer = data.scorer;
    token = data.token;
    sessionStorage.setItem("golfbb_token", token);
    flight = scorer.flight;
    event.currentTarget.reset();
    byId("auth-backdrop").classList.add("hidden");
    render();
    showToast(`${scorer.label} signed in`);
  } catch (error) {
    showToast(error.message);
  }
});

byId("score-minus").addEventListener("click", () => { draftScore = Math.max(1, draftScore - 1); updateScoreEditor(); });
byId("score-plus").addEventListener("click", () => { draftScore = Math.min(12, draftScore + 1); updateScoreEditor(); });
byId("save-score").addEventListener("click", async () => {
  if (!editing || !scorer) return;
  try {
    await api("/api/live/score", { method: "PATCH", headers: headers(true), body: JSON.stringify({ playerId: editing.playerId, hole: editing.hole, strokes: draftScore }) });
    byId("score-backdrop").classList.add("hidden");
    editing = null;
    await refreshLive(false);
    showToast("Score saved and synced");
  } catch (error) {
    showToast(error.message);
  }
});

byId("par-button").addEventListener("click", () => { draftPars = [...pars]; renderParEditor(); byId("par-backdrop").classList.remove("hidden"); });
byId("par-grid").addEventListener("change", (event) => { const hole = Number(event.target.dataset.parHole); if (Number.isInteger(hole)) { draftPars[hole] = Number(event.target.value); renderParEditor(); } });
byId("save-pars").addEventListener("click", async () => {
  try {
    await api("/api/live/pars", { method: "PUT", headers: headers(true), body: JSON.stringify({ pars: draftPars }) });
    byId("par-backdrop").classList.add("hidden");
    await refreshLive(false);
    showToast("Course PAR saved and synced");
  } catch (error) {
    showToast(error.message);
  }
});

byId("match-button").addEventListener("click", () => {
  draftPlayers = players.map(({ id, name, team, flight: playerFlight }) => ({ id, name, team, flight: playerFlight }));
  renderMatchEditor();
  byId("match-backdrop").classList.remove("hidden");
});

byId("player-settings-list").addEventListener("input", (event) => {
  const id = Number(event.target.dataset.playerName);
  if (Number.isInteger(id)) draftPlayers = draftPlayers.map((player) => player.id === id ? { ...player, name: event.target.value } : player);
});

byId("player-settings-list").addEventListener("change", (event) => {
  const teamId = Number(event.target.dataset.playerTeam);
  const flightId = Number(event.target.dataset.playerFlight);
  if (Number.isInteger(teamId)) draftPlayers = draftPlayers.map((player) => player.id === teamId ? { ...player, team: event.target.value } : player);
  if (Number.isInteger(flightId)) draftPlayers = draftPlayers.map((player) => player.id === flightId ? { ...player, flight: Number(event.target.value) } : player);
  renderMatchEditor();
});

byId("save-match").addEventListener("click", async () => {
  try {
    await api("/api/live/players", { method: "PUT", headers: headers(true), body: JSON.stringify({ players: draftPlayers }) });
    byId("match-backdrop").classList.add("hidden");
    await refreshLive(false);
    showToast("Player names, teams, and flights saved");
  } catch (error) {
    showToast(error.message);
  }
});

byId("share-button").addEventListener("click", async () => {
  try {
    if (navigator.share) await navigator.share({ title: "Golf BB · Live Score", url: location.href });
    else { await navigator.clipboard.writeText(location.href); showToast("Live Score link copied"); }
  } catch { /* Sharing was cancelled. */ }
});

async function start() {
  await Promise.all([restoreSession(), refreshLive(true)]);
  render();
  setInterval(() => refreshLive(true), 10000);
}

start();
