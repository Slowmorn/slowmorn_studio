/* 모두핏 화면 — 수납장 치수, 추천, 수납함 목록, 후보 수납함, 저장을 묶어요.
   배치(무엇을 어디에)는 여기 state 가 정답이고, 3D 는 scene.js 가 그대로 그립니다. */
import { createScene } from "./scene.js";
import { sizeOf, findSpot, fits, restY, settle, whyNot, fitsEmpty, maxCount, fmt } from "./pack.js";
import { recommend } from "./recommend.js";

const KEY = "fit:v1";
const OLD_KEY = "ruler:v1";   // 이름이 '룰러'이던 때의 저장 자리. 새 자리가 비어 있으면 거기서 읽어요
const BRANDS = { ikea: "이케아", daiso: "다이소", muji: "무인양품" };
const $ = id => document.getElementById(id);
const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const won = n => (n || 0).toLocaleString("ko-KR") + "원";

/* 상품 사진 네모. 사진은 판매처 서버의 작은 이미지를 그대로 불러요.
   못 불러오면 사진을 감추고 상품 색 바탕만 남겨요 */
const thumb = it => `<span class="item-thumb" style="background:${esc(it.color || "#ddd")}" aria-hidden="true">${
  it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span>`;

/* ---- 저장 (이 브라우저에만) ----
   { cabinets: [{ id, name, w, d, h, type, candidates, placed: [{ id, x, y, z, rot }] }], active, recMode }
   수납장마다 치수·종류·후보·배치를 따로 가져요. 수납장 하나짜리 예전 저장본도 그대로 읽어요 */
function load(){
  try { return JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY)); } catch(e){ return null; }
}
const cabId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const blankCabinet = (name, from) => ({
  id: cabId(), name, w: 60, d: 40, h: 30, type: "shelf",
  ...(from && { w: from.w, d: from.d, h: from.h, type: from.type }),
  candidates: [], placed: [],
});

// 새 수납장 이름: 수납장1, 수납장2 … 가운데 아직 안 쓴 가장 작은 번호
function nextName(){
  const used = new Set(state.cabinets.map(c => c.name));
  let n = 1;
  while(used.has(`수납장${n}`)) n++;
  return `수납장${n}`;
}

// 지금 보고 있는 수납장(state.cabinet · candidates · placed)을 목록에 적어 둬요.
// 수납장을 다 지운 빈 상태에서는 적을 게 없어요
function stash(){
  if(state.empty) return;
  const i = state.cabinets.findIndex(c => c.id === state.cabinet.id);
  const record = {
    ...state.cabinet,
    candidates: state.candidates.slice(),
    placed: state.placed.map(({ id, x, y, z, rot }) => ({ id, x, y, z, rot })),
  };
  if(i < 0) state.cabinets.push(record); else state.cabinets[i] = record;
}
/* 되돌리기(Ctrl+Z · ⌘Z)와 다시 하기(Ctrl+Shift+Z · Ctrl+Y)
   저장할 때마다 바로 앞의 모습을 쌓아 두고, 되돌릴 때는 그 모습 전체(모든 수납장)를 다시 펼쳐요.
   이름을 한 글자씩 적는 것은 한 번으로 묶어요 */
const timeline = { past: [], future: [], last: null, lastKind: null, restoring: false };
const HISTORY_MAX = 80;

function save(kind){
  stash();
  const json = JSON.stringify({ cabinets: state.cabinets, active: state.empty ? null : state.cabinet.id, recMode: state.recMode });
  if(json !== timeline.last){
    if(timeline.last !== null && !timeline.restoring && !(kind === "name" && timeline.lastKind === "name")){
      timeline.past.push(timeline.last);
      if(timeline.past.length > HISTORY_MAX) timeline.past.shift();
      timeline.future = [];
    }
    timeline.last = json;
    timeline.lastKind = kind || null;
  }
  try { localStorage.setItem(KEY, json); } catch(e){}
}

