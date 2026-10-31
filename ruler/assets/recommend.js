/* 룰러 추천 — 수납장 치수와 종류(선반·서랍)에 맞춰 수납함 구성을 골라요. 화면은 모릅니다.

   수납장 종류
     shelf   선반: 앞에서 꺼내요. 쌓을 수 있는 함은 위로 쌓고, 서랍 케이스·앞이 열린 함·앞 손잡이를 좋게 봐요
     drawer  서랍: 위에서 내려다보며 꺼내요. 쌓지 않고 바닥에 한 층만 깔고, 뚜껑 있는 함은 덜 좋게 봐요.
             서랍 케이스는 서랍 안에 넣지 않아요
   구성
     one     한 상품만 여러 개
     two     같은 제품군의 두 크기 (큰 것을 먼저 깔고, 남은 자리에 작은 것)

   배치는 가로·깊이·높이로 줄을 맞춰 바둑판처럼 깔아요. 한 칸씩 빈자리를 찾는 것보다 훨씬 빠르고,
   실제로 정리할 때처럼 반듯하게 놓여요. 남는 띠(오른쪽·안쪽·위)에는 돌려서 한 번 더 채워 봐요 */
import { sizeOf } from "./pack.js";

const vol = it => it.w * it.d * it.h;
// 서랍 케이스는 서랍이 앞을 봐야 열려요. 돌려 놓지 않아요
const rotsOf = it => it.w === it.d || (it.shape && it.shape.kind === "drawer") ? [0] : [0, 1];

// 영역 R 안에 같은 상자를 rot 방향으로 바둑판처럼 깔아요
function block(item, rot, R, stack){
  const s = sizeOf(item, rot);
  const nx = Math.floor(R.w / s.w + 1e-6), nz = Math.floor(R.d / s.d + 1e-6);
  let ny = Math.floor(R.h / s.h + 1e-6);
  if(!stack || item.stackable === false) ny = Math.min(ny, 1);
  const boxes = [];
  if(nx && nz && ny){
    for(let iy = 0; iy < ny; iy++) for(let iz = 0; iz < nz; iz++) for(let ix = 0; ix < nx; ix++)
      boxes.push({ id: item.id, rot, x: R.x + ix * s.w, y: R.y + iy * s.h, z: R.z + iz * s.d });
  }
  return { boxes, used: { w: nx * s.w, d: nz * s.d, h: ny * s.h } };
}

// 큰 덩어리 하나 + 오른쪽이나 안쪽에 남은 띠를 돌려서 한 번 더. 가장 많이 들어가는 것을 골라요
function gridFill(item, R, stack){
  const rots = rotsOf(item);
  let best = [];
  for(const rot of rots){
    const main = block(item, rot, R, stack);
    if(!main.boxes.length) continue;
    const other = rots.length > 1 ? (rot ? 0 : 1) : rot;
    const right = block(item, other, { ...R, x: R.x + main.used.w, w: R.w - main.used.w }, stack).boxes;
    const back = block(item, other, { ...R, z: R.z + main.used.d, d: R.d - main.used.d, w: main.used.w }, stack).boxes;
    for(const extra of [[], right, back]){
      const all = main.boxes.concat(extra);
      if(all.length > best.length) best = all;
    }
  }
  return best;
}

// 수납장 종류에 얼마나 어울리는지 (점수에 곱하는 값)와 한 줄 이유. 안 어울리면 null
function suits(item, type){
  const s = item.shape || {};
  if(type === "drawer"){
    if(s.kind === "drawer") return null;
    if(s.lid) return { k: .82, why: "뚜껑은 빼고 쓰면 좋아요" };
    if(s.front && s.front.h < 1) return { k: 1, why: "칸막이처럼 나눠 담기 좋아요" };
    return { k: 1, why: "뚜껑 없이 위에서 바로 꺼내요" };
  }
  if(s.kind === "drawer") return { k: 1.18, why: "서랍처럼 앞으로 빼서 써요" };
  if(s.front && s.front.h < 1) return { k: 1.1, why: "앞이 열려 있어 꺼내기 쉬워요" };
  if(s.handles && s.handles.on === "front") return { k: 1.05, why: "앞 손잡이로 당겨 꺼내요" };
  if(s.lid && item.stackable !== false) return { k: 1, why: "뚜껑 덮고 위로 쌓아요" };
  return { k: .95, why: "선반에 나란히 두기 좋아요" };
}

