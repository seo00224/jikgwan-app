// ================= 데이터 =================
// KBO 10개 구단: 대표 색(main), 보조 색(sub), 홈구장
const TEAMS = [
  { id: "LG", name: "LG 트윈스",     short: "LG",  city: "서울", main: "#C30452", sub: "#000000", stadium: "잠실야구장" },
  { id: "OB", name: "두산 베어스",   short: "두산", city: "서울", main: "#131230", sub: "#ED1C24", stadium: "잠실야구장" },
  { id: "HT", name: "KIA 타이거즈",  short: "KIA", city: "광주", main: "#EA0029", sub: "#06141F", stadium: "광주-기아 챔피언스 필드" },
  { id: "SS", name: "삼성 라이온즈", short: "삼성", city: "대구", main: "#074CA1", sub: "#C0C0C0", stadium: "대구 삼성 라이온즈 파크" },
  { id: "LT", name: "롯데 자이언츠", short: "롯데", city: "부산", main: "#041E42", sub: "#D00F31", stadium: "사직야구장" },
  { id: "SK", name: "SSG 랜더스",    short: "SSG", city: "인천", main: "#CE0E2D", sub: "#FFB81C", stadium: "인천 SSG 랜더스필드" },
  { id: "HH", name: "한화 이글스",   short: "한화", city: "대전", main: "#FF6600", sub: "#07111F", stadium: "대전 한화생명 볼파크" },
  { id: "NC", name: "NC 다이노스",   short: "NC",  city: "창원", main: "#315288", sub: "#AF917B", stadium: "창원NC파크" },
  { id: "KT", name: "KT 위즈",       short: "KT",  city: "수원", main: "#000000", sub: "#EB1C24", stadium: "수원 KT 위즈파크" },
  { id: "WO", name: "키움 히어로즈", short: "키움", city: "서울", main: "#570514", sub: "#B07F4A", stadium: "고척스카이돔" },
];
const EXPENSE_TYPES = ["티켓", "음식", "굿즈", "교통", "기타"];
const CUSTOM = "__custom__";
const KEY_TEAM = "jikgwan.team";
const KEY_RECORDS = "jikgwan.records";

// ================= 저장소 =================
// 글자 데이터는 localStorage, 사진은 용량이 커서 IndexedDB에 저장
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { alert("저장 공간이 부족해요."); }
  },
};

const photoDB = (() => {
  let dbp;
  const open = () => (dbp ??= new Promise((res, rej) => {
    const req = indexedDB.open("jikgwan", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("photos");
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction("photos", mode);
      const r = fn(t.objectStore("photos"));
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    put: (id, blob) => tx("readwrite", (s) => s.put(blob, id)),
    get: (id) => tx("readonly", (s) => s.get(id)),
    del: (id) => tx("readwrite", (s) => s.delete(id)),
  };
})();

// 사진을 긴 변 1280px JPEG로 줄여서 저장 용량 절약
async function compress(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b || file), "image/jpeg", 0.82));
  } catch {
    return file;
  }
}

// ================= 상태 =================
let myTeamId = store.get(KEY_TEAM, null);
let records = store.get(KEY_RECORDS, []);
let pickedId = null;

const $ = (id) => document.getElementById(id);
const teamById = (id) => TEAMS.find((t) => t.id === id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const won = (n) => n.toLocaleString("ko-KR") + "원";
const myRecords = () => records.filter((r) => r.team === myTeamId);
const sumExpenses = (r) => (r.expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ================= 테마 =================
function mix(hex, target, amount) {
  const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = n(hex), b = n(target);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, "0")).join("");
}
function applyTheme(team) {
  const root = document.documentElement.style;
  root.setProperty("--team", team.main);
  root.setProperty("--team-dark", mix(team.main, "#000000", 0.35));
  root.setProperty("--team-soft", mix(team.main, "#ffffff", 0.9));
  document.querySelector('meta[name="theme-color"]').content = team.main;
}

