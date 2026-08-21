const API_BASE = "https://golf-8-live-score.sd897v7sxf.chatgpt.site";
const DEFAULT_PARS = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const DEFAULT_MATCH = { eventDate: "2026-08-21", venue: "Horizon Hills Golf Club", teamAName: "Jahat", teamBName: "Baik", teamAColor: "green", teamBColor: "gold" };
const TEAM_COLOR_PALETTE = {
  green: { background: "#173d2c", text: "#ffffff" },
  gold: { background: "#d9a65d", text: "#273127" },
  red: { background: "#b83b45", text: "#ffffff" },
  black: { background: "#171918", text: "#ffffff" },
  blue: { background: "#2d5fa8", text: "#ffffff" },
  gray: { background: "#737a7d", text: "#ffffff" },
  white: { background: "#f4f4f0", text: "#273127" },
  purple: { background: "#7050a5", text: "#ffffff" },
  pink: { background: "#d979a2", text: "#311d27" },
};
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

const MATCH_CACHE_KEY = "golfbb_match";
const LIVE_CACHE_KEY = "golfbb_live";

function loadCachedMatch() {
  try {
    const value = JSON.parse(localStorage.getItem(MATCH_CACHE_KEY) || "null");
    if (!value || !TEAM_COLOR_PALETTE[value.teamAColor] || !TEAM_COLOR_PALETTE[value.teamBColor]) return null;
    return { ...DEFAULT_MATCH, ...value };
  } catch { return null; }
}

function loadCachedLive() {
  try {
    const value = JSON.parse(localStorage.getItem(LIVE_CACHE_KEY) || "null");
    const savedMatch = value?.match && TEAM_COLOR_PALETTE[value.match.teamAColor] && TEAM_COLOR_PALETTE[value.match.teamBColor]
      ? { ...DEFAULT_MATCH, ...value.match }
      : null;
    if (!savedMatch || !Array.isArray(value.players) || value.players.length !== 8 || !Array.isArray(value.pars) || value.pars.length !== 18 || !Array.isArray(value.scores)) return null;
    return { match: savedMatch, players: value.players, pars: value.pars.map(Number), scores: value.scores };
  } catch { return null; }
}

function cacheLiveSnapshot() {
  try {
    const scores = players.flatMap((player) => player.scores.flatMap((strokes, hole) => strokes === null ? [] : [{ playerId: player.id, hole, strokes }]));
    const playerSettings = players.map(({ id, name, team, flight: playerFlight }) => ({ id, name, team, flight: playerFlight }));
    localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify({ match, pars, players: playerSettings, scores }));
  } catch { /* Live data remains available without device storage. */ }
}

const cachedLive = loadCachedLive();
let pars = cachedLive ? [...cachedLive.pars] : [...DEFAULT_PARS];
let draftPars = [...DEFAULT_PARS];
let match = cachedLive?.match || loadCachedMatch() || { ...DEFAULT_MATCH };
let draftMatch = { ...match };
let players = cachedLive ? buildPlayers(cachedLive.players, cachedLive.scores) : buildPlayers(DEFAULT_PLAYER_DATA);
let draftPlayers = DEFAULT_PLAYER_DATA.map((player) => ({ ...player }));
let flight = 1;
let nine = "front";
let scorer = null;
const TOKEN_KEY = "golfbb_token";
let token = localStorage.getItem(TOKEN_KEY) || "";
let editing = null;
let draftScore = null;
let swapSourceId = null;
let swapTeam = "A";
let swapPlayerId = null;
let toastTimer = null;

const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]).join("") : (parts[0] || "?").slice(0, 2)).toUpperCase();
}

function teamName(team) {
  return team === "A" ? match.teamAName : match.teamBName;
}

function formatEventDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
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

