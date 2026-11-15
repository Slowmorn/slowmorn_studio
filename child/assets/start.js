// 시작 정보 — 소개 페이지의 시작 폼과 시뮬레이터가 같이 써요. 기록은 이 브라우저(localStorage)에만 남아요.
export const KEY = 'child-sim-v1';
export const ARCHIVE_KEY = 'child-sim-archive-v1';

export function load(key){ try { return JSON.parse(localStorage.getItem(key)); } catch(e){ return null; } }
export function store(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){} }
export function remove(key){ try { localStorage.removeItem(key); } catch(e){} }

export function newState(form){
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

// 하나라도 정한 게 있으면 '지난 시뮬레이션'에 보관해요 (최근 5개)
export function archive(state){
  if(!state || !Object.keys(state.decisions || {}).length) return;
  const list = load(ARCHIVE_KEY) || [];
  list.unshift({ savedAt:new Date().toISOString(), state });
  store(ARCHIVE_KEY, list.slice(0, 5));
}