// ================= 응원팀 선택 =================
function renderPicker() {
  const grid = $("team-grid");
  grid.innerHTML = "";
  TEAMS.forEach((t) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "team-card";
    btn.type = "button";
    btn.style.setProperty("--c", t.main);
    btn.style.setProperty("--c2", t.sub);
    btn.setAttribute("aria-pressed", String(t.id === pickedId));
    btn.innerHTML = `<span class="team-dot">${t.short}</span>
      <span class="team-name">${t.name}<span class="team-city">${t.stadium}</span></span>`;
    btn.addEventListener("click", () => {
      pickedId = t.id;
      applyTheme(t); // 고르는 순간 미리보기
      renderPicker();
      $("picker-confirm").disabled = false;
      $("picker-confirm").textContent = `${t.short}(으)로 ${myTeamId ? "변경" : "시작"}`;
    });
    li.appendChild(btn);
    grid.appendChild(li);
  });
}

function showPicker(isChange) {
  pickedId = isChange ? myTeamId : null;
  $("picker-title").textContent = isChange ? "응원팀 변경" : "응원하는 팀을 골라 주세요";
  $("picker-cancel").hidden = !isChange;
  $("picker-confirm").disabled = !pickedId;
  $("picker-confirm").textContent = isChange ? "이 팀으로 변경" : "이 팀으로 시작";
  renderPicker();
  $("home").hidden = true;
  $("picker").hidden = false;
  window.scrollTo(0, 0);
}

$("picker-confirm").addEventListener("click", () => {
  if (!pickedId) return;
  myTeamId = pickedId;
  store.set(KEY_TEAM, myTeamId);
  showHome();
});
$("picker-cancel").addEventListener("click", showHome);

// ================= 메인 =================
function resultOf(r) {
  if (r.myScore > r.oppScore) return "win";
  if (r.myScore < r.oppScore) return "lose";
  return "draw";
}
const RESULT_LABEL = { win: "승", lose: "패", draw: "무" };

function showHome() {
  const team = teamById(myTeamId);
  applyTheme(team);
  $("hero-badge").textContent = team.short;
  $("hero-team").textContent = team.name;
  renderHome();
  $("picker").hidden = true;
  $("home").hidden = false;
}

function renderHome() {
  const list = myRecords().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  renderStats(list);
  renderFairy(list);
  renderSplits(list);
  renderSeasonOptions(list);
  renderSeason(list);
  renderMvp(list);
  renderRecordList(list);
}

// 승/패/무 집계 + 승률(무승부 제외)
function tally(list) {
  let w = 0, l = 0, d = 0;
  list.forEach((r) => { const res = resultOf(r); if (res === "win") w++; else if (res === "lose") l++; else d++; });
  return { g: list.length, w, l, d, rate: w + l ? w / (w + l) : null };
}
const fmtRate = (rate) => (rate == null ? "-" : rate.toFixed(3).replace(/^0/, ""));
const fmtWL = (t) => `${t.w}승 ${t.l}패${t.d ? ` ${t.d}무` : ""}`;

// ================= 승리요정 / 패배요정 =================
const FAIRY_MIN = 3; // 승패가 난 경기 3경기부터 판정
function fairyOf(list) {
  const t = tally(list);
  const decided = t.w + t.l;
  if (decided < FAIRY_MIN) {
    return { kind: "pending", icon: "🥚", title: "요정 판정 중", desc: `승패가 난 직관 ${FAIRY_MIN - decided}경기 더 가면 판정돼요` };
  }
  if (t.rate >= 0.6) return { kind: "win", icon: "🧚", title: "승리요정", desc: "내가 가면 이긴다! 직관 필수 인원" };
  if (t.rate <= 0.4) return { kind: "lose", icon: "🌧️", title: "패배요정", desc: "…그래도 응원은 계속된다" };
  return { kind: "even", icon: "⚖️", title: "반반요정", desc: "이길 때도 질 때도 함께하는 찐팬" };
}
function fairyBadgeHTML(f) {
  return `<span class="fairy fairy-${f.kind}"><span class="fairy-icon" aria-hidden="true">${f.icon}</span>${f.title}</span>`;
}
function renderFairy(list) {
  const f = fairyOf(list);
  $("hero-fairy").innerHTML = `${fairyBadgeHTML(f)}<span class="fairy-desc">${f.desc}</span>`;
}

