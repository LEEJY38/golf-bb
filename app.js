const API_BASE = "https://golf-8-live-score.sd897v7sxf.chatgpt.site";
const DEFAULT_PARS = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const PLAYER_DATA = [
  { id: 1, name: "HM", initials: "HM", team: "B", flight: 1 },
  { id: 2, name: "JY", initials: "JY", team: "B", flight: 1 },
  { id: 3, name: "Jeff", initials: "JF", team: "A", flight: 1 },
  { id: 4, name: "Lawyer", initials: "LW", team: "A", flight: 1 },
  { id: 5, name: "Pro Tan", initials: "PT", team: "A", flight: 2 },
  { id: 6, name: "Scammer", initials: "SC", team: "A", flight: 2 },
  { id: 7, name: "Petrus", initials: "PE", team: "B", flight: 2 },
  { id: 8, name: "KC", initials: "KC", team: "B", flight: 2 },
];

let pars = [...DEFAULT_PARS];
let draftPars = [...DEFAULT_PARS];
let players = PLAYER_DATA.map((player) => ({ ...player, scores: Array(18).fill(null) }));
let flight = 1;
let nine = "front";
let scorer = null;
let token = sessionStorage.getItem("golfbb_token") || "";
let editing = null;
let draftScore = null;
let toastTimer = null;

