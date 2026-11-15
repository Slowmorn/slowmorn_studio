// 패밀리리허설 — 출산·육아 시뮬레이터
// 화면 세 개(시작 설정 · 시뮬레이션 · 정리)와 결정 카드를 다뤄요. 상태는 localStorage 에 저장해요.
import { EVENTS, DECISIONS, BIRTH_T, TWIN_BIRTH_T, END_T, PHASES, TYPE_LABEL, MODE_LABEL, byId, evTitle, evBody } from './events.js?v=20261117c';
import { totals, optionOf, priceText, optionTotal, won, eff, BASE_NOTE } from './budget.js?v=20261117c';
import { mountScene, caption, momNote } from './pixel.js?v=20261117c';
import { ultrasound, ULTRA_LABEL, ULTRA_WEEK } from './ultra.js?v=20261117c';
import { Clock } from './clock.js?v=20261117c';
import { renderReport } from './report.js?v=20261117c';
import { stageLabel, dateText } from './time.js?v=20261117c';

const KEY = 'child-sim-v1';
const ARCHIVE_KEY = 'child-sim-archive-v1';
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// 결정 종류 이름. '남편 차례'는 적어 둔 호칭으로 바꿔요
const typeLabel = ev => ev.type === 'care' ? `${state?.names[1] || '남편'} 차례` : TYPE_LABEL[ev.type];
const linkHtml = ev => ev.link ? `<a class="ext-link" href="${esc(ev.link.href)}" target="_blank" rel="noopener">${esc(ev.link.label)} <span aria-hidden="true">→</span></a>` : '';

// 시간이 멈추는 곳: 결정 카드 + 아빠 할 일 체크리스트 (체크리스트는 '확인했어요'를 누르면 지나가요)
const STOPS = EVENTS.filter(ev => DECISIONS.includes(ev) || (ev.dad && ev.items));
const isOpenStop = ev => ev.items ? !state.seen?.[ev.id] : !state.decisions[ev.id];
const openStop = (ev, opts) => ev.items ? openChecklist(ev, opts) : openDecision(ev, opts);

// ── 저장 ─────────────────────────────────────
function load(key){ try { return JSON.parse(localStorage.getItem(key)); } catch(e){ return null; } }
function store(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){} }

let state = load(KEY);
let saveTimer = 0;
function save(now = false){
  clearTimeout(saveTimer);
  if(now) store(KEY, state);
  else saveTimer = setTimeout(() => store(KEY, state), 800);
}

function newState(form){
  return {
    v:5,
    id:Date.now().toString(36),
    createdAt:new Date().toISOString(),
    names:[form.nameA || '아내', form.nameB || '남편'],
    baby:form.baby || '',
    twins:form.twins === 'yes',
    due:form.due || '',
    speed:1,
    t:0,
    decisions:{},   // { [eventId]: { choice, memo, status:'agree'|'hold', ts, t, history:[...] } }
    todos:{},       // { [eventId]: true } · 체크리스트 항목은 { 'eventId:항목': true }
    seen:{},        // { [eventId]: true } 확인한 아빠 할 일 체크리스트
    promise:'',
    finished:false,
  };
}

function archiveCurrent(){
  if(!state) return;
  const touched = Object.keys(state.decisions).length > 0;
  if(!touched){ return; }
  const list = load(ARCHIVE_KEY) || [];
  list.unshift({ savedAt:new Date().toISOString(), state });
  store(ARCHIVE_KEY, list.slice(0, 5));
}