function travel(from, to, done, none){
  if(!from.length){ toast(none); return; }
  to.push(timeline.last);
  const data = JSON.parse(from.pop());
  timeline.restoring = true;
  state.cabinets = data.cabinets;
  state.recMode = data.recMode || state.recMode;
  if(state.cabinets.length) openCabinet(state.cabinets.find(c => c.id === data.active) || state.cabinets[0]);
  else showEmpty();
  timeline.restoring = false;
  timeline.lastKind = null;
  toast(done);
}
const undo = () => travel(timeline.past, timeline.future, "되돌렸어요", "더 되돌릴 게 없어요");
const redo = () => travel(timeline.future, timeline.past, "다시 했어요", "다시 할 게 없어요");

const saved = load();
// 처음이면 '수납장1' 하나로 시작해요. 수납장을 다 지워 둔 저장본이면 빈 상태로 열어요
const savedCabinets = saved && Array.isArray(saved.cabinets) ? saved.cabinets
  : [{ ...blankCabinet("수납장1"), ...(saved && saved.cabinet), candidates: (saved && saved.candidates) || [], placed: (saved && saved.placed) || [] }];
const firstCab = savedCabinets.find(c => c.id === (saved && saved.active)) || savedCabinets[0] || blankCabinet("수납장1");
const state = {
  cabinets: savedCabinets,    // 모든 수납장 (지금 것은 save 할 때 다시 적어요)
  cabinet: null,              // 지금 수납장 { id, name, w, d, h, type }  type: shelf 선반 · drawer 서랍
  placed: [],                 // 지금 수납장에 넣은 상자 [{uid, id, item, x, y, z, rot}]
  candidates: [],             // 지금 수납장의 후보 상품 id (담은 순서). 0개여도 남아요
  naming: null,               // 수납장 이름을 적는 중: { id } (고치기) 또는 { id: null } (새로 추가)
  empty: !savedCabinets.length,   // 수납장이 하나도 없는 상태 ('수납장을 추가해 주세요'만 보여요)
  brand: "all", fitOnly: true, sort: "fit",
  recOpen: false,             // 추천 칸을 펼쳤는지. 처음에 수납장이 비어 있으면 펼쳐요
  recMode: (saved && saved.recMode) || "one",   // one 한 종류 · two 같은 제품군 두 크기
  recApplied: null,           // 지금 수납장에 들어가 있는 추천 (그 카드에 '넣음' 표시)
};
let items = [], byId = new Map(), uidSeq = 0;
const uid = () => "b" + (++uidSeq);

{ const { candidates, placed, ...cab } = firstCab; state.cabinet = cab; }

// ---- 3D ----
const view = createScene($("stage"), {
  onSelect: uid => renderTools(uid),
  onMove(uid, pos, ok){
    const e = state.placed.find(p => p.uid === uid);
    if(!e) return;
    Object.assign(e, pos);
    if(!ok) toast("놓을 수 없는 자리라 제자리로 돌려놨어요");
    commit();
  },
  onRemove: uid => removeBox(uid),
});

const boxOf = e => ({ x: e.x, y: e.y, z: e.z, ...sizeOf(e.item, e.rot), stackable: e.item.stackable });

/* 바뀔 때마다: 떠 있는 상자 내리기 → 3D 다시 그리기 → 숫자·목록 → 저장
   enter 는 새로 들어오는 상자 uid (하나 또는 Set). 추천을 넣을 때만 keepRec 으로 '넣음' 표시를 남겨요 */
function commit(enter, keepRec){
  if(!keepRec) state.recApplied = null;
  const boxes = state.placed.map(e => Object.assign(boxOf(e), { e }));
  settle(boxes).forEach(b => { b.e.y = b.y; });
  view.sync(state.placed, { enter });
  renderTools(view.selected);
  renderSummary();
  renderRec();
  renderList();
  renderCandidates();
  save();
}

// ---- 넣기 · 빼기 · 돌리기 ----
// 목록에서 누르면 후보에 담고 한 개를 넣어 봐요. 자리가 없으면 0개로 후보에만 남아요
function pickItem(id){
  const isNew = !state.candidates.includes(id);
  if(isNew) state.candidates.push(id);
  if(!addItem(id) && isNew) commit();
}