function scoreMarkerClass(score, par) {
  if (score === null) return "";
  if (score < par) return "under";
  if (score >= par * 2) return "double-par";
  const difference = score - par;
  if (difference === 1) return "bogey";
  if (difference === 2) return "double-bogey";
  if (difference >= 3) return "triple-bogey";
  return "";
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
  if (response.status === 401 && path !== "/api/auth/login") {
    token = "";
    scorer = null;
    localStorage.removeItem(TOKEN_KEY);
    render();
  }
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
  if (data.match && typeof data.match === "object") {
    match = { ...DEFAULT_MATCH, ...data.match };
    try { localStorage.setItem(MATCH_CACHE_KEY, JSON.stringify(match)); } catch { /* Live data remains available without device storage. */ }
  }
  if (Array.isArray(data.pars) && data.pars.length === 18) pars = data.pars.map(Number);
  const settings = Array.isArray(data.players) && data.players.length === 8 ? data.players : DEFAULT_PLAYER_DATA;
  players = buildPlayers(settings, data.scores || []);
  cacheLiveSnapshot();
  document.documentElement.classList.remove("theme-pending");
  document.documentElement.classList.remove("live-pending");
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
      <button class="roster-player" type="button" data-swap-source="${player.id}" ${scorer ? "" : "disabled"}><span class="mini-avatar team-${player.team.toLowerCase()}">${escapeHtml(initials(player.name))}</span><span class="roster-player-copy"><strong>${escapeHtml(player.name)}</strong><small>Team ${escapeHtml(teamName(player.team))}</small></span>${scorer ? '<span class="swap-glyph">↔</span>' : ""}</button>
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

function renderMatchMeta() {
  const teamAColor = TEAM_COLOR_PALETTE[match.teamAColor] || TEAM_COLOR_PALETTE.green;
  const teamBColor = TEAM_COLOR_PALETTE[match.teamBColor] || TEAM_COLOR_PALETTE.gold;
  document.documentElement.style.setProperty("--team-a-color", teamAColor.background);
  document.documentElement.style.setProperty("--team-a-text", teamAColor.text);
  document.documentElement.style.setProperty("--team-b-color", teamBColor.background);
  document.documentElement.style.setProperty("--team-b-text", teamBColor.text);
  byId("team-headline-a").textContent = match.teamAName;
  byId("team-headline-b").textContent = match.teamBName;
  byId("event-meta").textContent = `${formatEventDate(match.eventDate)} · ${match.venue}`;
  byId("team-a-initial").textContent = match.teamAName.slice(0, 1).toUpperCase();
  byId("team-b-initial").textContent = match.teamBName.slice(0, 1).toUpperCase();
  byId("team-a-name").textContent = match.teamAName.toUpperCase();
  byId("team-b-name").textContent = match.teamBName.toUpperCase();
  byId("flight-teams").textContent = `2 Team ${match.teamAName} · 2 Team ${match.teamBName}`;
  const description = `Golf BB · Team ${match.teamAName} vs Team ${match.teamBName} live golf score`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
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
    html += `<div class="score-row"><div class="player-cell"><span class="avatar team-${player.team.toLowerCase()}">${escapeHtml(initials(player.name))}</span><span class="player-name"><strong>${safeName}</strong><small>TEAM ${escapeHtml(teamName(player.team).toUpperCase())}</small></span></div>`;
    html += holes.map((hole) => {
      const score = player.scores[hole];
      const label = score === null ? "not entered" : `${score} strokes`;
      return `<button class="score-cell ${hole + 1 === activeHole ? "current" : ""} ${scoreMarkerClass(score, pars[hole])}" data-player="${player.id}" data-hole="${hole}" aria-label="${safeName}, hole ${hole + 1}, ${label}" ${canEditFlight ? "" : "data-readonly=\"true\""}><span>${score ?? "–"}</span></button>`;
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
  byId("password-button").classList.toggle("hidden", !scorer);
  byId("reset-button").classList.toggle("hidden", !scorer);
  byId("quick-edit-hint").classList.toggle("hidden", !scorer);
  renderMatchMeta();
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
  byId("editor-player").innerHTML = `<span class="avatar team-${player.team.toLowerCase()}">${escapeHtml(initials(player.name))}</span><span class="player-name"><strong>${escapeHtml(player.name)}</strong><small>TEAM ${escapeHtml(teamName(player.team).toUpperCase())}</small></span>`;
  byId("editor-hole").textContent = `HOLE ${hole + 1}`;
  byId("editor-par").textContent = `PAR ${pars[hole]}`;
  updateScoreEditor();
  byId("score-backdrop").classList.remove("hidden");
}

function updateScoreEditor() {
  if (!editing) return;
  const par = pars[editing.hole];
  byId("draft-score").textContent = draftScore ?? "–";
  byId("score-description").textContent = draftScore === null ? "NOT ENTERED" : draftScore < par ? "UNDER PAR" : draftScore === par ? "EVEN PAR" : "OVER PAR";
  byId("save-score").innerHTML = `${draftScore === null ? "CLEAR SCORE" : "SAVE SCORE"} <span>✓</span>`;
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
  byId("match-date").value = draftMatch.eventDate;
  byId("match-venue").value = draftMatch.venue;
  byId("match-team-a").value = draftMatch.teamAName;
  byId("match-team-b").value = draftMatch.teamBName;
  byId("match-team-a-color").value = draftMatch.teamAColor;
  byId("match-team-b-color").value = draftMatch.teamBColor;
  byId("match-team-a-swatch").style.background = (TEAM_COLOR_PALETTE[draftMatch.teamAColor] || TEAM_COLOR_PALETTE.green).background;
  byId("match-team-b-swatch").style.background = (TEAM_COLOR_PALETTE[draftMatch.teamBColor] || TEAM_COLOR_PALETTE.gold).background;
  byId("match-summary").innerHTML = `<span>${escapeHtml(draftMatch.teamAName || "TEAM A")} <strong>${counts.teamA}/4</strong></span><span>${escapeHtml(draftMatch.teamBName || "TEAM B")} <strong>${counts.teamB}/4</strong></span><span>FLIGHT 1 <strong>${counts.flight1}/4</strong></span><span>FLIGHT 2 <strong>${counts.flight2}/4</strong></span>`;
  byId("player-settings-list").innerHTML = draftPlayers.map((player) => `<div class="player-setting-row"><span class="player-slot">${String(player.id).padStart(2, "0")}</span><label>PLAYER NAME<input value="${escapeHtml(player.name)}" maxlength="30" data-player-name="${player.id}" aria-label="Player ${player.id} name" /></label><label>TEAM<select data-player-team="${player.id}" aria-label="Player ${player.id} team"><option value="A" ${player.team === "A" ? "selected" : ""}>${escapeHtml(draftMatch.teamAName || "Team A")}</option><option value="B" ${player.team === "B" ? "selected" : ""}>${escapeHtml(draftMatch.teamBName || "Team B")}</option></select></label><label>FLIGHT<select data-player-flight="${player.id}" aria-label="Player ${player.id} flight"><option value="1" ${player.flight === 1 ? "selected" : ""}>1</option><option value="2" ${player.flight === 2 ? "selected" : ""}>2</option></select></label></div>`).join("");
}

function renderSwapEditor() {
  const source = players.find((player) => player.id === swapSourceId);
  if (!source) return;
  const candidates = players.filter((player) => player.id !== source.id && player.team === swapTeam && (player.team !== source.team || player.flight !== source.flight));
  if (!candidates.some((player) => player.id === swapPlayerId)) swapPlayerId = candidates[0]?.id ?? null;
  byId("swap-title").textContent = `Replace ${source.name}`;
  byId("swap-current").innerHTML = `<span class="mini-avatar team-${source.team.toLowerCase()}">${escapeHtml(initials(source.name))}</span><span><small>CURRENT PLAYER</small><strong>${escapeHtml(source.name)}</strong><em>Team ${escapeHtml(teamName(source.team))} · Flight ${source.flight}</em></span>`;
  byId("swap-team").innerHTML = `<option value="A">Team ${escapeHtml(match.teamAName)}</option><option value="B">Team ${escapeHtml(match.teamBName)}</option>`;
  byId("swap-team").value = swapTeam;
  byId("swap-player").innerHTML = candidates.map((player) => `<option value="${player.id}">${escapeHtml(player.name)} · Flight ${player.flight}</option>`).join("");
  byId("swap-player").value = swapPlayerId ?? "";
  byId("save-swap").disabled = !swapPlayerId;
}

function openPlayerSwap(playerId) {
  if (!scorer) return showToast("Sign in as a scorer to change the flight lineup.");
  const source = players.find((player) => player.id === playerId);
  if (!source) return;
  const candidates = players.filter((player) => player.id !== source.id && player.team === source.team && player.flight !== source.flight);
  swapSourceId = source.id;
  swapTeam = source.team;
  swapPlayerId = (candidates.find((player) => player.flight !== source.flight) || candidates[0] || players.find((player) => player.id !== source.id))?.id ?? null;
  renderSwapEditor();
  byId("swap-backdrop").classList.remove("hidden");
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
    localStorage.removeItem(TOKEN_KEY);
  }
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button, [data-close]");
  if (!target) return;
  if (target.dataset.flight) { flight = Number(target.dataset.flight); render(); return; }
  if (target.dataset.nine) { nine = target.dataset.nine; render(); return; }
  if (target.dataset.swapSource) { openPlayerSwap(Number(target.dataset.swapSource)); return; }
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
  localStorage.removeItem(TOKEN_KEY);
  render();
  showToast("Switched to guest view");
});

byId("password-button").addEventListener("click", () => {
  if (!scorer) return;
  byId("password-copy").textContent = `Update the password for ${scorer.label}. Use at least 8 characters.`;
  byId("password-form").reset();
  byId("password-backdrop").classList.remove("hidden");
});

byId("password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const currentPassword = String(form.get("currentPassword") || "");
  const newPassword = String(form.get("newPassword") || "");
  if (newPassword !== String(form.get("confirmPassword") || "")) return showToast("New passwords do not match");
  try {
    await api("/api/auth/password", { method: "PUT", headers: headers(true), body: JSON.stringify({ currentPassword, newPassword }) });
    formElement.reset();
    byId("password-backdrop").classList.add("hidden");
    showToast("Password changed successfully");
  } catch (error) {
    showToast(error.message);
  }
});