// ================= 상대팀별 / 경기장별 전적 =================
let splitMode = "opponent";
function splitRows(list, mode) {
  const groups = new Map();
  list.forEach((r) => {
    const key = mode === "opponent" ? (teamById(r.opponent)?.name || r.opponent) : r.stadium;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  return [...groups].map(([name, rs]) => ({ name, ...tally(rs) }))
    .sort((a, b) => b.g - a.g || (b.rate ?? -1) - (a.rate ?? -1) || a.name.localeCompare(b.name));
}
function renderSplits(list) {
  const rows = splitRows(list, splitMode);
  document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === splitMode)));
  $("split-empty").hidden = rows.length > 0;
  $("split-body").hidden = rows.length === 0;

  // 막대그래프: 막대 길이 = 승률, 가운데 점선 = 5할
  $("split-chart").innerHTML = rows.map((r) => `
    <li class="bar-row" title="${esc(r.name)} · ${r.g}경기 ${fmtWL(r)} · 승률 ${fmtRate(r.rate)}">
      <span class="bar-label">${esc(r.name)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${r.rate == null ? 0 : Math.max(r.rate * 100, 2)}%"></span></span>
      <span class="bar-value"><strong>${fmtRate(r.rate)}</strong> ${fmtWL(r)}</span>
    </li>`).join("");

  // 표
  $("split-table-head").textContent = splitMode === "opponent" ? "상대팀" : "경기장";
  $("split-table").innerHTML = rows.map((r) => `
    <tr><th scope="row">${esc(r.name)}</th><td>${r.g}</td><td>${r.w}</td><td>${r.l}</td><td>${r.d}</td><td><strong>${fmtRate(r.rate)}</strong></td></tr>`).join("");
}
document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
  splitMode = b.dataset.mode;
  renderSplits(myRecords());
}));

// ================= 시즌 결산 카드 =================
let seasonYear = null;
const yearsOf = (list) => [...new Set(list.map((r) => r.date.slice(0, 4)))].sort().reverse();

function renderSeasonOptions(list) {
  const years = yearsOf(list);
  if (!years.includes(seasonYear)) seasonYear = years[0] || null;
  const sel = $("season-select");
  sel.innerHTML = years.map((y) => `<option value="${y}">${y} 시즌</option>`).join("");
  sel.value = seasonYear || "";
  sel.hidden = years.length < 2;
}
$("season-select").addEventListener("change", (e) => { seasonYear = e.target.value; renderSeason(myRecords()); });

function topOf(values) {
  const m = new Map();
  values.filter(Boolean).forEach((v) => m.set(v, (m.get(v) || 0) + 1));
  let best = null;
  m.forEach((n, v) => { if (!best || n > best.n) best = { v, n }; });
  return best;
}
function longestWinStreak(list) {
  let best = 0, cur = 0;
  [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).forEach((r) => {
    if (resultOf(r) === "win") best = Math.max(best, ++cur); else if (resultOf(r) === "lose") cur = 0;
  });
  return best;
}