function addItem(id){
  const item = byId.get(id);
  const spot = findSpot(item, state.placed.map(boxOf), state.cabinet);
  if(!spot){ toast(`${item.name} — ${whyNot(item, state.cabinet)}`); return false; }
  const e = { uid: uid(), id, item, ...spot };
  state.placed.push(e);
  commit(e.uid);
  view.select(e.uid);
  return true;
}

// 후보에서 한 개 빼기 — 같은 상품 중 맨 위에 있는 것(나중에 넣은 것)부터 빼요
function dropOne(id){
  const same = state.placed.filter(p => p.id === id);
  if(!same.length) return;
  const top = same.reduce((a, b) => (b.y > a.y || (b.y === a.y && state.placed.indexOf(b) > state.placed.indexOf(a))) ? b : a);
  removeBox(top.uid);
}

// 후보에서 아예 지우면 수납장에 넣은 것도 같이 빠져요
function forget(id){
  state.candidates = state.candidates.filter(c => c !== id);
  state.placed = state.placed.filter(p => p.id !== id);
  commit();
}

function removeBox(uid){
  state.placed = state.placed.filter(p => p.uid !== uid);
  commit();
}

function rotateBox(uid){
  const e = state.placed.find(p => p.uid === uid);
  if(!e || e.item.w === e.item.d) return;
  const others = state.placed.filter(p => p !== e).map(boxOf);
  const box = { x: e.x, z: e.z, ...sizeOf(e.item, e.rot ? 0 : 1) };
  // 오른쪽·안쪽 벽에 걸리면 벽 안쪽으로 당겨 봐요
  box.x = Math.min(box.x, state.cabinet.w - box.w);
  box.z = Math.min(box.z, state.cabinet.d - box.d);
  const y = restY(box, others);
  if(box.x < 0 || box.z < 0 || y == null || !fits({ ...box, y }, others, state.cabinet)){
    toast("돌릴 자리가 없어요");
    return;
  }
  Object.assign(e, { x: box.x, z: box.z, y, rot: e.rot ? 0 : 1 });
  commit();
}

/* 수납장 치수를 바꾸면, 그대로 들어가는 상자는 두고
   벽 밖으로 나간 상자는 빈자리를 다시 찾아 넣어요. 그래도 안 되면 빼요 */
function setCabinet(next){
  state.cabinet = { ...state.cabinet, ...next };
  view.setCabinet(state.cabinet);
  const kept = [], again = [];
  for(const e of state.placed){
    if(fits(boxOf(e), kept.map(boxOf), state.cabinet)) kept.push(e); else again.push(e);
  }
  let dropped = 0;
  for(const e of again){
    const spot = findSpot(e.item, kept.map(boxOf), state.cabinet);
    if(spot){ Object.assign(e, spot); kept.push(e); } else dropped++;
  }
  state.placed = kept;
  if(dropped) toast(`${dropped}개는 자리가 없어 뺐어요`);
  commit();
}

// ---- 요약 카드 ----
function renderSummary(){
  const c = state.cabinet;
  const vol = state.placed.reduce((s, e) => s + e.item.w * e.item.d * e.item.h, 0);
  const pct = c.w * c.d * c.h ? vol / (c.w * c.d * c.h) * 100 : 0;
  $("tFill").textContent = Math.round(pct) + "%";
  $("fillBar").style.width = Math.min(100, pct) + "%";
  $("tCount").textContent = state.placed.length + "개";
  $("tPrice").textContent = won(state.placed.reduce((s, e) => s + (e.item.price || 0), 0));
  const top = state.placed.reduce((m, e) => Math.max(m, e.y + e.item.h), 0);
  $("tHeadroom").textContent = state.placed.length ? `위로 ${fmt(c.h - top)}cm 남음` : "비어 있어요";
}