byId("reset-button").addEventListener("click", () => {
  if (!scorer) return;
  byId("reset-password-label").firstChild.textContent = `CONFIRM ${scorer.id.toUpperCase()} PASSWORD`;
  byId("reset-form").reset();
  byId("reset-backdrop").classList.remove("hidden");
});

byId("reset-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!scorer) return;
  const formElement = event.currentTarget;
  const password = String(new FormData(formElement).get("password") || "");
  try {
    await api("/api/live/reset", { method: "POST", headers: headers(true), body: JSON.stringify({ password }) });
    players = players.map((player) => ({ ...player, scores: Array(18).fill(null) }));
    cacheLiveSnapshot();
    formElement.reset();
    byId("reset-backdrop").classList.add("hidden");
    render();
    showToast("Game reset. All scores were cleared.");
  } catch (error) {
    showToast(error.message);
  }
});

byId("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  try {
    const data = await api("/api/auth/login", { method: "POST", headers: headers(true), body: JSON.stringify({ id: String(form.get("scorerId") || "").trim().toLowerCase(), password: String(form.get("password") || "") }) });
    scorer = data.scorer;
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    flight = scorer.flight;
    formElement.reset();
    byId("auth-backdrop").classList.add("hidden");
    render();
    showToast(`${scorer.label} signed in`);
  } catch (error) {
    showToast(error.message);
  }
});