function renderSeason(all) {
  const list = all.filter((r) => r.date.startsWith(seasonYear));
  $("season-empty").hidden = list.length > 0;
  $("season-card").hidden = list.length === 0;
  if (!list.length) return;

  const team = teamById(myTeamId);
  const t = tally(list);
  const f = fairyOf(list);
  const spend = list.reduce((s, r) => s + sumExpenses(r), 0);
  const stadium = topOf(list.map((r) => r.stadium));
  const mvp = mvpCounts(list)[0];
  const mate = topOf(list.flatMap((r) => r.companions || []));
  const foods = list.reduce((s, r) => s + (r.foodPhotos?.length || 0), 0);
  const streak = longestWinStreak(list);
  const bestOpp = splitRows(list, "opponent").filter((r) => r.w > 0).sort((a, b) => b.w - a.w || (b.rate ?? 0) - (a.rate ?? 0))[0];

  const item = (label, value, sub = "") => `<div class="season-item"><span>${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ""}</div>`;
  $("season-card").innerHTML = `
    <div class="season-top">
      <div>
        <p class="season-year">${seasonYear} 시즌 결산</p>
        <p class="season-team">${team.name}</p>
      </div>
      ${fairyBadgeHTML(f)}
    </div>
    <div class="season-hero">
      <div><span>직관 승률</span><strong>${fmtRate(t.rate)}</strong></div>
      <div><span>${t.g}경기</span><strong>${fmtWL(t)}</strong></div>
    </div>
    <div class="season-grid">
      ${item("시즌 MVP", mvp ? esc(mvp.name) : "-", mvp ? `${mvp.count}회 선정` : "")}
      ${item("최다 방문 구장", stadium ? esc(stadium.v) : "-", stadium ? `${stadium.n}회` : "")}
      ${item("천적 잡은 상대", bestOpp ? esc(bestOpp.name) : "-", bestOpp ? `${bestOpp.w}승` : "")}
      ${item("최장 직관 연승", streak ? `${streak}연승` : "-")}
      ${item("직관 메이트", mate ? esc(mate.v) : "-", mate ? `${mate.n}번 함께` : "")}
      ${item("야구푸드", foods ? `${foods}장` : "-", foods ? "사진 기록" : "")}
      ${item("총 지출", won(spend))}
      ${item("경기당 평균", won(Math.round(spend / t.g)))}
    </div>`;
}

// 직관 승률: 무승부 제외, 승 / (승 + 패) — 기록할 때마다 다시 계산
function renderStats(list) {
  const t = tally(list);
  $("stat-games").textContent = t.g;
  $("stat-record").textContent = fmtWL(t);
  $("stat-rate").textContent = fmtRate(t.rate);
  $("stat-spend").textContent = won(list.reduce((s, r) => s + sumExpenses(r), 0));
}

function mvpCounts(list) {
  const m = new Map();
  list.forEach((r) => {
    const name = (r.mvp || "").trim();
    if (!name) return;
    const cur = m.get(name) || { name, count: 0, wins: 0 };
    cur.count++;
    if (resultOf(r) === "win") cur.wins++;
    m.set(name, cur);
  });
  return [...m.values()].sort((a, b) => b.count - a.count || b.wins - a.wins || a.name.localeCompare(b.name));
}

function renderMvp(list) {
  const ranking = mvpCounts(list);
  const ol = $("mvp-list");
  ol.innerHTML = "";
  const max = ranking[0]?.count || 1;
  ranking.slice(0, 5).forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "mvp-row" + (i === 0 ? " top" : "");
    li.innerHTML = `<span class="mvp-rank">${i + 1}</span>
      <span class="mvp-name">${esc(p.name)}</span>
      <span class="mvp-bar"><span style="width:${(p.count / max) * 100}%"></span></span>
      <span class="mvp-count">${p.count}회</span>`;
    ol.appendChild(li);
  });
  $("mvp-empty").hidden = ranking.length > 0;
}

function renderRecordList(list) {
  const ul = $("record-list");
  ul.innerHTML = "";
  list.forEach((r) => {
    const res = resultOf(r);
    const opp = teamById(r.opponent);
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "record";
    const tags = [
      r.mvp && `MVP ${esc(r.mvp)}`,
      r.companions?.length && `함께 ${r.companions.length}명`,
      (r.gamePhotos?.length || 0) + (r.foodPhotos?.length || 0) && `사진 ${(r.gamePhotos?.length || 0) + (r.foodPhotos?.length || 0)}`,
      sumExpenses(r) && won(sumExpenses(r)),
    ].filter(Boolean);
    btn.innerHTML = `
      <span class="result ${res}">${RESULT_LABEL[res]}</span>
      <span class="record-main">
        <span class="record-title">vs ${esc(opp ? opp.name : r.opponent)}</span>
        <span class="record-meta">${r.date.replaceAll("-", ".")} · ${esc(r.stadium)}</span>
        ${tags.length ? `<span class="record-tags">${tags.map((t) => `<span>${t}</span>`).join("")}</span>` : ""}
      </span>
      <span class="record-score">${r.myScore} : ${r.oppScore}</span>`;
    btn.addEventListener("click", () => openDetail(r.id));
    li.appendChild(btn);
    ul.appendChild(li);
  });
  $("empty").hidden = list.length > 0;
}