// ---- 수납함 목록 ----
function renderList(){
  const cab = state.cabinet;
  const rows = items
    .filter(it => state.brand === "all" || it.brand === state.brand)
    .map(it => ({ it, ok: fitsEmpty(it, cab), now: !!findSpot(it, state.placed.map(boxOf), cab) }))
    .filter(r => !state.fitOnly || r.ok);
  const by = {
    // 지금 남은 자리로 정렬하면 담을 때마다 줄이 움직여요. 빈 수납장 기준으로만 정렬해 자리를 지켜요
    fit: (a, b) => (b.ok - a.ok) || (b.it.w * b.it.d * b.it.h - a.it.w * a.it.d * a.it.h),
    price: (a, b) => (a.it.price || 0) - (b.it.price || 0),
    small: (a, b) => a.it.w * a.it.d * a.it.h - b.it.w * b.it.d * b.it.h,
  }[state.sort];
  rows.sort(by);
  $("listCount").textContent = rows.length + "개";
  const counts = new Map();
  for(const e of state.placed) counts.set(e.id, (counts.get(e.id) || 0) + 1);
  $("itemList").innerHTML = rows.length ? rows.map(({ it, ok, now }) => {
    const n = ok ? maxCount(it, cab) : 0;
    const picked = state.candidates.includes(it.id);
    const note = !ok ? whyNot(it, cab) : picked ? `담음 · ${counts.get(it.id) || 0}개 넣음` : now ? `빈 수납장에 ${n}개` : "지금은 자리가 없어요";
    return `<li><button type="button" class="item${picked ? " picked" : ""}" data-id="${esc(it.id)}" data-brand="${esc(it.brand)}" ${ok ? "" : 'aria-disabled="true"'} ${picked ? 'aria-pressed="true"' : ""}>
      ${thumb(it)}
      <span class="item-main">
        <span class="item-brand"><span class="brand-dot" aria-hidden="true"></span>${BRANDS[it.brand] || esc(it.brand)}</span>
        <span class="item-name">${esc(it.name)}</span>
        <span class="item-size">${fmt(it.w)} × ${fmt(it.d)} × ${fmt(it.h)}cm</span>
      </span>
      <span class="item-side">
        <span class="item-price">${it.price ? won(it.price) : ""}</span>
        <span class="item-note ${(ok && now) || picked ? "" : "muted"}">${note}</span>
      </span>
      <span class="item-add" aria-hidden="true">${!ok ? "" : state.candidates.includes(it.id) ? (now ? "+1" : "") : "담기"}</span>
    </button></li>`;
  }).join("") : `<li class="empty">${state.fitOnly ? "이 크기에 들어가는 수납함이 없어요. '모두 보기'로 바꿔 보세요." : "수납함이 없어요."}</li>`;
}

