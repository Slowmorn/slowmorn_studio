/* 룰러 배치 계산 — 화면(DOM)이나 3D(Three)는 모릅니다. 숫자만 다뤄요.
   좌표는 수납장 안쪽의 왼쪽-앞-바닥 모서리가 원점이고 단위는 cm 입니다.
   x 는 가로(오른쪽으로), y 는 높이(위로), z 는 깊이(안쪽으로) 방향이에요.
   상자 = { x, y, z, w, d, h }  (w 가로, d 깊이, h 높이) */

export const SNAP = 0.5;          // 끌 때 이 단위로 맞춰요
const EPS = 1e-6;                 // 소수 오차 때문에 딱 맞는 상자가 '겹친다'고 나오지 않게

export const snap = v => Math.round(v / SNAP) * SNAP;

// 회전(rot)은 0 아니면 1. 1 이면 가로와 깊이를 바꿔 놓아요
export function sizeOf(item, rot){
  return rot ? { w: item.d, d: item.w, h: item.h } : { w: item.w, d: item.d, h: item.h };
}

export function overlaps(a, b){
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS &&
         a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS &&
         a.z < b.z + b.d - EPS && b.z < a.z + a.d - EPS;
}

export function inside(box, cab){
  return box.x >= -EPS && box.y >= -EPS && box.z >= -EPS &&
         box.x + box.w <= cab.w + EPS && box.y + box.h <= cab.h + EPS && box.z + box.d <= cab.d + EPS;
}

// 바닥에서 본 면적이 겹치는지 (높이는 보지 않아요)
function footprintOverlaps(a, b){
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS &&
         a.z < b.z + b.d - EPS && b.z < a.z + a.d - EPS;
}

/* 이 자리(x, z)에 내려놓으면 어디에 얹히는지 — 아래에 깔린 상자들의 윗면 중 가장 높은 곳.
   위에 올릴 수 없는 상자(stackable:false)를 만나면 null (이 자리에는 못 놓아요) */
export function restY(box, placed){
  let y = 0, blocked = false;
  for(const p of placed){
    if(!footprintOverlaps(box, p)) continue;
    const top = p.y + p.h;
    if(top > y + EPS){ y = top; blocked = p.stackable === false; }
    else if(Math.abs(top - y) <= EPS && p.stackable === false) blocked = true;
  }
  return blocked ? null : y;
}

export function fits(box, placed, cab){
  return inside(box, cab) && !placed.some(p => overlaps(box, p));
}

/* 수납장에 처음 넣을 때 들어갈 자리를 찾아요.
   후보점은 원점과 이미 놓인 상자들의 오른쪽·안쪽·윗면 모서리. 낮은 곳 → 앞쪽 → 왼쪽 순으로 고르고,
   회전 두 방향을 다 시도해요. 못 찾으면 null */
export function findSpot(item, placed, cab){
  const xs = new Set([0]), zs = new Set([0]);
  for(const p of placed){ xs.add(p.x + p.w); xs.add(p.x); zs.add(p.z + p.d); zs.add(p.z); }
  let best = null;
  for(const rot of item.w === item.d ? [0] : [0, 1]){
    const s = sizeOf(item, rot);
    for(const x of xs) for(const z of zs){
      const box = { x, z, w: s.w, d: s.d, h: s.h };
      const y = restY(box, placed);
      if(y == null) continue;
      box.y = y;
      if(!fits(box, placed, cab)) continue;
      const key = [y, z, x, rot];
      if(!best || less(key, best.key)) best = { key, x, y, z, rot };
    }
  }
  return best && { x: best.x, y: best.y, z: best.z, rot: best.rot };
}

function less(a, b){
  for(let i = 0; i < a.length; i++){ if(a[i] < b[i] - EPS) return true; if(a[i] > b[i] + EPS) return false; }
  return false;
}