// ================= 기록 추가 폼 =================
let pending = { game: [], food: [] }; // 아직 저장 안 된 사진 {id, blob, url}
let companions = [];

function fillFormOptions() {
  const team = teamById(myTeamId);

  // 상대팀: 내 팀 제외
  const opp = $("opponent-select");
  opp.innerHTML = '<option value="" disabled selected>상대팀 선택</option>';
  TEAMS.filter((t) => t.id !== myTeamId).forEach((t) => opp.add(new Option(t.name, t.id)));

  // 경기장: 10개 구단 홈구장(잠실 중복 제거) + 직접 입력
  const st = $("stadium-select");
  st.innerHTML = "";
  [...new Set(TEAMS.map((t) => t.stadium))].forEach((s) => st.add(new Option(s, s)));
  st.add(new Option("기타 구장 (직접 입력)", CUSTOM));
  st.value = team.stadium;
  $("custom-stadium-wrap").hidden = true;
  $("custom-stadium").required = false;

  $("my-team-head").textContent = team.short;
  $("opp-team-head").textContent = "상대팀";

  // 이전에 입력한 MVP / 함께 간 사람 자동완성
  const fill = (id, values) => {
    $(id).innerHTML = "";
    [...new Set(values)].forEach((v) => $(id).appendChild(new Option(v)));
  };
  fill("mvp-suggest", mvpCounts(myRecords()).map((p) => p.name));
  fill("companion-suggest", records.flatMap((r) => r.companions || []));
}

$("stadium-select").addEventListener("change", (e) => {
  const custom = e.target.value === CUSTOM;
  $("custom-stadium-wrap").hidden = !custom;
  $("custom-stadium").required = custom;
  if (custom) $("custom-stadium").focus();
});
$("opponent-select").addEventListener("change", (e) => {
  $("opp-team-head").textContent = teamById(e.target.value)?.short || "상대팀";
});

// --- 함께 간 사람 ---
function renderCompanions() {
  const box = $("companion-chips");
  box.innerHTML = "";
  companions.forEach((name, i) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `${esc(name)}<button type="button" aria-label="${esc(name)} 삭제">×</button>`;
    chip.querySelector("button").addEventListener("click", () => { companions.splice(i, 1); renderCompanions(); });
    box.appendChild(chip);
  });
}
function addCompanion() {
  const input = $("companion-input");
  input.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean).forEach((name) => {
    if (!companions.includes(name)) companions.push(name);
  });
  input.value = "";
  renderCompanions();
  input.focus();
}
$("companion-add").addEventListener("click", addCompanion);
$("companion-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addCompanion(); }
});

// --- 사진 ---
function renderThumbs(kind) {
  const box = $(kind === "game" ? "game-thumbs" : "food-thumbs");
  box.innerHTML = "";
  pending[kind].forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "thumb";
    d.innerHTML = `<img src="${p.url}" alt=""><button type="button" aria-label="사진 삭제">×</button>`;
    d.querySelector("button").addEventListener("click", () => {
      URL.revokeObjectURL(p.url);
      pending[kind].splice(i, 1);
      renderThumbs(kind);
    });
    box.appendChild(d);
  });
}
async function onPhotos(kind, input) {
  const files = [...input.files];
  input.value = "";
  for (const f of files) {
    const blob = await compress(f);
    pending[kind].push({ id: uid(), blob, url: URL.createObjectURL(blob) });
    renderThumbs(kind);
  }
}
$("game-photos").addEventListener("change", (e) => onPhotos("game", e.target));
$("food-photos").addEventListener("change", (e) => onPhotos("food", e.target));