/* 점수 = 채운 부피 비율 × 어울림 × 꺼내기 편함
   - 선반에서 앞줄 뒤에 또 줄이 있으면 뒤의 것은 꺼내기 어려워요. 줄마다 조금씩 깎아요
   - 자잘한 상자를 수십 개 사는 구성은 실제로 잘 안 골라요. 12개를 넘으면 조금씩 깎아요 */
function result(parts, boxes, cab, why, k, type){
  const volume = boxes.reduce((s, b) => s + vol(parts.find(p => p.item.id === b.id).item), 0);
  const fill = volume / (cab.w * cab.d * cab.h);
  const price = parts.reduce((s, p) => s + (p.item.price || 0) * p.n, 0);
  const rows = new Set(boxes.filter(b => b.y === 0).map(b => b.z)).size;
  const reach = type === "drawer" ? 1 : 1 / (1 + .15 * Math.max(0, rows - 1));
  const many = 1 / (1 + .012 * Math.max(0, boxes.length - 12));
  return { family: parts[0].item.family || parts[0].item.name, parts, boxes, fill, price, why, score: fill * k * reach * many };
}

/* items 가운데 cab 에 맞는 구성을 골라 점수 순으로 돌려줘요 (제품군마다 가장 좋은 것 하나씩, 최대 limit 개) */
export function recommend(items, cab, { type = "shelf", mode = "one", limit = 4 } = {}){
  const stack = type !== "drawer";
  const R = { x: 0, y: 0, z: 0, w: cab.w, d: cab.d, h: cab.h };
  const found = [];

  if(mode === "one"){
    for(const it of items){
      const fit = suits(it, type);
      if(!fit) continue;
      const boxes = gridFill(it, R, stack);
      if(boxes.length) found.push(result([{ item: it, n: boxes.length }], boxes, cab, fit.why, fit.k, type));
    }
  } else {
    const fams = new Map();
    for(const it of items){
      if(!suits(it, type)) continue;
      const key = it.family || it.name;
      fams.set(key, [...(fams.get(key) || []), it]);
    }
    for(const list of fams.values()){
      if(list.length < 2) continue;
      for(const A of list) for(const B of list){
        if(A === B || vol(A) <= vol(B)) continue;
        // 큰 것(A)을 덩어리로 깔고, 남은 오른쪽 띠 · 안쪽 띠 · 위쪽에 작은 것(B)
        for(const rot of rotsOf(A)){
          const main = block(A, rot, R, stack);
          if(!main.boxes.length) continue;
          const u = main.used;
          const rest = [
            { ...R, x: u.w, w: R.w - u.w },
            { ...R, z: u.d, d: R.d - u.d, w: u.w },
          ];
          if(stack && A.stackable !== false) rest.push({ x: 0, z: 0, y: u.h, w: u.w, d: u.d, h: R.h - u.h });
          const small = rest.flatMap(r => r.w > 0 && r.d > 0 && r.h > 0 ? gridFill(B, r, stack) : []);
          if(!small.length) continue;
          const fa = suits(A, type), fb = suits(B, type);
          const parts = [{ item: A, n: main.boxes.length }, { item: B, n: small.length }];
          found.push(result(parts, main.boxes.concat(small), cab, fa.why, (fa.k + fb.k) / 2, type));
        }
      }
    }
  }

  // 제품군마다 점수가 가장 높은 하나만, 점수가 같으면 싼 순
  const best = new Map();
  for(const r of found){
    const cur = best.get(r.family);
    if(!cur || r.score > cur.score + 1e-9 || (Math.abs(r.score - cur.score) < 1e-9 && r.price < cur.price)) best.set(r.family, r);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.price - b.price).slice(0, limit);
}