/* 끌어서 놓을 때의 '자석'.
   1) 벽이나 다른 상자의 모서리가 range cm 안에 있으면 그 줄에 딱 맞춰요 (옆에 붙이기, 끝선 맞추기)
   2) 다른 상자에 걸쳤을 뿐이면(겹친 바닥이 내 바닥의 절반보다 작으면) 위로 올리지 않고 옆으로 밀어내요.
      절반 넘게 겹치면 올려 쌓으려는 뜻으로 보고 그대로 둬요 (절반도 안 받치면 실제로도 넘어지니까요) */
export function magnet(box, others, cab, range = 3){
  const b = { ...box };
  const near = (v, cands) => {
    let best = v, gap = range;
    for(const c of cands){ const k = Math.abs(c - v); if(k < gap){ gap = k; best = c; } }
    return best;
  };
  const xs = [0, cab.w - b.w], zs = [0, cab.d - b.d];
  for(const p of others){
    xs.push(p.x + p.w, p.x - b.w, p.x, p.x + p.w - b.w);
    zs.push(p.z + p.d, p.z - b.d, p.z, p.z + p.d - b.d);
  }
  b.x = near(b.x, xs);
  b.z = near(b.z, zs);

  for(let round = 0; round < 3; round++){
    let pushed = false;
    for(const p of others){
      const ox = Math.min(b.x + b.w, p.x + p.w) - Math.max(b.x, p.x);
      const oz = Math.min(b.z + b.d, p.z + p.d) - Math.max(b.z, p.z);
      if(ox <= EPS || oz <= EPS || ox * oz >= b.w * b.d / 2) continue;
      // 덜 겹친 쪽으로, 상자 가운데에서 먼 방향으로 밀어요
      if(ox < oz) b.x += (b.x + b.w / 2 < p.x + p.w / 2) ? -ox : ox;
      else b.z += (b.z + b.d / 2 < p.z + p.d / 2) ? -oz : oz;
      pushed = true;
    }
    if(!pushed) break;
  }
  return b;
}

/* 상자를 빼거나 옮긴 뒤 떠 있는 상자를 아래로 내려요. 낮은 것부터 차례로 다시 얹습니다.
   여기서는 stackable 을 따지지 않아요 (떨어지는 상자는 받아 줘야 하니까요) */
export function settle(boxes){
  const done = [];
  for(const b of [...boxes].sort((a, c) => a.y - c.y)){
    let y = 0;
    for(const p of done) if(footprintOverlaps(b, p)) y = Math.max(y, p.y + p.h);
    b.y = y;
    done.push(b);
  }
  return boxes;
}

// 넣을 수 없을 때 이유 한 줄. 수납장보다 큰 치수가 있으면 그걸, 아니면 '남은 자리 부족'
export function whyNot(item, cab){
  const fitsRot = r => { const s = sizeOf(item, r); return s.w <= cab.w + EPS && s.d <= cab.d + EPS; };
  if(item.h > cab.h + EPS) return `높이가 ${fmt(item.h - cab.h)}cm 넘쳐요`;
  if(!fitsRot(0) && !fitsRot(1)){
    const over = Math.min(
      Math.max(item.w - cab.w, item.d - cab.d),
      Math.max(item.d - cab.w, item.w - cab.d));
    return `바닥이 ${fmt(over)}cm 커요`;
  }
  return "남은 자리가 모자라요";
}

// 빈 수납장에 한 개라도 들어가는지 (목록의 '들어가는 것만' 거르기)
export function fitsEmpty(item, cab){
  return findSpot(item, [], cab) != null;
}

// 빈 수납장에 몇 개까지 깔 수 있는지 — 같은 상자만 계속 넣어 보며 셉니다 (목록에 'n개 들어가요')
export function maxCount(item, cab, limit = 60){
  const placed = [];
  while(placed.length < limit){
    const spot = findSpot(item, placed, cab);
    if(!spot) break;
    placed.push({ ...spot, ...sizeOf(item, spot.rot), stackable: item.stackable });
  }
  return placed.length;
}

export const fmt = v => (Math.round(v * 10) / 10).toLocaleString("ko-KR");