// ---- 후보 수납함 ----
function renderCandidates(){
  const counts = new Map();
  for(const e of state.placed) counts.set(e.id, (counts.get(e.id) || 0) + 1);
  const boxes = state.placed.map(boxOf);
  const list = state.candidates.map(id => byId.get(id)).filter(Boolean);
  $("candCount").textContent = list.length ? list.length + "개" : "";
  $("clearBtn").hidden = !state.candidates.length;
  $("candList").innerHTML = list.length ? list.map(item => {
    const n = counts.get(item.id) || 0;
    const room = !!findSpot(item, boxes, state.cabinet);
    return `<li class="cand${n ? "" : " zero"}" data-id="${esc(item.id)}" data-brand="${esc(item.brand)}">
      ${thumb(item)}
      <span class="item-main">
        <span class="item-brand"><span class="brand-dot" aria-hidden="true"></span>${BRANDS[item.brand] || esc(item.brand)}</span>
        <span class="item-name">${esc(item.name)}</span>
        <span class="item-size">${fmt(item.w)} × ${fmt(item.d)} × ${fmt(item.h)}cm${item.price ? ` · 개당 ${won(item.price)}` : ""}</span>
      </span>
      <span class="stepper" role="group" aria-label="${esc(item.name)} 개수">
        <button type="button" data-step="-1" aria-label="한 개 빼기" ${n ? "" : "disabled"}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
        <output aria-live="polite">${n}</output>
        <button type="button" data-step="1" aria-label="한 개 더 넣기" title="${room ? "한 개 더 넣기" : esc(whyNot(item, state.cabinet))}" ${room ? "" : 'aria-disabled="true"'}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
      </span>
      <span class="cand-side">
        <span class="cand-sum">${item.price ? won(item.price * n) : ""}</span>
        <span class="cand-links">${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">판매처</a>` : ""}<button type="button" class="cand-x" data-forget aria-label="후보에서 지우기" title="후보에서 지우기"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></span>
      </span>
    </li>`;
  }).join("") : `<li class="empty">아래 목록에서 수납함을 눌러 후보에 담아 보세요. 개수는 여기서 늘리고 줄여요.</li>`;
}

// ---- 추천 수납함 ----
const REC_HINT = {
  shelf: "앞에서 꺼내는 칸이에요. 쌓을 수 있는 함은 위로 쌓아요",
  drawer: "위에서 내려다보는 서랍이에요. 쌓지 않고 바닥에 한 층만 깔아요",
};
let recCache = { key: "", list: [] };
const recKey = () => { const c = state.cabinet; return `${c.w}x${c.d}x${c.h}|${c.type}|${state.recMode}`; };

function recs(){
  const key = recKey();
  if(recCache.key !== key) recCache = { key, list: recommend(items, state.cabinet, { type: state.cabinet.type, mode: state.recMode }) };
  return recCache.list;
}

function renderRec(){
  const open = state.recOpen && items.length;
  $("rec").hidden = !open;
  $("recBtn").setAttribute("aria-expanded", !!open);
  if(!open) return;
  $("rec").querySelectorAll("[data-type]").forEach(b => b.setAttribute("aria-pressed", b.dataset.type === state.cabinet.type));
  $("rec").querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === state.recMode));
  $("recHint").textContent = REC_HINT[state.cabinet.type];
  const list = recs();
  $("recList").innerHTML = list.length ? list.map((r, i) => {
    const on = state.recApplied === recKey() + "|" + r.family;
    return `<li><button type="button" class="rec-card${on ? " on" : ""}" data-i="${i}" ${on ? 'aria-pressed="true"' : ""}>
      <span class="rec-thumbs">${r.parts.map(p => thumb(p.item)).join("")}</span>
      <span class="rec-body">
        <span class="rec-name" data-brand="${esc(r.parts[0].item.brand)}"><span class="brand-dot" aria-hidden="true"></span>${esc(r.family)}</span>
        ${r.parts.map(p => `<span class="rec-part">${fmt(p.item.w)}×${fmt(p.item.d)}×${fmt(p.item.h)}cm <b>× ${p.n}</b></span>`).join("")}
        <span class="rec-why">${esc(r.why)}</span>
      </span>
      <span class="rec-foot">
        <span class="rec-fill"><b>${Math.round(r.fill * 100)}%</b> 채움</span>
        <span class="rec-price">${won(r.price)}</span>
        <span class="rec-go">${on ? "넣음" : "넣어 보기"}</span>
      </span>
    </button></li>`;
  }).join("") : `<li class="empty">${state.recMode === "two" ? "두 크기로 맞출 수 있는 제품군이 없어요. '한 종류'로 바꿔 보세요." : "이 크기에 맞는 수납함이 없어요."}</li>`;
}

// 추천 구성으로 수납장을 바꿔요. 이전 배치는 '되돌리기'로 살릴 수 있어요
function applyRec(i){
  const r = recs()[i];
  if(!r) return;
  const before = { placed: state.placed.slice(), candidates: state.candidates.slice() };
  state.placed = r.boxes.map(b => ({ uid: uid(), id: b.id, item: byId.get(b.id), x: b.x, y: b.y, z: b.z, rot: b.rot }));
  for(const p of r.parts) if(!state.candidates.includes(p.item.id)) state.candidates.push(p.item.id);
  state.recApplied = recKey() + "|" + r.family;
  commit(new Set(state.placed.map(e => e.uid)), true);
  toast(`${r.family} ${state.placed.length}개를 넣었어요`, {
    label: "되돌리기",
    run(){
      state.placed = before.placed;
      state.candidates = before.candidates;
      commit(new Set(state.placed.map(e => e.uid)));
    },
  });
}

// ---- 3D 위 도구 ----
function renderTools(uid){
  const e = state.placed.find(p => p.uid === uid);
  $("selInfo").textContent = e ? `${e.item.name} · ${fmt(sizeOf(e.item, e.rot).w)}×${fmt(sizeOf(e.item, e.rot).d)}×${fmt(e.item.h)}cm` : "상자를 눌러 고르고, 끌어서 옮겨요";
  $("rotBtn").disabled = $("delBtn").disabled = $("addBtn").disabled = !e;
  $("emptyBtn").disabled = !state.placed.length;
}

// 알림 한 줄. action({label, run})을 주면 단추가 붙고 조금 더 오래 떠 있어요
let toastTimer;
function toast(text, action){
  const el = $("toast");
  el.textContent = text;
  el.classList.toggle("has-action", !!action);
  if(action){
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = action.label;
    b.addEventListener("click", () => { el.classList.remove("on"); action.run(); });
    el.append(b);
  }
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), action ? 8000 : 2400);
}

// ---- 수납장 여러 개 ----
// 저장해 둔 수납장 하나를 지금 수납장으로 펼쳐요. 목록에서 사라진 상품은 건너뛰어요
function openCabinet(record){
  const { candidates, placed, ...cab } = record;
  state.empty = false;
  state.cabinet = cab;
  state.placed = (placed || []).filter(p => byId.has(p.id))
    .map(p => ({ uid: uid(), id: p.id, item: byId.get(p.id), x: p.x, y: p.y, z: p.z, rot: p.rot ? 1 : 0 }));
  // 후보 목록이 없던 예전 저장본은 넣어 둔 상자로 후보를 채워요
  state.candidates = [...new Set([...(candidates || []), ...state.placed.map(p => p.id)])].filter(id => byId.has(id));
  state.recApplied = null;
  view.select(null);
  view.setCabinet(state.cabinet);
  for(const k of ["w", "d", "h"]) $("cab_" + k).value = state.cabinet[k];
  if(!state.placed.length) state.recOpen = true;   // 빈 수납장이면 추천부터 보여 줘요
  commit(new Set(state.placed.map(e => e.uid)));
  renderCabinets();
}

function switchCabinet(id){
  if(!state.empty && id === state.cabinet.id) return;
  stash();
  const next = state.cabinets.find(c => c.id === id);
  if(next) openCabinet(next);
}

// 수납장이 하나도 없을 때: 칩 줄과 '수납장을 추가해 주세요' 안내만 남기고 나머지는 숨겨요
function showEmpty(){
  state.empty = true;
  state.cabinet = blankCabinet(nextName());
  state.placed = [];
  state.candidates = [];
  view.select(null);
  view.sync([]);
  renderCabinets();
  save();
}

// 새 수납장은 지금 수납장의 치수·종류를 이어받아 시작해요 (서랍 칸을 여러 개 재 볼 때 편하게)
function addCabinet(name){
  stash();
  const rec = blankCabinet(name || nextName(), state.empty ? null : state.cabinet);
  state.cabinets.push(rec);
  openCabinet(rec);
  $("cab_w").focus();
  $("cab_w").select();
}

// 마지막 하나도 지울 수 있어요. 그러면 빈 상태가 돼요
function removeCabinet(id){
  stash();
  const i = state.cabinets.findIndex(c => c.id === id);
  const [gone] = state.cabinets.splice(i, 1);
  if(state.cabinets.length) openCabinet(state.cabinets[Math.max(0, i - 1)]);
  else showEmpty();
  toast(`'${gone.name}'을 지웠어요`, {
    label: "되돌리기",
    run(){ stash(); state.cabinets.splice(i, 0, gone); openCabinet(gone); },
  });
}

function renameCabinet(id, name){
  name = name.trim();
  if(!name) return;
  if(id === state.cabinet.id) state.cabinet.name = name;
  const c = state.cabinets.find(c => c.id === id);
  if(c) c.name = name;
  save();
}

const addCabBtn = $("cabAdd");

/* 수납장 칩: [● 수납장1 ×] [거실 서랍] (+)
   누르면 바꾸고, 두 번 누르면 이름 고치기, 지금 수납장에 × (마지막 하나도 지울 수 있어요) */
function renderCabinets(){
  document.body.classList.toggle("no-cabinet", state.empty);
  const naming = state.naming;
  const chip = c => {
    const on = !state.empty && c.id === state.cabinet.id;
    if(naming && naming.id === c.id) return nameChip(c.name);
    return `<div class="cab-item${on ? " on" : ""}" role="listitem">
      <button type="button" class="cab-go" data-cab="${esc(c.id)}" ${on ? 'aria-current="true"' : ""} title="두 번 누르면 이름을 고쳐요">${esc(on ? state.cabinet.name : c.name)}</button>
      ${on ? `<button type="button" class="cab-x" data-del="${esc(c.id)}" aria-label="${esc(c.name)} 지우기" title="이 수납장 지우기"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>` : ""}
    </div>`;
  };
  const nameChip = value => `<div class="cab-item naming" role="listitem"><input class="cab-input" id="cabNameInput" type="text" maxlength="24" placeholder="수납장 이름" aria-label="수납장 이름" value="${esc(value)}"></div>`;
  $("cabStrip").innerHTML = state.cabinets.map(chip).join("") + (naming && naming.id === null ? nameChip("") : "");
  $("cabStrip").append(addCabBtn);   // (+) 는 늘 마지막 칩 뒤에 따라붙어요
  const input = $("cabNameInput");
  if(input){ input.focus(); input.select(); }
}

// 이름 칸에서 Enter·밖을 누르면 정하고, Esc 는 그만둬요
function finishNaming(ok){
  const naming = state.naming, input = $("cabNameInput");
  if(!naming || !input) return;
  state.naming = null;
  const value = input.value.trim();
  if(ok && naming.id === null) addCabinet(value);
  else { if(ok && value) renameCabinet(naming.id, value); renderCabinets(); }
}

$("cabStrip").addEventListener("click", ev => {
  const del = ev.target.closest("[data-del]"), go = ev.target.closest("[data-cab]");
  if(del) removeCabinet(del.dataset.del);
  else if(go) switchCabinet(go.dataset.cab);
});
$("cabStrip").addEventListener("dblclick", ev => {
  const go = ev.target.closest("[data-cab]");
  if(!go) return;
  state.naming = { id: go.dataset.cab };
  renderCabinets();
});
$("cabStrip").addEventListener("keydown", ev => {
  if(!ev.target.matches(".cab-input")) return;
  if(ev.key === "Enter"){ ev.preventDefault(); finishNaming(true); }
  if(ev.key === "Escape"){ ev.preventDefault(); finishNaming(false); }
});
$("cabStrip").addEventListener("focusout", ev => {
  if(ev.target.matches(".cab-input")) setTimeout(() => finishNaming(true));
});
addCabBtn.addEventListener("click", () => {
  if(state.naming) return finishNaming(true);
  state.naming = { id: null };
  renderCabinets();
});

// ---- 입력 ----
for(const k of ["w", "d", "h"]){
  const input = $("cab_" + k);
  input.addEventListener("change", () => {
    const v = Math.min(400, Math.max(5, Math.round((parseFloat(input.value) || state.cabinet[k]) * 2) / 2));
    input.value = v;
    if(v !== state.cabinet[k]) setCabinet({ [k]: v });
  });
}

$("itemList").addEventListener("click", ev => {
  const b = ev.target.closest(".item");
  if(!b) return;
  if(b.getAttribute("aria-disabled") === "true"){ toast(whyNot(byId.get(b.dataset.id), state.cabinet)); return; }
  pickItem(b.dataset.id);
});

$("candList").addEventListener("click", ev => {
  const row = ev.target.closest(".cand");
  if(!row) return;
  const id = row.dataset.id;
  const step = ev.target.closest("[data-step]");
  if(step){
    if(step.dataset.step === "1") addItem(id); else dropOne(id);
    // 다시 그려도 같은 단추에 초점이 남도록
    $("candList").querySelector(`.cand[data-id="${CSS.escape(id)}"] [data-step="${step.dataset.step}"]`)?.focus();
  } else if(ev.target.closest("[data-forget]")) forget(id);
});

$("brandChips").addEventListener("click", ev => {
  const b = ev.target.closest("[data-brand-filter]");
  if(!b) return;
  state.brand = b.dataset.brandFilter;
  $("brandChips").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
  renderList();
});
$("fitOnly").addEventListener("change", ev => { state.fitOnly = ev.target.checked; renderList(); });
$("sortBy").addEventListener("change", ev => { state.sort = ev.target.value; renderList(); });

$("recBtn").addEventListener("click", () => { state.recOpen = !state.recOpen; renderRec(); });
$("recClose").addEventListener("click", () => { state.recOpen = false; renderRec(); $("recBtn").focus(); });
$("rec").addEventListener("click", ev => {
  const t = ev.target.closest("[data-type]"), m = ev.target.closest("[data-mode]"), c = ev.target.closest(".rec-card");
  if(t){ state.cabinet.type = t.dataset.type; save(); renderRec(); }
  else if(m){ state.recMode = m.dataset.mode; save(); renderRec(); }
  else if(c) applyRec(+c.dataset.i);
});

$("rotBtn").addEventListener("click", () => rotateBox(view.selected));
$("delBtn").addEventListener("click", () => view.selected && removeBox(view.selected));
// 고른 상자와 같은 상품을 하나 더 넣어요
$("addBtn").addEventListener("click", () => {
  const e = state.placed.find(p => p.uid === view.selected);
  if(e) addItem(e.id);
});
$("viewBtn").addEventListener("click", () => view.resetView());
$("zoomInBtn").addEventListener("click", () => view.zoom(.8));
$("zoomOutBtn").addEventListener("click", () => view.zoom(1.25));

// 지우는 단추는 묻지 않고 바로 지우고, 알림의 '되돌리기'로 살려요
function undoable(text, change){
  const before = { placed: state.placed.slice(), candidates: state.candidates.slice() };
  change();
  commit();
  toast(text, {
    label: "되돌리기",
    run(){
      state.placed = before.placed;
      state.candidates = before.candidates;
      commit(new Set(state.placed.map(e => e.uid)));
    },
  });
}
// 3D 오른쪽 위: 수납장에 넣은 상자만 모두 빼요 (후보는 그대로)
$("emptyBtn").addEventListener("click", () => {
  if(state.placed.length) undoable(`상자 ${state.placed.length}개를 모두 뺐어요`, () => { state.placed = []; });
});
// 후보 수납함: 후보를 모두 지워요. 수납장에 넣은 상자도 같이 빠져요
$("clearBtn").addEventListener("click", () => {
  if(state.candidates.length) undoable("후보를 모두 지웠어요", () => { state.candidates = []; state.placed = []; });
});

// 글자 칸 밖에서 누른 Ctrl+Z · ⌘Z 는 화면 되돌리기 (글자 칸 안에서는 글자 되돌리기를 그대로 둬요)
document.addEventListener("keydown", ev => {
  if(!(ev.metaKey || ev.ctrlKey) || ev.altKey || ev.target.closest("input, textarea, [contenteditable]")) return;
  const k = ev.key.toLowerCase();
  if(k === "z" && !ev.shiftKey){ ev.preventDefault(); undo(); }
  else if((k === "z" && ev.shiftKey) || k === "y"){ ev.preventDefault(); redo(); }
});

document.addEventListener("keydown", ev => {
  if(ev.target.closest("input, select, textarea, button") || ev.metaKey || ev.ctrlKey) return;
  if(!view.selected) return;
  if(ev.key === "r" || ev.key === "R"){ rotateBox(view.selected); ev.preventDefault(); }
  if(ev.key === "Delete" || ev.key === "Backspace"){ removeBox(view.selected); ev.preventDefault(); }
  if(ev.key === "Escape") view.select(null);
});

// ---- 시작 ----
view.setCabinet(state.cabinet);
for(const k of ["w", "d", "h"]) $("cab_" + k).value = state.cabinet[k];
renderCabinets();
renderTools(null);
// catalog 는 이 파일 옆에 있어요 (페이지 주소와 상관없이 찾도록)
fetch(new URL("catalog.json?v=20261031d", import.meta.url)).then(r => r.json()).then(data => {
  items = data.items || [];
  byId = new Map(items.map(it => [it.id, it]));
  state.recOpen = false;
  if(state.empty) showEmpty(); else openCabinet(firstCab);
}).catch(() => {
  $("itemList").innerHTML = `<li class="empty">수납함 목록을 불러오지 못했어요. 새로 고쳐 주세요.</li>`;
});
