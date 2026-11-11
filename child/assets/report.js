// 정리 화면 — 우리 부부의 육아 계획서. 인쇄(PDF 저장)와 텍스트 복사를 지원해요.
import { EVENTS, DECISIONS, PHASES, MODE_LABEL, END_T, evTitle, byId } from './events.js?v=20261111q';
import { sceneImage } from './pixel.js?v=20261111q';
import { ultrasound, ULTRA_LABEL, ULTRA_WEEK } from './ultra.js?v=20261111q';
import { totals, optionOf, optionTotal, won, afterMonthly, BASE_COSTS, BASE_TWIN, BASE_NOTE, eff, spanText, monthCount } from './budget.js?v=20261111q';
import { stageLabel, dateText } from './time.js?v=20261111q';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const statusText = s => s === 'hold' ? '보류' : '합의';

export function renderReport(root, state, { readonly, onOpen, onPromise, onBack, toast }){
  const tt = totals(state);
  const after = afterMonthly(state);
  const rec = id => state.decisions[id];
  const when = t => `${stageLabel(t)}${state.due ? ` <span class="r-date">${dateText(state.due, t)}</span>` : ''}`;
  const holds = DECISIONS.filter(ev => rec(ev.id)?.status === 'hold');
  const undecided = DECISIONS.filter(ev => !rec(ev.id));
  const agreed = type => DECISIONS.filter(ev => ev.type === type && rec(ev.id)?.status === 'agree' && eff(ev, optionOf(ev, rec(ev.id).choice), state.twins));
  const edu = agreed('edu');
  const bigChoices = agreed('choice');
  const cares = agreed('care');
  const husband = state.names[1] || '남편';
  const principle = ev => { const r = rec(ev.id); const o = eff(ev, optionOf(ev, r.choice), state.twins);
    return `<li><span class="r-q">${esc(evTitle(ev, state.twins))}</span><b>${esc(o.label)}</b>${o.once || o.monthly ? `<span class="r-meta">${won(optionTotal(o))}</span>` : ''}${r.memo ? `<em>“${esc(r.memo)}”</em>` : ''}</li>`; };
  const gearEv = byId.gear, gearRec = rec('gear');
  const gear = gearRec && eff(gearEv, optionOf(gearEv, gearRec.choice), state.twins);
  const todos = EVENTS.filter(ev => ev.type === 'todo');
  const monthlyRows = DECISIONS.map(ev => ({ ev, opt:eff(ev, optionOf(ev, rec(ev.id)?.choice), state.twins) })).filter(x => x.opt?.monthly);
  const reached = state.finished ? '만 3세까지' : `${stageLabel(state.t)}까지`;

  root.innerHTML = `
  <div class="r-wrap">
    <header class="r-head">
      <img class="r-scene" alt="" src="${sceneImage(Math.min(state.t, END_T - 1), state.twins)}">
      <p class="kicker">${esc(state.names.join(' · '))}${state.baby ? ` · ${esc(state.baby)}` : ''}${state.twins ? ' · 쌍둥이' : ''}의 육아 계획</p>
      <h1>${state.finished ? '만 3세까지 같이 살아 봤어요' : `${esc(stageLabel(state.t))}까지 살아 봤어요`}</h1>
      <p class="lead">${new Date(state.createdAt).toLocaleDateString('ko-KR')}에 시작 · 결정 ${DECISIONS.length - undecided.length}/${DECISIONS.length}개${holds.length ? ` · 보류 ${holds.length}개` : ''}</p>
      <div class="r-actions no-print">
        <button type="button" class="btn-primary" data-r="print">인쇄 · PDF로 저장</button>
        <button type="button" class="btn-ghost" data-r="copy">텍스트로 복사</button>
        <button type="button" class="btn-ghost" data-r="back">${readonly ? '돌아가기' : state.finished ? '시뮬레이션 다시 보기' : '이어서 하기'}</button>
      </div>
    </header>

    <section class="r-sec r-summary">
      <div class="big"><span>만 3세까지 실제 부담 (예상)</span><b>${tt.net >= 0 ? won(tt.net) : '0원'}</b>
        <small>${tt.net < 0 ? `지원금이 지출보다 ${won(-tt.net)} 더 많아요 · ` : ''}지출 ${won(tt.cost)} − 지원금 ${won(tt.support)}</small></div>
      <dl>
        ${PHASES.map(p => `<div><dt>${p.label}</dt><dd>${won(tt.phases[p.id].cost - tt.phases[p.id].support)}</dd></div>`).join('')}
      </dl>
      <p class="note">
        ${after ? `만 3세 이후에는 고른 기관 기준으로 매달 약 <b>${won(after)}</b>이 더 들 거예요. ` : ''}
        ${undecided.length || holds.length ? `정하지 않았거나 보류한 ${undecided.length + holds.length}개는 금액에서 빠져 있어요.` : ''}
      </p>
    </section>

    ${state.t >= 2 ? `
    <section class="r-sec">
      <h2>초음파 앨범</h2>
      <div class="r-album">${['sac', 'nt', 'detail'].filter(k => state.t >= ULTRA_WEEK[k] - 4).map(k => `
        <figure><img alt="${ULTRA_LABEL[k]} (그림)" src="${ultrasound(k, { seed:state.id, twins:state.twins, week:ULTRA_WEEK[k], name:state.baby })}"><figcaption>${ULTRA_LABEL[k]}</figcaption></figure>`).join('')}
      </div>
      <p class="note">실제 초음파 사진이 아니라 시기에 맞춰 그려 본 그림이에요.</p>
    </section>` : ''}

    <section class="r-sec">
      <h2>우리가 정한 키우는 방향</h2>
      ${edu.length ? `<ul class="r-principles">${edu.map(principle).join('')}</ul>` : '<p class="note">아직 합의한 방향이 없어요.</p>'}
      <label class="promise">
        <span>우리 둘의 한 줄 약속</span>
        ${readonly
          ? `<p>${state.promise ? esc(state.promise) : '<span class="note">남기지 않았어요</span>'}</p>`
          : `<textarea rows="2" maxlength="200" placeholder="예: 서로의 쉬는 시간을 지켜 주고, 아이 앞에서는 같은 목소리를 내기">${esc(state.promise || '')}</textarea>`}
      </label>
    </section>

    ${bigChoices.length ? `
    <section class="r-sec">
      <h2>우리가 정한 큰 선택</h2>
      <ul class="r-principles">${bigChoices.map(principle).join('')}</ul>
    </section>` : ''}

    ${cares.length ? `
    <section class="r-sec">
      <h2>${esc(husband)}의 약속</h2>
      <p class="note">아내가 힘들 때 ${esc(husband)} 님이 하기로 한 일이에요.</p>
      <ul class="r-principles">${cares.map(ev => { const rr = rec(ev.id); const o = optionOf(ev, rr.choice);
        return `<li><span class="r-q">${esc(evTitle(ev, state.twins))}</span><ul class="r-picks">${(o.labels || [o.label]).map(l => `<li>${esc(l)}</li>`).join('')}</ul>${rr.memo ? `<em>“${esc(rr.memo)}”</em>` : ''}</li>`; }).join('')}</ul>
    </section>` : ''}

    ${holds.length || undecided.length ? `
    <section class="r-sec">
      <h2>아직 이야기가 더 필요해요</h2>
      <ul class="r-holds">${[...holds, ...undecided].map(ev => `
        <li><span class="r-when">${when(ev.t)}</span><b>${esc(evTitle(ev, state.twins))}</b>
          <span class="status ${rec(ev.id) ? 'hold' : 'none'}">${rec(ev.id) ? '보류' : '안 정함'}</span>
          ${rec(ev.id)?.memo ? `<em>“${esc(rec(ev.id).memo)}”</em>` : ''}
          ${readonly ? '' : `<button type="button" class="btn-small no-print" data-open="${ev.id}">지금 이야기하기</button>`}</li>`).join('')}
      </ul>
    </section>` : ''}

    <section class="r-sec">
      <h2>육아용품 예산</h2>
      ${gear ? `<div class="r-gear">
        <b>${won(gear.once)}</b>
        <span class="mode mode-${gear.mode}">${MODE_LABEL[gear.mode]}</span>${gearRec.status === 'hold' ? '<span class="status hold">보류</span>' : ''}
        <p>${esc(gear.note)}</p>
        ${gearRec.memo ? `<em>“${esc(gearRec.memo)}”</em>` : ''}
        <small>임신 30주쯤 55%, 생후 4개월 20%, 생후 14개월 25%로 나눠 쓰는 걸로 잡았어요.</small>
      </div>` : `<p class="note">${gearRec ? '보류했어요' : '아직 정하지 않았어요'}.</p>`}
      <a class="ext-link no-print" href="${esc(gearEv.link.href)}" target="_blank" rel="noopener">${esc(gearEv.link.label)} <span aria-hidden="true">→</span></a>
    </section>

    <section class="r-sec">
      <h2>매달 나가는 돈</h2>
      <table class="r-table">
        <thead><tr><th>항목</th><th>선택</th><th>기간</th><th class="num">한 달</th><th class="num">합계</th></tr></thead>
        <tbody>${BASE_COSTS.map(b => `<tr><td>${esc(b.label)}</td><td class="note">${esc(b.note)}</td>
          <td>생후 ${b.span[0]}~${b.span[1]}개월</td><td class="num">${won(b.monthly * (state.twins ? BASE_TWIN : 1))}</td><td class="num">${won(b.monthly * (state.twins ? BASE_TWIN : 1) * (b.span[1] - b.span[0] + 1))}</td></tr>`).join('')}${monthlyRows.map(({ ev, opt }) => `<tr><td>${esc(evTitle(ev, state.twins))}</td><td>${esc(opt.label)}</td>
          <td>${spanText(opt)}</td><td class="num">${won(opt.monthly)}</td><td class="num">${won(opt.monthly * monthCount(opt))}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section class="r-sec">
      <h2>시기별 예산</h2>
      <table class="r-table">
        <thead><tr><th>구간</th><th class="num">지출</th><th class="num">지원금</th><th class="num">실제 부담</th></tr></thead>
        <tbody>${PHASES.map(p => { const x = tt.phases[p.id]; return `<tr><td>${p.label}</td><td class="num">${won(x.cost)}</td><td class="num good">−${won(x.support)}</td><td class="num"><b>${won(x.cost - x.support)}</b></td></tr>`; }).join('')}
          <tr class="sum"><td>합계</td><td class="num">${won(tt.cost)}</td><td class="num good">−${won(tt.support)}</td><td class="num"><b>${won(tt.net)}</b></td></tr>
        </tbody>
      </table>
      <p class="note">지원금: 국민행복카드 100만 원, 첫만남이용권 200만 원, 부모급여(0세 월 100만 원 · 1세 월 50만 원, 어린이집 이용 시 보육료로 대신 지급), 아동수당 월 10만 원을 넣었어요. 지출에는 ${BASE_NOTE}가 들어 있어요.${state.twins ? ` 쌍둥이라 지원금은 아이마다, 생활비는 ${BASE_TWIN}배로 잡았어요.` : ''}</p>
    </section>

    <section class="r-sec">
      <h2>시기별 할 일</h2>
      <ul class="r-todos">${todos.map(ev => ev.items ? ev.items.map(([k, label]) => { const on = state.todos[`${ev.id}:${k}`];
          return `<li class="${on ? 'done' : ''}"><span class="box" aria-hidden="true">${on ? '✓' : ''}</span>
        <span class="r-when">${when(ev.t)} · 아빠</span><b>${esc(label)}</b></li>`; }).join('') : `<li class="${state.todos[ev.id] ? 'done' : ''}">
        <span class="box" aria-hidden="true">${state.todos[ev.id] ? '✓' : ''}</span>
        <span class="r-when">${when(ev.t)}</span><b>${esc(evTitle(ev, state.twins))}</b></li>`).join('')}
      </ul>
    </section>

    <section class="r-sec">
      <h2>선택 기록 전체</h2>
      <ol class="r-log">${DECISIONS.filter(ev => rec(ev.id)).map(ev => {
        const r = rec(ev.id);
        return `<li><div class="r-log-head"><span class="r-when">${when(ev.t)}</span><b>${esc(evTitle(ev, state.twins))}</b></div>
          <ol>${r.history.map(h => { const o = eff(ev, optionOf(ev, h.choice), state.twins); return `<li>
            <span class="status ${h.status}">${statusText(h.status)}</span>${o ? esc(o.label) : '고르지 않음'}
            <span class="r-meta">${new Date(h.ts).toLocaleString('ko-KR', { year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })} · ${stageLabel(h.t)}에 기록</span>
            ${h.memo ? `<em>“${esc(h.memo)}”</em>` : ''}</li>`; }).join('')}</ol></li>`;
      }).join('') || '<li class="note">아직 기록이 없어요.</li>'}</ol>
    </section>

    <p class="note r-foot">금액과 제도는 2026년 기준 참고용 추정치예요. 지역·병원·브랜드에 따라 달라요. · 미리 키움 slowmorn.com/child</p>
  </div>`;

  root.querySelector('[data-r="print"]').onclick = () => window.print();
  root.querySelector('[data-r="back"]').onclick = onBack;
  root.querySelector('[data-r="copy"]').onclick = async () => {
    const text = plainText(state);
    try { await navigator.clipboard.writeText(text); toast('복사했어요. 메모 앱이나 메신저에 붙여 넣으세요.'); }
    catch(e){ toast('복사하지 못했어요. 인쇄 · PDF로 저장을 이용해 주세요.'); }
  };
  const ta = root.querySelector('.promise textarea');
  if(ta) ta.addEventListener('input', () => onPromise(ta.value));
  // 보류 항목 다시 이야기하기는 app.js 의 공통 [data-open] 클릭 처리로 열려요
}

export function plainText(state){
  const tt = totals(state);
  const rec = id => state.decisions[id];
  const L = [];
  L.push(`[미리 키움] ${state.names.join(' · ')}${state.baby ? ` · ${state.baby}` : ''}${state.twins ? ' · 쌍둥이' : ''}의 육아 계획`);
  L.push(`만 3세까지 실제 부담(예상): ${won(tt.net)} (지출 ${won(tt.cost)} − 지원금 ${won(tt.support)})`);
  L.push('');
  L.push('■ 키우는 방향');
  for(const ev of DECISIONS.filter(e => e.type === 'edu' || e.type === 'choice')){
    const r = rec(ev.id); const o = r && eff(ev, optionOf(ev, r.choice), state.twins);
    L.push(`- ${evTitle(ev, state.twins)}: ${o ? o.label : '미정'}${r?.status === 'hold' ? ' (보류)' : ''}${r?.memo ? ` — ${r.memo}` : ''}`);
  }
  if(state.promise) L.push(`- 우리 둘의 약속: ${state.promise}`);
  L.push('');
  const gr = rec('gear'); const go = gr && eff(byId.gear, optionOf(byId.gear, gr.choice), state.twins);
  L.push(`■ 육아용품 예산: ${go ? `${won(go.once)} (${MODE_LABEL[go.mode]})${gr.status === 'hold' ? ' (보류)' : ''}` : '미정'}`);
  const careList = DECISIONS.filter(e => e.type === 'care');
  if(careList.some(e => rec(e.id))){
    L.push('');
    L.push(`■ ${state.names[1] || '남편'}의 약속`);
    for(const ev of careList){
      const r = rec(ev.id); const o = r && eff(ev, optionOf(ev, r.choice), state.twins);
      if(o) L.push(`- ${evTitle(ev, state.twins)}: ${o.label}${r.memo ? ` — ${r.memo}` : ''}`);
    }
  }
  L.push('');
  L.push('■ 시기별 할 일');
  for(const ev of EVENTS.filter(e => e.type === 'todo')){
    const at = `${stageLabel(ev.t)}${state.due ? ` (${dateText(state.due, ev.t)})` : ''}`;
    if(ev.items){
      L.push(`    ${at} ${evTitle(ev, state.twins)}`);
      for(const [k, label] of ev.items) L.push(`${state.todos[`${ev.id}:${k}`] ? '[v]' : '[ ]'}   - ${label}`);
    } else L.push(`${state.todos[ev.id] ? '[v]' : '[ ]'} ${at} ${evTitle(ev, state.twins)}`);
  }
  L.push('');
  L.push('금액은 2026년 기준 참고용 추정치 · slowmorn.com/child');
  return L.join('\n');
}