// --- 쓴 금액 ---
function addExpenseRow(type = "티켓", amount = "") {
  const row = document.createElement("div");
  row.className = "expense-row";
  row.innerHTML = `
    <select aria-label="항목">${EXPENSE_TYPES.map((t) => `<option${t === type ? " selected" : ""}>${t}</option>`).join("")}</select>
    <input type="number" min="0" step="100" inputmode="numeric" placeholder="금액" aria-label="금액" value="${amount}">
    <button type="button" class="row-del" aria-label="항목 삭제">×</button>`;
  row.querySelector("input").addEventListener("input", updateExpenseTotal);
  row.querySelector(".row-del").addEventListener("click", () => { row.remove(); updateExpenseTotal(); });
  $("expense-rows").appendChild(row);
}
function readExpenses() {
  return [...document.querySelectorAll(".expense-row")]
    .map((row) => ({ type: row.querySelector("select").value, amount: Number(row.querySelector("input").value) || 0 }))
    .filter((e) => e.amount > 0);
}
function updateExpenseTotal() {
  $("expense-total").textContent = won(readExpenses().reduce((s, e) => s + e.amount, 0));
}
$("expense-add").addEventListener("click", () => addExpenseRow("음식"));

// --- 열기 / 닫기 / 저장 ---
function clearPending() {
  [...pending.game, ...pending.food].forEach((p) => URL.revokeObjectURL(p.url));
  pending = { game: [], food: [] };
}

$("open-form").addEventListener("click", () => {
  const f = $("record-form");
  f.reset();
  clearPending();
  companions = [];
  fillFormOptions();
  renderCompanions();
  renderThumbs("game");
  renderThumbs("food");
  $("expense-rows").innerHTML = "";
  addExpenseRow("티켓");
  updateExpenseTotal();
  const now = new Date();
  f.date.value = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $("form-dialog").showModal();
  f.scrollTop = 0;
});
$("form-cancel").addEventListener("click", () => { clearPending(); $("form-dialog").close(); });

$("record-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const stadium = f.stadium.value === CUSTOM ? f.customStadium.value.trim() : f.stadium.value;
  if (!stadium) { f.customStadium.focus(); return; }
  if ($("companion-input").value.trim()) addCompanion(); // 추가 버튼 안 누른 이름도 포함

  $("form-save").disabled = true;
  try {
    for (const p of [...pending.game, ...pending.food]) await photoDB.put(p.id, p.blob);
  } catch {
    alert("사진을 저장하지 못했어요. 사진 없이 저장할게요.");
    pending = { game: [], food: [] };
  }
  records.push({
    id: uid(),
    team: myTeamId,
    date: f.date.value,
    opponent: f.opponent.value,
    stadium,
    myScore: Number(f.myScore.value),
    oppScore: Number(f.oppScore.value),
    myPitcher: f.myPitcher.value.trim(),
    oppPitcher: f.oppPitcher.value.trim(),
    mvp: f.mvp.value.trim(),
    companions: [...companions],
    gamePhotos: pending.game.map((p) => p.id),
    foodPhotos: pending.food.map((p) => p.id),
    foodNote: f.foodNote.value.trim(),
    expenses: readExpenses(),
    memo: f.memo.value.trim(),
  });
  store.set(KEY_RECORDS, records);
  clearPending();
  $("form-save").disabled = false;
  $("form-dialog").close();
  renderHome();
});

// ================= 기록 상세 =================
let detailUrls = [];