byId("score-minus").addEventListener("click", () => { draftScore = draftScore === null || draftScore <= 1 ? null : draftScore - 1; updateScoreEditor(); });
byId("score-plus").addEventListener("click", () => { draftScore = draftScore === null ? 1 : Math.min(12, draftScore + 1); updateScoreEditor(); });
byId("save-score").addEventListener("click", async () => {
  if (!editing || !scorer) return;
  const savedEditing = { ...editing };
  const savedScore = draftScore;
  const previousPlayers = players.map((player) => ({ ...player, scores: [...player.scores] }));
  players = players.map((player) => {
    if (player.id !== savedEditing.playerId) return player;
    const scores = [...player.scores];
    scores[savedEditing.hole] = savedScore;
    return { ...player, scores };
  });
  byId("score-backdrop").classList.add("hidden");
  editing = null;
  cacheLiveSnapshot();
  render();
  try {
    await api("/api/live/score", { method: "PATCH", headers: headers(true), body: JSON.stringify({ playerId: savedEditing.playerId, hole: savedEditing.hole, strokes: savedScore }) });
    showToast(savedScore === null ? "Score cleared and synced" : "Score saved and synced");
  } catch (error) {
    players = previousPlayers;
    cacheLiveSnapshot();
    render();
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
  draftMatch = { ...match };
  draftPlayers = players.map(({ id, name, team, flight: playerFlight }) => ({ id, name, team, flight: playerFlight }));
  renderMatchEditor();
  byId("match-backdrop").classList.remove("hidden");
});

for (const [elementId, field] of [["match-date", "eventDate"], ["match-venue", "venue"], ["match-team-a", "teamAName"], ["match-team-b", "teamBName"]]) {
  byId(elementId).addEventListener("input", (event) => {
    draftMatch = { ...draftMatch, [field]: event.target.value };
  });
  if (field === "teamAName" || field === "teamBName") byId(elementId).addEventListener("change", renderMatchEditor);
}

for (const [elementId, field] of [["match-team-a-color", "teamAColor"], ["match-team-b-color", "teamBColor"]]) {
  byId(elementId).addEventListener("change", (event) => {
    draftMatch = { ...draftMatch, [field]: event.target.value };
    renderMatchEditor();
  });
}

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
    await api("/api/live/settings", { method: "PUT", headers: headers(true), body: JSON.stringify({ match: draftMatch, players: draftPlayers }) });
    byId("match-backdrop").classList.add("hidden");
    await refreshLive(false);
    showToast("Match details and player setup saved");
  } catch (error) {
    showToast(error.message);
  }
});

