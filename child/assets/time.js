// 시점 표기: t → "임신 23주" / "생후 7개월" / "첫돌", 출산 예정일이 있으면 실제 날짜
import { PREG_START, BIRTH_T, END_T } from './events.js?v=20261111s';

export function stageLabel(t){
  const i = Math.floor(t + 1e-6);
  if(i < BIRTH_T) return `임신 ${i + PREG_START}주`;
  const m = i - BIRTH_T;
  if(m === 0) return '출산 · 신생아';
  if(m >= END_T - BIRTH_T) return '만 3세';
  if(m === 12) return '첫돌 · 12개월';
  if(m === 24) return '두 돌 · 24개월';
  return `생후 ${m}개월`;
}

// due: 'YYYY-MM-DD'. 임신 N주 = 예정일 − (40−N)주, 생후 N개월 = 예정일 + N개월
export function dateAt(due, t){
  const [y, mo, d] = due.split('-').map(Number);
  const i = Math.floor(t + 1e-6);
  if(i <= BIRTH_T) return new Date(y, mo - 1, d - (BIRTH_T - i) * 7);
  return new Date(y, mo - 1 + (i - BIRTH_T), d);
}
export function dateText(due, t){
  if(!due) return '';
  const dt = dateAt(due, t);
  if(isNaN(dt)) return '';
  return `${dt.getFullYear()}.${dt.getMonth() + 1}.${dt.getDate()}`;
}