async function openDetail(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  const team = teamById(r.team) || teamById(myTeamId);
  const opp = teamById(r.opponent);
  const res = resultOf(r);
  const total = sumExpenses(r);

  const photoGrid = (ids, cls) => ids?.length
    ? `<div class="photo-grid ${cls}">${ids.map((pid) => `<button type="button" class="photo" data-pid="${pid}"></button>`).join("")}</div>` : "";
  const section = (title, body) => body ? `<section class="detail-sec"><h3>${title}</h3>${body}</section>` : "";

  $("detail").innerHTML = `
    <div class="detail-head">
      <p class="muted">${r.date.replaceAll("-", ".")} · ${esc(r.stadium)}</p>
      <div class="scoreboard">
        <div><span>${team.short}</span><strong>${r.myScore}</strong>${r.myPitcher ? `<small>선발 ${esc(r.myPitcher)}</small>` : ""}</div>
        <span class="result ${res}">${RESULT_LABEL[res]}</span>
        <div><span>${esc(opp ? opp.short : r.opponent)}</span><strong>${r.oppScore}</strong>${r.oppPitcher ? `<small>선발 ${esc(r.oppPitcher)}</small>` : ""}</div>
      </div>
    </div>
    ${section("내가 뽑은 MVP", r.mvp && `<p class="mvp-pick">🏅 ${esc(r.mvp)}</p>`)}
    ${section("함께 간 사람", r.companions?.length && `<div class="chips">${r.companions.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>`)}
    ${section("직관 사진", photoGrid(r.gamePhotos, ""))}
    ${section("오늘의 야구푸드", (photoGrid(r.foodPhotos, "") + (r.foodNote ? `<p>${esc(r.foodNote)}</p>` : "")) || "")}
    ${section("쓴 금액", total && `<ul class="expense-list">${r.expenses.map((e) => `<li><span>${e.type}</span><span>${won(e.amount)}</span></li>`).join("")}
      <li class="total"><span>합계</span><span>${won(total)}</span></li></ul>`)}
    ${section("메모", r.memo && `<p class="memo">${esc(r.memo)}</p>`)}
    <div class="dialog-actions">
      <button type="button" class="btn ghost danger" id="detail-delete">삭제</button>
      <button type="button" class="btn primary" id="detail-close">닫기</button>
    </div>`;

  $("detail-close").addEventListener("click", () => $("detail-dialog").close());
  $("detail-delete").addEventListener("click", async () => {
    if (!confirm("이 기록을 삭제할까요? 사진도 함께 지워져요.")) return;
    for (const pid of [...(r.gamePhotos || []), ...(r.foodPhotos || [])]) await photoDB.del(pid).catch(() => {});
    records = records.filter((x) => x.id !== r.id);
    store.set(KEY_RECORDS, records);
    $("detail-dialog").close();
    renderHome();
  });

  $("detail-dialog").showModal();
  $("detail-dialog").scrollTop = 0;

  // 사진 불러오기
  for (const el of $("detail").querySelectorAll(".photo")) {
    const blob = await photoDB.get(el.dataset.pid).catch(() => null);
    if (!blob) { el.classList.add("missing"); continue; }
    const url = URL.createObjectURL(blob);
    detailUrls.push(url);
    el.style.backgroundImage = `url("${url}")`;
    el.addEventListener("click", () => { $("photo-large").src = url; $("photo-dialog").showModal(); });
  }
}
$("detail-dialog").addEventListener("close", () => {
  detailUrls.forEach((u) => URL.revokeObjectURL(u));
  detailUrls = [];
});
$("photo-dialog").addEventListener("click", () => $("photo-dialog").close());

// ================= 설정 =================
$("open-settings").addEventListener("click", () => {
  $("settings-team").textContent = teamById(myTeamId).name;
  $("settings-dialog").showModal();
});
$("settings-close").addEventListener("click", () => $("settings-dialog").close());
$("change-team").addEventListener("click", () => {
  $("settings-dialog").close();
  showPicker(true);
});

// 바깥(배경) 누르면 닫기
document.querySelectorAll("dialog:not(.photo-dialog)").forEach((d) =>
  d.addEventListener("click", (e) => { if (e.target === d && d.id !== "form-dialog") d.close(); })
);

// ================= 시작 =================
// 기록은 저장 버튼을 누르는 순간 브라우저에 자동 저장되고, 새로고침해도 남아 있어요.
// 브라우저가 저장 공간이 부족할 때 데이터를 임의로 지우지 않도록 '영구 보관'을 요청해요.
navigator.storage?.persist?.().catch(() => {});

if (myTeamId && teamById(myTeamId)) showHome();
else showPicker(false);
