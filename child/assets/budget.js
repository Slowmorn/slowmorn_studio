// 예산 계산 — 고른 선택지로 지출·지원 장부(ledger)를 만들고 합계를 내요.
import { EVENTS, DECISIONS, BIRTH_T, END_T, PHASES, phaseOf, atToT } from './events.js?v=20261117n';

// 매달 들어오는 지원금 (생후 개월 기준, 끝 포함)
//   부모급여: 0세 월 100만, 1세 월 50만. 어린이집을 다니면 1세 부모급여는 보육료 바우처로 나가서 현금은 0원으로 봐요.
//   아동수당: 만 3세까지 월 10만 (실제로는 더 오래 받아요)
//   쌍둥이면 아이마다 받아서 × 2
function monthlySupports(state){
  const care = state.decisions.care?.choice;
  const k = state.twins ? 2 : 1;
  const list = [];
  for(let m = 0; m <= 35; m++){
    if(m <= 11) list.push({ m, amount:1000000 * k, label:'부모급여' });
    else if(m <= 23 && !(care === 'daycare' && m >= 13)) list.push({ m, amount:500000 * k, label:'부모급여' });
    list.push({ m, amount:100000 * k, label:'아동수당' });
  }
  return list;
}

// 쌍둥이를 반영한 선택지 (금액·이름). 화면에 보이는 값은 모두 이걸 거쳐요
export function eff(ev, opt, twins){
  if(!opt || !twins) return opt;
  const k = ev.perChild ? 2 : 1;
  return {
    ...opt,
    label: opt.twinLabel || opt.label,
    once: opt.twinOnce ?? (opt.once ? opt.once * k : opt.once),
    monthly: opt.twinMonthly ?? (opt.monthly ? opt.monthly * k : opt.monthly),
    after: opt.after ? opt.after * k : opt.after,
    pre: opt.twinPre ?? opt.pre,
  };
}
export const BASE_TWIN = 1.8;   // 쌍둥이 기본 생활비 배수 (물려 쓰고 같이 쓰는 게 있어서 2배보다 조금 적게)

// 고르지 않아도 매달 드는 기본 육아 생활비 (기저귀·물티슈·위생용품, 병원·약값, 먹거리·간식 등)
export const BASE_COSTS = [
  { label:'기본 육아 생활비 (0세)', note:'기저귀·물티슈·위생용품, 병원·약값', monthly:330000, span:[0,11] },
  { label:'기본 육아 생활비 (1세)', note:'기저귀, 먹거리·간식, 병원·약값', monthly:410000, span:[12,23] },
  { label:'기본 육아 생활비 (2세)', note:'먹거리·간식, 위생용품, 병원·약값', monthly:350000, span:[24,35] },
];
export const BASE_NOTE = '임신 중 영양제(초기 월 5만 · 16주부터 월 10만 원)와 기본 육아 생활비(기저귀 포함, 0세 월 33만 · 1세 월 41만 · 2세 월 35만 원)';

export function optionOf(ev, choiceId){
  // 여러 개 고르는 결정(남편 차례)은 고른 것들을 한 줄로 묶어서 돌려줘요
  if(Array.isArray(choiceId)){
    const picked = ev.options?.filter(o => choiceId.includes(o.id)) || [];
    if(!picked.length) return null;
    return { id:choiceId.join(','), label:picked.map(o => o.label).join(' · '), labels:picked.map(o => o.label), note:'' };
  }
  return ev.options?.find(o => o.id === choiceId) || null;
}