// ── 화면 전환 ─────────────────────────────────
const screens = { setup:$('#setup'), sim:$('#sim'), report:$('#report') };
let screen = '';
function show(name){
  screen = name;
  for(const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  $('#btnRestart').hidden = name === 'setup';
  $('#btnRestart').textContent = '처음부터 다시';
  $('#btnReport').hidden = name !== 'sim';
  window.scrollTo(0, 0);
}

// ── 시작 설정 ─────────────────────────────────
function openSetup(){
  clock.pause();
  show('setup');
  const list = load(ARCHIVE_KEY) || [];
  $('#archive').hidden = !list.length;
  $('#archiveList').innerHTML = list.map((a, i) => {
    const s = a.state;
    const tt = totals(s);
    const n = Object.keys(s.decisions).length;
    return `<li><button type="button" data-archive="${i}">
      <b>${esc(s.names.join(' · '))}${s.baby ? ` · ${esc(s.baby)}` : ''}${s.twins ? ' · 쌍둥이' : ''}</b>
      <span>${new Date(a.savedAt).toLocaleDateString('ko-KR')} · 결정 ${n}개 · ${s.finished ? '끝까지 봤어요' : stageLabel(s.t) + '에서 멈춤'} · 실부담 ${won(tt.net)}</span>
    </button></li>`;
  }).join('');
}
$('#archiveList').addEventListener('click', e => {
  const b = e.target.closest('[data-archive]');
  if(!b) return;
  const a = (load(ARCHIVE_KEY) || [])[Number(b.dataset.archive)];
  if(a) openReport(a.state, true);
});
$('#setupForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  state = newState(f);
  save(true);
  startSim(true);
});

// 확인 창: 앱 안의 <dialog> 로 띄우고 고른 답을 돌려줘요
function ask(title, body, yes = '확인'){
  const d = $('#ask');
  $('#askTitle').textContent = title;
  $('#askBody').textContent = body;
  $('#askYes').textContent = yes;
  d.returnValue = '';
  d.showModal();
  return new Promise(res => d.addEventListener('close', () => res(d.returnValue === 'yes'), { once:true }));
}

$('#btnRestart').addEventListener('click', async () => {
  if(screen === 'report' && reportReadonly){ openSetup(); return; }
  clock.pause();
  const ok = await ask('처음부터 다시 할까요?', '지금까지의 기록은 "지난 시뮬레이션"에 보관돼요. 시작 화면에서 언제든 다시 열어 볼 수 있어요.', '처음부터 다시');
  if(!ok) return;
  archiveCurrent();
  state = null;
  try { localStorage.removeItem(KEY); } catch(e){}
  $('#setupForm').reset();
  openSetup();
});

// ── 시뮬레이션 ────────────────────────────────
const clock = new Clock({
  getT:() => state.t,
  setT:t => { state.t = t; onTime(); },
  birthT:() => state?.twins ? TWIN_BIRTH_T : BIRTH_T,
  nextStop:(from, to) => STOPS.find(ev => ev.t <= to && isOpenStop(ev)) || null,
  nextEvent:to => { const ev = EVENTS[shownCount()]; return ev && ev.t <= to + 1e-9 ? ev : null; },
  reveal:ev => {
    state.shown = EVENTS.indexOf(ev) + 1;
    onTime();
    if(STOPS.includes(ev) && isOpenStop(ev)) return 'stop';
    if(ev.type === 'milestone' && Math.abs(ev.t - BIRTH_T) < 1e-6){ celebrate(ev); return 3600; }
    // 카드 하나를 읽을 틈: 글이 길수록 오래 머물러요 (1배속 2~8초, 빠르게 돌리면 그만큼 짧게)
    const len = (evTitle(ev, state.twins) + evBody(ev, state.twins)).length;
    return Math.round(Math.min(8000, 2000 + len * 30) / Math.sqrt(clock.speed));
  },
  onStop:ev => openStop(ev, { fromClock:true }),
  onEnd:() => { state.finished = true; save(true); toast('만 36개월이 되었어요. 둘의 계획을 정리해 볼게요.'); setTimeout(() => openReport(state), 900); },
  onState:running => { document.body.classList.toggle('is-running', running); $('#btnPlay').setAttribute('aria-label', running ? '일시정지' : '재생'); },
});

function startSim(autoplay){
  show('sim');
  if(state.twins && state.t >= TWIN_BIRTH_T && state.t < BIRTH_T) state.t = BIRTH_T;   // 쌍둥이는 37주에 태어나요
  clock.speed = state.speed;
  const r = document.querySelector(`input[name="simSpeed"][value="${state.speed}"]`);
  if(r) r.checked = true;
  $('#nowWho').textContent = `${state.names.join(' · ')}${state.baby ? ` · ${state.baby}` : ''}${state.twins ? ' · 쌍둥이' : ''}`;
  if(!sceneMounted){ mountScene($('#scene'), () => ({ t:state ? state.t : 0, twins:!!state?.twins, seed:state?.id })); sceneMounted = true; }
  buildTrack();
  lastInt = -1;
  feedCount = -1;
  onTime(true);
  renderSide();
  if(autoplay) setTimeout(() => clock.play(), 400);
}