byId("swap-team").addEventListener("change", (event) => {
  swapTeam = event.target.value;
  const source = players.find((player) => player.id === swapSourceId);
  const candidates = players.filter((player) => player.id !== source?.id && player.team === swapTeam && (!source || player.team !== source.team || player.flight !== source.flight));
  swapPlayerId = (candidates.find((player) => player.flight !== source?.flight) || candidates[0])?.id ?? null;
  renderSwapEditor();
});

byId("swap-player").addEventListener("change", (event) => {
  swapPlayerId = Number(event.target.value);
});

byId("save-swap").addEventListener("click", async () => {
  const source = players.find((player) => player.id === swapSourceId);
  const replacement = players.find((player) => player.id === swapPlayerId);
  if (!source || !replacement) return showToast("Choose a replacement player");
  const nextPlayers = players.map(({ id, name, team, flight: playerFlight }) => {
    if (id === source.id) return { id, name, team: replacement.team, flight: replacement.flight };
    if (id === replacement.id) return { id, name, team: source.team, flight: source.flight };
    return { id, name, team, flight: playerFlight };
  });
  try {
    await api("/api/live/settings", { method: "PUT", headers: headers(true), body: JSON.stringify({ match, players: nextPlayers }) });
    byId("swap-backdrop").classList.add("hidden");
    swapSourceId = null;
    swapPlayerId = null;
    await refreshLive(false);
    showToast(`${replacement.name} moved into Flight ${source.flight}`);
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
  render();
  if (cachedLive) document.documentElement.classList.remove("live-pending");
  try { await Promise.all([restoreSession(), refreshLive(true)]); }
  finally { document.documentElement.classList.remove("theme-pending", "live-pending"); render(); }
  setInterval(() => refreshLive(true), 10000);
}

start();