const byId = (id) => document.getElementById(id);

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
  if (!response.ok) throw new Error(data.error || "连接暂时失败");
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
  const nextPlayers = PLAYER_DATA.map((player) => ({ ...player, scores: Array(18).fill(null) }));
  for (const saved of data.scores || []) {
    const player = nextPlayers.find((item) => item.id === Number(saved.playerId));
    if (player && saved.hole >= 0 && saved.hole < 18) player.scores[saved.hole] = Number(saved.strokes);
  }
  players = nextPlayers;
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
      <div><span class="mini-avatar team-${player.team.toLowerCase()}">${player.initials}</span><p><strong>${player.name}</strong><small>Team ${player.team === "A" ? "Jahat" : "Baik"}</small></p></div>
    `).join("");
  }
}

function renderTeamTotals() {
  const totals = { A: 0, B: 0 };
  for (const player of players) totals[player.team] += scoreTotal(player.scores);
  byId("team-a-score").textContent = totals.A;
  byId("team-b-score").textContent = totals.B;
  const tie = totals.A === totals.B;
  const leader = tie ? null : totals.A < totals.B ? "A" : "B";
  const leadBy = Math.abs(totals.A - totals.B);
  byId("team-a-status").textContent = tie ? "平手" : leader === "A" ? `领先 ${leadBy} 杆` : `落后 ${leadBy} 杆`;
  byId("team-b-status").textContent = tie ? "平手" : leader === "B" ? `领先 ${leadBy} 杆` : `落后 ${leadBy} 杆`;
  byId("team-a-card").classList.toggle("leading", leader === "A");
  byId("team-b-card").classList.toggle("leading", leader === "B");
}

function renderScoreboard() {
  const activeHole = currentHole();
  const holes = nine === "front" ? Array.from({ length: 9 }, (_, index) => index) : Array.from({ length: 9 }, (_, index) => index + 9);
  const visiblePlayers = players.filter((player) => player.flight === flight);
  const canEditFlight = scorer?.flight === flight;
  let html = '<div class="grid-header player-column">球员</div>';
  html += holes.map((hole) => `<div class="grid-header ${hole + 1 === activeHole ? "current" : ""}"><b>${hole + 1}</b><small>PAR ${pars[hole]}</small></div>`).join("");
  html += '<div class="grid-header total-column">总杆</div>';

  for (const player of visiblePlayers) {
    html += `<div class="score-row"><div class="player-cell"><span class="avatar team-${player.team.toLowerCase()}">${player.initials}</span><span class="player-name"><strong>${player.name}</strong><small>TEAM ${player.team === "A" ? "JAHAT" : "BAIK"}</small></span></div>`;
    html += holes.map((hole) => {
      const score = player.scores[hole];
      const diff = score === null ? 0 : score - pars[hole];
      const label = score === null ? "未记录" : `${score} 杆`;
      return `<button class="score-cell ${hole + 1 === activeHole ? "current" : ""} ${diff < 0 ? "under" : ""} ${diff > 0 ? "over" : ""}" data-player="${player.id}" data-hole="${hole}" aria-label="${player.name} 第 ${hole + 1} 洞 ${label}" ${canEditFlight ? "" : "data-readonly=\"true\""}><span>${score ?? "–"}</span></button>`;
    }).join("");
    html += `<div class="total-cell"><strong>${scoreTotal(player.scores)}</strong><small>${formatToPar(toPar(player))}</small></div></div>`;
  }
  byId("score-grid").innerHTML = html;
}

function render() {
  const activeHole = currentHole();
  byId("current-status").textContent = activeHole === 0 ? "比赛尚未开始" : `第 ${activeHole} 洞进行中`;
  byId("flight-title").textContent = `第 ${flight} 组 · Tee ${flight === 1 ? "08:10" : "08:20"}`;
  document.querySelectorAll("[data-flight]").forEach((button) => button.classList.toggle("active", Number(button.dataset.flight) === flight));
  document.querySelectorAll("[data-nine]").forEach((button) => button.classList.toggle("active", button.dataset.nine === nine));
  byId("permission-label").textContent = scorer ? `${scorer.label} · 可编辑` : "访客 · 只读";
  byId("permission-pill").classList.toggle("can-edit", Boolean(scorer));
  byId("login-button").textContent = scorer ? "退出计分" : "登录计分";
  byId("par-button").classList.toggle("hidden", !scorer);
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
    showToast("访客只能查看；请用对应组别计分员账号登录");
    return;
  }
  editing = { playerId, hole };
  draftScore = player.scores[hole] ?? pars[hole];
  byId("editor-player").innerHTML = `<span class="avatar team-${player.team.toLowerCase()}">${player.initials}</span><span class="player-name"><strong>${player.name}</strong><small>TEAM ${player.team === "A" ? "JAHAT" : "BAIK"}</small></span>`;
  byId("editor-hole").textContent = `HOLE ${hole + 1}`;
  byId("editor-par").textContent = `PAR ${pars[hole]}`;
  updateScoreEditor();
  byId("score-backdrop").classList.remove("hidden");
}

function updateScoreEditor() {
  if (!editing) return;
  const par = pars[editing.hole];
  byId("draft-score").textContent = draftScore;
  byId("score-description").textContent = draftScore < par ? "低于标准杆" : draftScore === par ? "标准杆" : "高于标准杆";
}

function renderParEditor() {
  const front = draftPars.slice(0, 9).reduce((sum, par) => sum + par, 0);
  const back = draftPars.slice(9).reduce((sum, par) => sum + par, 0);
  byId("par-totals").innerHTML = `<span>前九 <strong>${front}</strong></span><span>后九 <strong>${back}</strong></span><span>总 PAR <strong>${front + back}</strong></span>`;
  byId("par-grid").innerHTML = draftPars.map((par, hole) => `<label class="par-field"><span>HOLE</span><strong>${String(hole + 1).padStart(2, "0")}</strong><select data-par-hole="${hole}" aria-label="第 ${hole + 1} 洞标准杆">${[3, 4, 5, 6].map((value) => `<option value="${value}" ${value === par ? "selected" : ""}>PAR ${value}</option>`).join("")}</select></label>`).join("");
}

async function restoreSession() {
  if (!token) return;
  try {
    const data = await api("/api/auth/session", { headers: headers() });
    scorer = data.scorer;
    if (!scorer) throw new Error("登录已过期");
  } catch {
    token = "";
    scorer = null;
    sessionStorage.removeItem("golfbb_token");
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, [data-close]");
  if (!target) return;
  if (target.dataset.flight) { flight = Number(target.dataset.flight); render(); return; }
  if (target.dataset.nine) { nine = target.dataset.nine; render(); return; }
  if (target.classList.contains("score-cell")) { openScoreEditor(Number(target.dataset.player), Number(target.dataset.hole)); return; }
  if (target.dataset.close) { byId(`${target.dataset.close}-backdrop`).classList.add("hidden"); return; }
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => backdrop.addEventListener("mousedown", (event) => {
  if (event.target === backdrop) backdrop.classList.add("hidden");
}));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelectorAll(".modal-backdrop").forEach((modal) => modal.classList.add("hidden"));
});

byId("login-button").addEventListener("click", () => {
  if (!scorer) return openAuth();
  scorer = null; token = ""; sessionStorage.removeItem("golfbb_token"); render(); showToast("已退出计分模式");
});

byId("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api("/api/auth/login", { method: "POST", headers: headers(true), body: JSON.stringify({ id: String(form.get("scorerId") || "").trim().toLowerCase(), password: String(form.get("password") || "") }) });
    scorer = data.scorer; token = data.token; sessionStorage.setItem("golfbb_token", token);
    event.currentTarget.reset(); byId("auth-backdrop").classList.add("hidden"); render(); showToast(`${scorer.label} 已登录`);
  } catch (error) { showToast(error.message); }
});

byId("score-minus").addEventListener("click", () => { draftScore = Math.max(1, draftScore - 1); updateScoreEditor(); });
byId("score-plus").addEventListener("click", () => { draftScore = Math.min(12, draftScore + 1); updateScoreEditor(); });
byId("save-score").addEventListener("click", async () => {
  if (!editing || !scorer) return;
  try {
    await api("/api/live/score", { method: "PATCH", headers: headers(true), body: JSON.stringify({ playerId: editing.playerId, hole: editing.hole, strokes: draftScore }) });
    byId("score-backdrop").classList.add("hidden"); editing = null; await refreshLive(false); showToast("成绩已保存并同步");
  } catch (error) { showToast(error.message); }
});

byId("par-button").addEventListener("click", () => { draftPars = [...pars]; renderParEditor(); byId("par-backdrop").classList.remove("hidden"); });
byId("par-grid").addEventListener("change", (event) => { const hole = Number(event.target.dataset.parHole); if (Number.isInteger(hole)) { draftPars[hole] = Number(event.target.value); renderParEditor(); } });
byId("save-pars").addEventListener("click", async () => {
  try {
    await api("/api/live/pars", { method: "PUT", headers: headers(true), body: JSON.stringify({ pars: draftPars }) });
    byId("par-backdrop").classList.add("hidden"); await refreshLive(false); showToast("球场 PAR 已保存");
  } catch (error) { showToast(error.message); }
});

byId("share-button").addEventListener("click", async () => {
  try {
    if (navigator.share) await navigator.share({ title: "Golf BB · Live Score", url: location.href });
    else { await navigator.clipboard.writeText(location.href); showToast("链接已复制"); }
  } catch { /* Sharing was cancelled. */ }
});

async function start() {
  await Promise.all([restoreSession(), refreshLive(true)]);
  render();
  setInterval(() => refreshLive(true), 10000);
}

start();