// 진행 막대: 구간 이름과 결정 지점 점
const pct = t => (t / END_T * 100).toFixed(3) + '%';
function buildTrack(){
  $('#trackPhases').innerHTML = PHASES.map(p =>
    `<span style="left:${pct(p.from)};width:${pct(p.to - p.from)}">${p.label}</span>`).join('');
  renderMarks();
}
function renderMarks(){
  $('#trackMarks').innerHTML = DECISIONS.map(ev => {
    const rec = state.decisions[ev.id];
    const cls = rec ? (rec.status === 'hold' ? 'hold' : 'done') : '';
    return `<i class="${cls}" style="left:${pct(ev.t)}" title="${esc(ev.title)}"></i>`;
  }).join('');
}

// 지금까지 타임라인에 띄운 이벤트 수 (같은 주에 여러 개면 하나씩 늘어나요)
const shownCount = () => state.shown ?? EVENTS.filter(ev => ev.t <= state.t + 1e-6).length;
const visibleEvents = () => EVENTS.slice(0, shownCount()).filter(ev => ev.t <= state.t + 1e-6);

// 아기가 태어나는 순간: 화면이 잠깐 어두워지고 축하 효과가 떠요
function celebrate(ev){
  document.querySelector('.birth-fx')?.remove();
  const el = document.createElement('div');
  el.className = 'birth-fx';
  el.setAttribute('role', 'status');
  const bits = Array.from({ length:18 }, (_, k) => {
    const x = (k * 37 + 11) % 100, d = (k % 6) * .12, s = 10 + (k * 7) % 14;
    return `<i class="${k % 3 ? 'sp' : 'ht'}" style="left:${x}%;--d:${d}s;--s:${s}px"></i>`;
  }).join('');
  el.innerHTML = `${bits}<div class="birth-card">
    <p class="birth-when">${esc(stageLabel(ev.t))}${state.due ? ' · ' + esc(dateText(state.due, ev.t, state.twins)) : ''}</p>
    <h2>${esc(evTitle(ev, state.twins))}</h2>
    <p class="birth-hi">${state.baby ? `${esc(state.baby)}, 반가워요` : '반가워요, 우리 아기'}</p></div>`;
  document.body.append(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 600); };
  el.addEventListener('click', close);
  setTimeout(close, 3000);
}

let lastInt = -1;
let feedCount = -1;
let sceneMounted = false;
function onTime(force = false){
  const t = state.t;
  $('#trackFill').style.width = pct(t);
  $('#trackNow').style.left = pct(t);
  const i = Math.floor(t + 1e-6);
  if(i !== lastInt || force){
    lastInt = i;
    $('#nowLabel').textContent = stageLabel(t);
    $('#nowDate').textContent = state.due ? dateText(state.due, t, state.twins) : '';
    $('#nowCaption').textContent = caption(t, state.baby, state.twins);
    const mom = momNote(t, state.twins);
    $('#nowMom').textContent = mom ? `엄마 · ${mom}` : '';
    const next = DECISIONS.find(ev => !state.decisions[ev.id] && ev.t >= t - 1e-6);
    $('#upNext').innerHTML = next ? `다음 · <b>${esc(evTitle(next, state.twins))}</b> <span>${stageLabel(next.t)}</span>` : (t >= END_T ? '' : '정할 건 다 정했어요. 끝까지 흘러가 볼까요?');
    renderSideBudget();
    save();
  }
  const n = visibleEvents().length;
  if(n !== feedCount){ renderFeed(n > feedCount && feedCount >= 0 ? feedCount : n); feedCount = n; }
}

// 타임라인: 지나온 일을 최신이 위로 오게 쌓아요
function renderFeed(newFrom){
  const seen = visibleEvents();
  if(!seen.length){
    $('#feed').innerHTML = `<div class="feed-empty"><b>곧 시작해요</b><span>재생 단추를 누르면 임신 4주부터 시간이 흘러가요.</span></div>`;
    return;
  }
  $('#feed').innerHTML = seen.map((ev, idx) => card(ev, idx >= newFrom).replace('<article ', `<article data-ev="${ev.id || ''}" `)).reverse().join('');
}

