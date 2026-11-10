// 예산 계산 — 고른 선택지로 지출·지원 장부(ledger)를 만들고 합계를 내요.
import { EVENTS, DECISIONS, BIRTH_T, END_T, PHASES, phaseOf, atToT } from './events.js';

// 매달 들어오는 지원금 (생후 개월 기준, 끝 포함)
//   부모급여: 0세 월 100만, 1세 월 50만. 어린이집을 다니면 1세 부모급여는 보육료 바우처로 나가서 현금은 0원으로 봐요.
//   아동수당: 만 3세까지 월 10만 (실제로는 더 오래 받아요)
function monthlySupports(state){
  const care = state.decisions.care?.choice;
  const list = [];
  for(let m = 0; m <= 35; m++){
    if(m <= 11) list.push({ m, amount:1000000, label:'부모급여' });
    else if(m <= 23 && !(care === 'daycare' && m >= 13)) list.push({ m, amount:500000, label:'부모급여' });
    list.push({ m, amount:100000, label:'아동수당' });
  }
  return list;
}

// 고르지 않아도 매달 드는 기본 육아 생활비 (물티슈·세제·위생용품, 병원·약값, 먹거리·간식 등)
export const BASE_COSTS = [
  { label:'기본 육아 생활비 (0세)', note:'물티슈·세제·위생용품, 병원·약값', monthly:250000, span:[0,11] },
  { label:'기본 육아 생활비 (1~2세)', note:'먹거리·간식, 위생용품, 병원·약값', monthly:350000, span:[12,35] },
];

export function optionOf(ev, choiceId){
  return ev.options?.find(o => o.id === choiceId) || null;
}

// 장부 한 줄: { t, amount, kind:'cost'|'support', label, eventId, mode }
export function ledger(state){
  const rows = [];
  for(const ev of EVENTS){
    if(ev.cost) rows.push({ t:ev.t, amount:ev.cost, kind:'cost', label:ev.title, eventId:ev.id });
    if(ev.support) rows.push({ t:ev.t, amount:ev.support.amount, kind:'support', label:ev.support.label, eventId:ev.id });
  }
  for(const ev of DECISIONS){
    const rec = state.decisions[ev.id];
    const opt = rec && optionOf(ev, rec.choice);
    if(!opt) continue;
    const payT = ev.payAt ? atToT(ev.payAt) : ev.t;
    if(opt.once) rows.push({ t:payT, amount:opt.once, kind:'cost', label:`${ev.title} · ${opt.label}`, eventId:ev.id, mode:opt.mode });
    if(opt.monthly && opt.span){
      for(let m = opt.span[0]; m <= opt.span[1]; m++){
        rows.push({ t:BIRTH_T + m, amount:opt.monthly, kind:'cost', label:`${ev.title} · ${opt.label}`, eventId:ev.id, mode:opt.mode, monthly:true });
      }
    }
  }
  for(const b of BASE_COSTS){
    for(let m = b.span[0]; m <= b.span[1]; m++) rows.push({ t:BIRTH_T + m, amount:b.monthly, kind:'cost', label:b.label, monthly:true, base:true });
  }
  for(const s of monthlySupports(state)){
    rows.push({ t:BIRTH_T + s.m, amount:s.amount, kind:'support', label:s.label, monthly:true });
  }
  return rows;
}

export function totals(state, upToT = END_T){
  const rows = ledger(state);
  const out = { cost:0, support:0, costNow:0, supportNow:0, phases:{}, modes:{ new:0, used:0, gift:0 }, modeCount:{ new:0, used:0, gift:0 } };
  for(const p of PHASES) out.phases[p.id] = { cost:0, support:0 };
  for(const r of rows){
    const ph = phaseOf(r.t).id;
    out[r.kind] += r.amount;
    out.phases[ph][r.kind] += r.amount;
    if(r.t <= upToT) out[r.kind + 'Now'] += r.amount;
    if(r.kind === 'cost' && r.mode && out.modes[r.mode] !== undefined) out.modes[r.mode] += r.amount;
  }
  // 새것/당근/물려받기 개수는 '살 것' 결정만 셉니다
  for(const ev of DECISIONS){
    if(ev.type !== 'buy') continue;
    const opt = optionOf(ev, state.decisions[ev.id]?.choice);
    if(opt?.mode && out.modeCount[opt.mode] !== undefined) out.modeCount[opt.mode]++;
  }
  out.net = out.cost - out.support;
  out.netNow = out.costNow - out.supportNow;
  return out;
}

// 선택지 한 줄 가격 설명: "120만 원" · "월 10만 원 (생후 0~23개월)"
export function priceText(opt){
  const parts = [];
  if(opt.once) parts.push(won(opt.once));
  if(opt.monthly) parts.push(`월 ${won(opt.monthly)} (생후 ${opt.span[0]}~${opt.span[1]}개월)`);
  if(opt.after) parts.push(`만 3세 이후 월 ${won(opt.after)}`);
  if(!parts.length) return opt.once === 0 ? '0원' : '추가 비용 없음';
  return parts.join(' + ');
}

// 선택지 하나의 36개월 총비용
export function optionTotal(opt){
  if(!opt) return 0;
  let s = opt.once || 0;
  if(opt.monthly && opt.span) s += opt.monthly * (opt.span[1] - opt.span[0] + 1);
  return s;
}

// 금액 표기: 1,234,000 → "123만 4천 원" 대신 읽기 쉽게 "123.4만 원"
export function won(n, unit = true){
  const sign = n < 0 ? '-' : '';
  n = Math.abs(Math.round(n));
  let s;
  if(n >= 100000000){
    const eok = Math.floor(n / 100000000);
    const man = Math.round((n % 100000000) / 10000);
    s = man ? `${eok}억 ${man.toLocaleString('ko-KR')}만` : `${eok}억`;
  } else if(n >= 10000){
    const man = n / 10000;
    s = `${Number.isInteger(man) ? man.toLocaleString('ko-KR') : man.toLocaleString('ko-KR', { maximumFractionDigits:1 })}만`;
  } else {
    s = n.toLocaleString('ko-KR');
  }
  return sign + s + (unit ? ' 원' : '');
}

export function afterMonthly(state){
  let s = 0;
  for(const ev of DECISIONS){
    const opt = optionOf(ev, state.decisions[ev.id]?.choice);
    if(opt?.after) s += opt.after;
  }
  return s;
}

// 당근·물려받기로 아낀 돈: 같은 물건의 가장 싼 새것과 비교해요
export function savings(state){
  let s = 0;
  for(const ev of DECISIONS){
    if(ev.type !== 'buy') continue;
    const opt = optionOf(ev, state.decisions[ev.id]?.choice);
    if(!opt || (opt.mode !== 'used' && opt.mode !== 'gift')) continue;
    const news = ev.options.filter(o => o.mode === 'new').map(optionTotal);
    if(news.length) s += Math.max(0, Math.min(...news) - optionTotal(opt));
  }
  return s;
}