// 장부 한 줄: { t, amount, kind:'cost'|'support', label, eventId, mode, bookT? }
//   t 는 실제로 돈이 나가는 때, bookT 는 '지금까지' 에 더하기 시작하는 때예요.
//   결정의 일회성 비용은 나중에 내더라도 고른 순간 지출로 잡아요 (고르면 바로 예산이 늘어나 보이게).
//   매달 나가는 돈과 지원금은 그달이 될 때마다 더해져요.
export function ledger(state){
  const rows = [];
  for(const ev of EVENTS){
    if(ev.cost) rows.push({ t:ev.t, amount:ev.cost, kind:'cost', label:ev.title, eventId:ev.id });
    // 임신 중 매달 드는 돈 (영양제처럼 고르지 않아도 드는 것): 그 주부터 4주마다, until 또는 출산까지
    if(ev.monthly){
      const end = ev.until ? atToT(ev.until) : BIRTH_T;
      for(let t = ev.t; t < end - 1e-6; t += 4) rows.push({ t, amount:ev.monthly, kind:'cost', label:ev.title, eventId:ev.id, monthly:true, base:true });
    }
    if(ev.support) rows.push({ t:ev.t, amount:state.twins && ev.support.twinAmount ? ev.support.twinAmount : ev.support.amount, kind:'support', label:ev.support.label, eventId:ev.id });
  }
  for(const ev of DECISIONS){
    const rec = state.decisions[ev.id];
    if(!rec || rec.status === 'hold') continue;              // 보류한 결정은 예산에서 빼요
    const opt = eff(ev, optionOf(ev, rec.choice), state.twins);
    if(!opt) continue;
    const payT = ev.payAt ? atToT(ev.payAt) : ev.t;
    const decidedT = rec.t ?? ev.t;
    const book = t => Math.min(t, decidedT);
    if(opt.once && ev.payPlan){
      // 오래 걸쳐 사는 것은 나눠서: 마지막 몫에 반올림 차이를 몰아요
      let left = opt.once;
      ev.payPlan.forEach(([at, ratio], k) => {
        const amount = k === ev.payPlan.length - 1 ? left : Math.round(opt.once * ratio);
        left -= amount;
        rows.push({ t:atToT(at), bookT:book(atToT(at)), amount, kind:'cost', label:`${ev.title} · ${opt.label}`, eventId:ev.id, mode:opt.mode });
      });
    } else if(opt.once) rows.push({ t:payT, bookT:book(payT), amount:opt.once, kind:'cost', label:`${ev.title} · ${opt.label}`, eventId:ev.id, mode:opt.mode });
    if(opt.monthly && opt.pre){
      // 임신 중에도 매달 나가는 돈 (태아보험처럼 가입한 달부터): 결정 시점에서 출산까지 고르게 나눠요
      const step = (BIRTH_T - ev.t) / opt.pre;
      for(let k = 0; k < opt.pre; k++){
        rows.push({ t:ev.t + k * step, amount:opt.monthly, kind:'cost', label:`${ev.title} · ${opt.label}`, eventId:ev.id, mode:opt.mode, monthly:true });
      }
    }
    if(opt.monthly && opt.span){
      for(let m = opt.span[0]; m <= opt.span[1]; m++){
        rows.push({ t:BIRTH_T + m, amount:opt.monthly, kind:'cost', label:`${ev.title} · ${opt.label}`, eventId:ev.id, mode:opt.mode, monthly:true });
      }
    }
  }
  for(const b of BASE_COSTS){
    const amount = state.twins ? Math.round(b.monthly * BASE_TWIN) : b.monthly;
    for(let m = b.span[0]; m <= b.span[1]; m++) rows.push({ t:BIRTH_T + m, amount, kind:'cost', label:b.label, monthly:true, base:true });
  }
  for(const s of monthlySupports(state)){
    rows.push({ t:BIRTH_T + s.m, amount:s.amount, kind:'support', label:s.label, monthly:true });
  }
  return rows;
}

export function totals(state, upToT = END_T){
  const rows = ledger(state);
  const out = { cost:0, support:0, costNow:0, supportNow:0, phases:{}, phasesNow:{} };
  for(const p of PHASES){ out.phases[p.id] = { cost:0, support:0 }; out.phasesNow[p.id] = { cost:0, support:0 }; }
  for(const r of rows){
    const ph = phaseOf(r.t).id;
    out[r.kind] += r.amount;
    out.phases[ph][r.kind] += r.amount;
    const bt = r.bookT ?? r.t;
    // '지금까지' 는 지출로 잡은 때의 시기에 넣어요 (임신 중에 고른 분만비는 임신기 막대에)
    if(bt <= upToT + 1e-6){ out[r.kind + 'Now'] += r.amount; out.phasesNow[phaseOf(bt).id][r.kind] += r.amount; }
  }
  out.net = out.cost - out.support;
  out.netNow = out.costNow - out.supportNow;
  return out;
}

// 선택지 한 줄 가격 설명: "120만 원" · "월 10만 원 (생후 0~23개월)"
export function priceText(opt){
  const parts = [];
  if(opt.once) parts.push(won(opt.once));
  if(opt.monthly) parts.push(`월 ${won(opt.monthly)} (${spanText(opt)})`);
  if(opt.after) parts.push(`만 3세 이후 월 ${won(opt.after)}`);
  if(!parts.length) return opt.once === 0 ? '0원' : '추가 비용 없음';
  return parts.join(' + ');
}

// 선택지 하나의 36개월 총비용
export function optionTotal(opt){
  if(!opt) return 0;
  let s = opt.once || 0;
  if(opt.monthly) s += opt.monthly * monthCount(opt);
  return s;
}
// 매달 나가는 기간: 임신 중 개월(pre) + 생후 개월(span)
export function monthCount(opt){
  return (opt.pre || 0) + (opt.span ? opt.span[1] - opt.span[0] + 1 : 0);
}
export function spanText(opt){
  const after = opt.span ? `생후 ${opt.span[0]}~${opt.span[1]}개월` : '';
  return opt.pre ? `임신 중 ${opt.pre}개월 + ${after}` : after;
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
  return sign + s + (unit ? (n >= 10000 ? ' 원' : '원') : '');   // 0원, 5,000원 · 5만 원
}

export function afterMonthly(state){
  let s = 0;
  for(const ev of DECISIONS){
    const opt = eff(ev, optionOf(ev, state.decisions[ev.id]?.choice), state.twins);
    if(opt?.after) s += opt.after;
  }
  return s;
}
