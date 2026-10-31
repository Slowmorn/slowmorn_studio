/* 룰러 화면 — 수납장 치수, 수납함 목록, 담은 목록, 저장을 묶어요.
   배치(무엇을 어디에)는 여기 state 가 정답이고, 3D 는 scene.js 가 그대로 그립니다. */
import { createScene } from "./scene.js";
import { sizeOf, findSpot, fits, restY, settle, whyNot, fitsEmpty, maxCount, fmt } from "./pack.js";

const KEY = "ruler:v1";
const BRANDS = { ikea: "이케아", daiso: "다이소", muji: "무인양품" };
const $ = id => document.getElementById(id);
const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const won = n => (n || 0).toLocaleString("ko-KR") + "원";

// ---- 저장 (이 브라우저에만) ----
function load(){
  try { return JSON.parse(localStorage.getItem(KEY)); } catch(e){ return null; }
}
function save(){
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cabinet: state.cabinet,
      placed: state.placed.map(({ id, x, y, z, rot }) => ({ id, x, y, z, rot })),
    }));
  } catch(e){}
}

const saved = load();
const state = {
  cabinet: { name: "내 수납장", w: 60, d: 40, h: 30, ...(saved && saved.cabinet) },
  placed: [],                 // [{uid, id, item, x, y, z, rot}]
  brand: "all", fitOnly: true, sort: "fit",
};
let items = [], byId = new Map(), uidSeq = 0;
const uid = () => "b" + (++uidSeq);

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

// 바뀔 때마다: 떠 있는 상자 내리기 → 3D 다시 그리기 → 숫자·목록 → 저장
function commit(enter){
  const boxes = state.placed.map(e => Object.assign(boxOf(e), { e }));
  settle(boxes).forEach(b => { b.e.y = b.y; });
  view.sync(state.placed, { enter });
  renderTools(view.selected);
  renderSummary();
  renderList();
  renderBag();
  save();
}

// ---- 넣기 · 빼기 · 돌리기 ----
function addItem(id){
  const item = byId.get(id);
  const spot = findSpot(item, state.placed.map(boxOf), state.cabinet);
  if(!spot){ toast(`${item.name} — ${whyNot(item, state.cabinet)}`); return; }
  const e = { uid: uid(), id, item, ...spot };
  state.placed.push(e);
  commit(e.uid);
  view.select(e.uid);
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
    fit: (a, b) => (b.now - a.now) || (b.ok - a.ok) || (b.it.w * b.it.d * b.it.h - a.it.w * a.it.d * a.it.h),
    price: (a, b) => (a.it.price || 0) - (b.it.price || 0),
    small: (a, b) => a.it.w * a.it.d * a.it.h - b.it.w * b.it.d * b.it.h,
  }[state.sort];
  rows.sort(by);
  $("listCount").textContent = rows.length + "개";
  $("itemList").innerHTML = rows.length ? rows.map(({ it, ok, now }) => {
    const n = ok ? maxCount(it, cab) : 0;
    const note = !ok ? whyNot(it, cab) : now ? `빈 수납장에 ${n}개` : "지금은 자리가 없어요";
    return `<li><button type="button" class="item" data-id="${esc(it.id)}" data-brand="${esc(it.brand)}" ${ok ? "" : 'aria-disabled="true"'}>
      <span class="item-swatch" style="background:${esc(it.color || "#ddd")}" aria-hidden="true"></span>
      <span class="item-main">
        <span class="item-brand"><span class="brand-dot" aria-hidden="true"></span>${BRANDS[it.brand] || esc(it.brand)}</span>
        <span class="item-name">${esc(it.name)}</span>
        <span class="item-size">${fmt(it.w)} × ${fmt(it.d)} × ${fmt(it.h)}cm</span>
      </span>
      <span class="item-side">
        <span class="item-price">${it.price ? won(it.price) : ""}</span>
        <span class="item-note ${ok && now ? "" : "muted"}">${note}</span>
      </span>
      <span class="item-add" aria-hidden="true">${ok && now ? "넣기" : ""}</span>
    </button></li>`;
  }).join("") : `<li class="empty">${state.fitOnly ? "이 크기에 들어가는 수납함이 없어요. '모두 보기'로 바꿔 보세요." : "수납함이 없어요."}</li>`;
}

// ---- 담은 목록 ----
function renderBag(){
  const groups = new Map();
  for(const e of state.placed){
    const g = groups.get(e.id) || { item: e.item, n: 0 };
    g.n++; groups.set(e.id, g);
  }
  $("bag").hidden = !groups.size;
  $("bagList").innerHTML = [...groups.values()].map(({ item, n }) => `<li data-brand="${esc(item.brand)}">
    <span class="item-swatch" style="background:${esc(item.color || "#ddd")}" aria-hidden="true"></span>
    <span class="bag-name"><span class="brand-dot" aria-hidden="true"></span>${esc(item.name)} <b>× ${n}</b></span>
    <span class="bag-price">${item.price ? won(item.price * n) : ""}</span>
    ${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">판매처</a>` : ""}
  </li>`).join("");
}

// ---- 3D 위 도구 ----
function renderTools(uid){
  const e = state.placed.find(p => p.uid === uid);
  $("selInfo").textContent = e ? `${e.item.name} · ${fmt(sizeOf(e.item, e.rot).w)}×${fmt(sizeOf(e.item, e.rot).d)}×${fmt(e.item.h)}cm` : "상자를 눌러 고르고, 끌어서 옮겨요";
  $("rotBtn").disabled = $("delBtn").disabled = !e;
}

let toastTimer;
function toast(text){
  const el = $("toast");
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), 2400);
}

// ---- 입력 ----
const nameInput = $("cabName");
nameInput.value = state.cabinet.name;
nameInput.addEventListener("input", () => { state.cabinet.name = nameInput.value; save(); });

for(const k of ["w", "d", "h"]){
  const input = $("cab_" + k);
  input.value = state.cabinet[k];
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
  addItem(b.dataset.id);
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

$("rotBtn").addEventListener("click", () => rotateBox(view.selected));
$("delBtn").addEventListener("click", () => view.selected && removeBox(view.selected));
$("viewBtn").addEventListener("click", () => view.resetView());
$("clearBtn").addEventListener("click", () => {
  if(!state.placed.length) return;
  if(!confirm("담은 수납함을 모두 뺄까요?")) return;
  state.placed = [];
  commit();
});

document.addEventListener("keydown", ev => {
  if(ev.target.closest("input, select, textarea") || ev.metaKey || ev.ctrlKey) return;
  if(!view.selected) return;
  if(ev.key === "r" || ev.key === "R"){ rotateBox(view.selected); ev.preventDefault(); }
  if(ev.key === "Delete" || ev.key === "Backspace"){ removeBox(view.selected); ev.preventDefault(); }
  if(ev.key === "Escape") view.select(null);
});

// ---- 시작 ----
view.setCabinet(state.cabinet);
renderTools(null);
fetch("assets/catalog.json?v=20261031a").then(r => r.json()).then(data => {
  items = data.items || [];
  byId = new Map(items.map(it => [it.id, it]));
  // 저장해 둔 배치를 되살려요. 목록에서 사라진 상품은 건너뛰어요
  for(const p of (saved && saved.placed) || []){
    const item = byId.get(p.id);
    if(item) state.placed.push({ uid: uid(), id: p.id, item, x: p.x, y: p.y, z: p.z, rot: p.rot ? 1 : 0 });
  }
  commit();
}).catch(() => {
  $("itemList").innerHTML = `<li class="empty">수납함 목록을 불러오지 못했어요. 새로 고쳐 주세요.</li>`;
});