function card(ev, isNew){
  const tw = state.twins;
  const when = `${stageLabel(ev.t)}${state.due ? ' · ' + dateText(state.due, ev.t, state.twins) : ''}`;
  const cls = `card card-${ev.type}${isNew ? ' is-new' : ''}`;
  const title = esc(evTitle(ev, tw));
  const body = evBody(ev, tw);
  // 설명은 접지 않고 다 보여 줘요
  const para = `<p class="body">${esc(body)}</p>`;
  if(ev.type === 'milestone'){
    return `<article class="${cls}"><p class="card-when">${when}</p><h3>${title}</h3><p class="body">${esc(body)}</p></article>`;
  }
  if(ev.type === 'todo' && ev.items){
    const keys = ev.items.map(([k]) => `${ev.id}:${k}`);
    const n = keys.filter(k => state.todos[k]).length;
    return `<article class="${cls} card-dad${n === keys.length ? ' is-done' : ''}" data-list="${ev.id}">
      <p class="card-when">${when} · 아빠 할 일 <span class="list-count">${n}/${keys.length}</span></p>
      <h3>${title}</h3>${para}
      ${ev.support ? `<div class="chips"><span class="chip chip-good">+${won(tw && ev.support.twinAmount ? ev.support.twinAmount : ev.support.amount)} ${esc(ev.support.label)}</span></div>` : ''}
      <ul class="checklist">${ev.items.map(([k, label, note]) => `<li><label class="todo">
        <input type="checkbox" data-todo="${ev.id}:${k}" ${state.todos[`${ev.id}:${k}`] ? 'checked' : ''}>
        <span><b>${esc(label)}</b>${note ? `<small>${esc(note)}</small>` : ''}</span></label></li>`).join('')}</ul>
    </article>`;
  }
  if(ev.type === 'todo'){
    const done = !!state.todos[ev.id];
    const amount = ev.support && (tw && ev.support.twinAmount ? ev.support.twinAmount : ev.support.amount);
    const chips = [
      ev.cost ? `<span class="chip">약 ${won(ev.cost)}</span>` : '',
      ev.monthly ? `<span class="chip">매달 약 ${won(ev.monthly)}</span>` : '',
      ev.support ? `<span class="chip chip-good">+${won(amount)} ${esc(ev.support.label)}</span>` : '',
    ].join('');
    const img = ev.ultra ? `<figure class="ultra"><img alt="${ULTRA_LABEL[ev.ultra]} (그림)" src="${ultrasound(ev.ultra, { seed:state.id, twins:tw, week:ULTRA_WEEK[ev.ultra], name:state.baby })}"><figcaption>${ULTRA_LABEL[ev.ultra]} · 그려 본 예시예요</figcaption></figure>` : '';
    return `<article class="${cls}${done ? ' is-done' : ''}">
      <p class="card-when">${when} · 할 일</p>
      <label class="todo"><input type="checkbox" data-todo="${ev.id}" ${done ? 'checked' : ''}><h3>${title}</h3></label>
      ${para}${ev.list ? `<ul class="tips">${ev.list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${img}${linkHtml(ev)}${chips ? `<div class="chips">${chips}</div>` : ''}
    </article>`;
  }
  // 결정 카드
  const rec = state.decisions[ev.id];
  const opt = rec && eff(ev, optionOf(ev, rec.choice), tw);
  let result;
  if(!rec){
    result = `<div class="card-result pending"><span>아직 정하지 않았어요</span><button type="button" class="btn-small" data-open="${ev.id}">지금 정하기</button></div>`;
  } else {
    const changed = rec.history.length > 1 ? `<span class="chip">${rec.history.length - 1}번 바꿈</span>` : '';
    result = `<div class="card-result ${rec.status}">
      <div><span class="status ${rec.status}">${rec.status === 'hold' ? '보류' : '합의'}</span>
      <b>${opt ? esc(opt.label) : '아직 고르지 않음'}</b>${opt && ev.type !== 'care' ? ` <span class="price">${priceText(opt)}</span>` : ''} ${changed}</div>
      ${rec.memo ? `<p class="memo">“${esc(rec.memo)}”</p>` : ''}
      <button type="button" class="btn-small" data-open="${ev.id}">다시 이야기하기</button>
    </div>`;
  }
  return `<article class="${cls}">
    <p class="card-when">${when} · ${typeLabel(ev)}</p>
    <h3>${title}</h3>${para}${linkHtml(ev)}${result}
  </article>`;
}

$('#feed').addEventListener('change', e => {
  const id = e.target.dataset.todo;
  if(!id) return;
  if(e.target.checked) state.todos[id] = true; else delete state.todos[id];
  const cardEl = e.target.closest('.card');
  if(cardEl.dataset.list){
    const boxes = [...cardEl.querySelectorAll('[data-todo]')], n = boxes.filter(b => b.checked).length;
    cardEl.querySelector('.list-count').textContent = `${n}/${boxes.length}`;
    cardEl.classList.toggle('is-done', n === boxes.length);
  } else cardEl.classList.toggle('is-done', e.target.checked);
  save();
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-open]');
  if(b && state){ clock.pause(); openDecision(byId[b.dataset.open], {}); }
});

// 오른쪽: 예산과 선택 기록
function renderSide(){ renderSideBudget(); renderLog(); renderMarks(); }

function renderSideBudget(){
  const tt = totals(state, state.t);
  const undecided = DECISIONS.filter(ev => !state.decisions[ev.id] || state.decisions[ev.id].status === 'hold').length;
  const max = Math.max(1, ...PHASES.map(p => tt.phasesNow[p.id].cost));
  // 위쪽은 0원에서 시작해서 시간이 흐르며 쌓이는 '지금까지', 아래쪽은 지금까지 정한 대로 가면 만 3세까지 얼마인지
  $('#budgetPanel').innerHTML = `
    <h2>예산</h2>
    <div class="money-now">
      <span>지금까지 쓴 돈</span>
      <b>${won(tt.costNow)}</b>
      <small>고른 것의 값은 고른 순간 더해지고, 매달 드는 돈은 그달마다 더해져요</small>
    </div>
    <dl class="money-total">
      <div><dt>지금까지 받은 지원금</dt><dd class="good">${won(tt.supportNow)}</dd></div>
      <div class="sum"><dt>지금까지 실제 부담</dt><dd>${tt.netNow >= 0 ? won(tt.netNow) : `<span class="good">지원금이 ${won(-tt.netNow)} 더 많아요</span>`}</dd></div>
    </dl>
    <ul class="phase-bars">${PHASES.map(p => {
      const c = tt.phasesNow[p.id].cost;
      return `<li><span>${p.label}</span><i style="width:${(c / max * 100).toFixed(1)}%"></i><b>${won(c)}</b></li>`;
    }).join('')}</ul>
    <p class="modes">육아용품 ${gearText()}</p>
    <details class="money-ahead">
      <summary>지금까지 정한 대로라면, 만 3세까지</summary>
      <dl class="money-total">
        <div><dt>예상 지출</dt><dd>${won(tt.cost)}</dd></div>
        <div><dt>받을 지원금</dt><dd class="good">${won(tt.support)}</dd></div>
        <div class="sum"><dt>실제 부담</dt><dd>${tt.net >= 0 ? won(tt.net) : `<span class="good">지원금이 ${won(-tt.net)} 더 많아요</span>`}</dd></div>
      </dl>
      <p class="note">${BASE_NOTE}${state.twins ? ', 쌍둥이는 1.8배' : ''}와 부모급여·아동수당이 들어 있어요.${undecided ? ` 아직 정하지 않았거나 보류한 ${undecided}개는 빠져 있어요.` : ''}</p>
    </details>
  `;
}

function gearText(){
  const ev = byId.gear, rec = state.decisions.gear;
  const opt = rec && eff(ev, optionOf(ev, rec.choice), state.twins);
  if(!opt) return `<span>${state.t < ev.t ? `${stageLabel(ev.t)}에 정해요` : '아직 정하지 않았어요'}</span>`;
  return `<b>${won(opt.once)}</b> <span>· ${esc(MODE_LABEL[opt.mode])}${rec.status === 'hold' ? ' · 보류' : ''}</span>`;
}

function renderLog(){
  const recs = DECISIONS.filter(ev => state.decisions[ev.id]);
  $('#logCount').textContent = recs.length;
  $('#logPanel').innerHTML = `
    <h2>선택 기록 <span>${recs.length} / ${DECISIONS.length}</span></h2>
    ${recs.length ? `<ol class="log">${recs.map(ev => {
      const rec = state.decisions[ev.id];
      const opt = eff(ev, optionOf(ev, rec.choice), state.twins);
      return `<li><button type="button" data-open="${ev.id}">
        <span class="log-when">${stageLabel(ev.t)}</span>
        <span class="log-title">${esc(evTitle(ev, state.twins))}</span>
        <span class="log-choice"><span class="status ${rec.status}">${rec.status === 'hold' ? '보류' : '합의'}</span>${opt ? esc(opt.label) : '—'}${rec.history.length > 1 ? ` <em>· ${rec.history.length - 1}번 바꿈</em>` : ''}</span>
        ${rec.memo ? `<span class="log-memo">${esc(rec.memo)}</span>` : ''}
      </button></li>`;
    }).join('')}</ol>` : '<p class="note">시간이 흐르다 정할 일이 생기면 여기에 둘의 선택이 차곡차곡 남아요.</p>'}
  `;
}

// ── 결정 카드 ─────────────────────────────────
const dlg = $('#decide');
let dlgCtx = null;
// 결정 카드 내용 (타임라인 카드 안에 펼치거나, 정리 화면에서는 창으로 띄워요)
function decideHtml(ev, fromClock){
  const rec = state.decisions[ev.id];
  const cur = rec?.choice || '';
  const multi = ev.type === 'care';
  const isOn = id => multi ? Array.isArray(cur) && cur.includes(id) : id === cur;
  const hasCost = !ev.noPrice && ev.options.some(o => o.once || o.monthly || o.after);
  return `
    <form method="dialog" class="decide-inner">
      ${fromClock ? `<p class="pause-note">시간이 잠시 멈췄어요. 둘이 이야기해 보고 정해요.</p>` : ''}
      <p class="card-when">${stageLabel(ev.t)}${state.due ? ' · ' + dateText(state.due, ev.t, state.twins) : ''} · ${typeLabel(ev)}</p>
      <h2>${esc(evTitle(ev, state.twins))}</h2>
      <p class="decide-body">${esc(evBody(ev, state.twins))}</p>
      ${linkHtml(ev)}
      ${multi ? '<p class="multi-hint">할 수 있는 건 모두 골라요. 여러 개 골라도 돼요.</p>' : ''}
      <div class="opts" role="${multi ? 'group' : 'radiogroup'}">
        ${ev.options.map(o0 => eff(ev, o0, state.twins)).map(o => `
          <label class="opt${multi ? ' opt-multi' : ''}">
            <input type="${multi ? 'checkbox' : 'radio'}" name="choice" value="${o.id}" ${isOn(o.id) ? 'checked' : ''}>
            <span class="opt-main">
              <b>${esc(o.label)}</b>
              ${o.mode && o.mode !== 'none' && ev.type === 'buy' ? `<span class="mode mode-${o.mode}">${MODE_LABEL[o.mode]}</span>` : ''}
              ${hasCost ? `<span class="price">${priceText(o)}${o.monthly ? ` · 합계 ${won(optionTotal(o))}` : ''}</span>` : ''}
              ${o.note ? `<span class="opt-note">${esc(o.note)}</span>` : ''}
            </span>
          </label>`).join('')}
      </div>
      <label class="memo-field"><span>둘이 나눈 이야기 <em>(선택)</em></span>
        <textarea name="memo" rows="2" maxlength="200" placeholder="왜 이렇게 정했는지, 서로 어떤 마음이었는지 남겨 두세요">${esc(rec?.memo || '')}</textarea></label>
      ${rec && rec.history.length ? `<details class="history"><summary>지난 기록 ${rec.history.length}개</summary><ol>${rec.history.map(h => {
        const o = eff(ev, optionOf(ev, h.choice), state.twins);
        return `<li><span>${new Date(h.ts).toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })} · ${stageLabel(h.t)} 시점</span>
          <b>${h.status === 'hold' ? '보류' : '합의'} · ${o ? esc(o.label) : '고르지 않음'}</b>${h.memo ? `<em>“${esc(h.memo)}”</em>` : ''}</li>`;
      }).reverse().join('')}</ol></details>` : ''}
      <div class="decide-actions">
        <button type="button" class="btn-ghost" data-act="hold">나중에 다시 이야기하기</button>
        <button type="button" class="btn-primary" data-act="agree">이걸로 정했어요</button>
      </div>
      <button type="button" class="dlg-close" data-act="close" aria-label="닫기">×</button>
    </form>`;
}
// 아빠 할 일 체크리스트 내용
function checklistHtml(ev, fromClock){
  const tw = state.twins;
  const amount = ev.support && (tw && ev.support.twinAmount ? ev.support.twinAmount : ev.support.amount);
  return `
    <form method="dialog" class="decide-inner">
      ${fromClock ? `<p class="pause-note">시간이 잠시 멈췄어요. ${esc(state.names[1] || '남편')} 님이 챙길 일이에요.</p>` : ''}
      <p class="card-when">${stageLabel(ev.t)}${state.due ? ' · ' + dateText(state.due, ev.t, state.twins) : ''} · 아빠 할 일</p>
      <h2>${esc(evTitle(ev, tw))}</h2>
      <p class="decide-body">${esc(evBody(ev, tw))}</p>
      ${ev.support ? `<div class="chips"><span class="chip chip-good">+${won(amount)} ${esc(ev.support.label)}</span></div>` : ''}
      <ul class="checklist">${ev.items.map(([k, label, note]) => `<li><label class="todo">
        <input type="checkbox" data-todo="${ev.id}:${k}" ${state.todos[`${ev.id}:${k}`] ? 'checked' : ''}>
        <span><b>${esc(label)}</b>${note ? `<small>${esc(note)}</small>` : ''}</span></label></li>`).join('')}</ul>
      <p class="multi-hint">지금 못 한 일은 나중에 타임라인에서 체크해도 돼요.</p>
      <div class="decide-actions">
        <button type="button" class="btn-primary" data-act="seen">확인했어요</button>
      </div>
      <button type="button" class="dlg-close" data-act="close" aria-label="닫기">×</button>
    </form>`;
}
// 결정과 아빠 할 일은 팝업 창으로 띄워요 (뒤 화면은 어두워지지 않아요)
function openPanel(ev, fromClock, list){
  dlgCtx = { ev, fromClock, list };
  dlg.innerHTML = list ? checklistHtml(ev, fromClock) : decideHtml(ev, fromClock);
  dlg.showModal();
  dlg.scrollTop = 0;   // 같은 창을 다시 쓰니까, 새 카드는 늘 맨 위부터 보여요
  const first = dlg.querySelector('input[name="choice"]:checked') || dlg.querySelector('input[name="choice"]');
  first?.focus({ preventScroll:true });
}
function openDecision(ev, { fromClock = false } = {}){ if(ev) openPanel(ev, fromClock, false); }
function openChecklist(ev, { fromClock = false } = {}){ openPanel(ev, fromClock, true); }
dlg.addEventListener('change', e => {
  const id = e.target.dataset.todo;
  if(!id) return;
  if(e.target.checked) state.todos[id] = true; else delete state.todos[id];
  save();
});

function closeDecision(){ dlgCtx = null; if(dlg.open) dlg.close(); }
function onAct(act){
  if(!dlgCtx) return;
  if(act === 'close'){ closeDecision(); if(screen === 'sim'){ feedCount = -1; onTime(true); } return; }
  const { ev, fromClock } = dlgCtx;
  if(act === 'seen'){
    (state.seen ||= {})[ev.id] = true;
    save(true);
    closeDecision();
    if(fromClock && !state.finished && screen === 'sim') setTimeout(() => clock.play(), 350);
    return;
  }
  const fd = new FormData(dlg.querySelector('form'));
  const choice = ev.type === 'care' ? fd.getAll('choice') : (fd.get('choice') || '');
  const memo = String(fd.get('memo') || '').trim();
  if(act === 'agree' && !choice.length){
    toast('하나를 골라 주세요. 아직 의견이 다르면 "나중에 다시 이야기하기"를 눌러요.');
    return;
  }
  closeDecision();
  record(ev, { choice, memo, status:act });
  if(screen === 'sim'){ feedCount = -1; onTime(true); }
  toast(act === 'hold' ? '보류로 남겨 뒀어요. 정리 화면에서 다시 볼 수 있어요.' : '기록했어요.');
  if(fromClock && !state.finished && screen === 'sim') setTimeout(() => clock.play(), 350);
}
dlg.addEventListener('click', e => {
  if(e.target === dlg){ closeDecision(); return; }   // 바깥 누르면 닫기
  const act = e.target.closest('[data-act]')?.dataset.act;
  if(act) onAct(act);
});
dlg.addEventListener('cancel', () => { dlgCtx = null; });

function record(ev, { choice, memo, status }){
  const prev = state.decisions[ev.id];
  const entry = { choice, memo, status, ts:new Date().toISOString(), t:state.t };
  const same = prev && JSON.stringify(prev.choice) === JSON.stringify(choice) && prev.memo === memo && prev.status === status;
  if(same) return;
  state.decisions[ev.id] = { ...entry, history:[...(prev?.history || []), entry] };
  save(true);
  if(screen === 'sim'){ feedCount = -1; onTime(true); renderSide(); }
  if(screen === 'report') openReport(state, false);
}

// ── 조작 ─────────────────────────────────────
$('#btnPlay').addEventListener('click', () => {
  if(state.t >= END_T){ openReport(state); return; }
  const pending = STOPS.find(ev => ev.t <= state.t + 1e-6 && isOpenStop(ev));
  if(pending){ openStop(pending, { fromClock:true }); return; }
  clock.toggle();
});
$('#speedSeg').addEventListener('change', e => {
  state.speed = Number(e.target.value);
  clock.speed = state.speed;
  save();
});
$('#btnNext').addEventListener('click', () => {
  const next = STOPS.find(isOpenStop);
  if(!next){ toast('정할 건 다 정했어요.'); return; }
  clock.pause();
  if(next.t > state.t) state.t = next.t;
  state.shown = Math.max(shownCount(), EVENTS.indexOf(next) + 1);
  onTime(true);
  openStop(next, { fromClock:true });
});
$('#btnReport').addEventListener('click', () => { clock.pause(); openReport(state); });
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if(!b) return;
  $('#simBody').dataset.tab = b.dataset.tab;
  for(const x of $('#tabs').children) x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
});
document.addEventListener('keydown', e => {
  if(screen !== 'sim' || dlg.open) return;
  if(e.code === 'Space' && !e.target.closest('input,textarea,button,select')){ e.preventDefault(); $('#btnPlay').click(); }
});
document.addEventListener('visibilitychange', () => {
  if(document.hidden){ clock.pause(); if(state) save(true); }
});
window.addEventListener('pagehide', () => { if(state) save(true); });

// ── 정리 화면 ─────────────────────────────────
let reportReadonly = false;
function openReport(s, readonly = false){
  reportReadonly = readonly;
  show('report');
  $('#btnRestart').textContent = readonly ? '돌아가기' : '처음부터 다시';
  renderReport($('#report'), s, {
    readonly,
    onOpen:id => openDecision(byId[id], {}),
    onPromise:text => { state.promise = text; save(); },
    onBack:() => { $('#btnRestart').textContent = '처음부터 다시'; readonly ? openSetup() : startSim(false); },
    toast,
  });
}

// ── 알림 ─────────────────────────────────────
let toastTimer = 0;
function toast(msg){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}

// 고정된 머리 높이를 CSS 에 알려 줘요 (오른쪽 패널·모바일 탭이 그 아래에 붙게)
new ResizeObserver(([e]) => document.documentElement.style.setProperty('--head-h', Math.round(e.target.getBoundingClientRect().height) + 'px')).observe($('.sim-head'));

// ── 시작 ─────────────────────────────────────
if(state && state.v === 5){
  state.finished ? openReport(state) : startSim(false);
} else {
  state = null;
  openSetup();
}
