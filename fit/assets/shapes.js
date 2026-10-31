/* 모두핏 수납함 모양 — 판매처 사진을 보고 제품군마다 대략의 생김새를 만들어요.
   catalog.json 의 shape 값으로 고르고, 바깥 치수(w × d × h)는 항상 상품 치수와 같게 맞춥니다.
   만든 모양은 바닥 가운데가 원점이고, 앞면(w 쪽)이 +Z 를 봐요.

   shape.kind
     bin     단단한 상자 (플라스틱·투명·종이). 아래가 좁아지는 기울기, 뚜껑, 테두리, 손잡이 구멍, 앞이 낮은 모양
     fabric  천 상자. 접힌 윗단, 옆 손잡이 끈, 투명 창, 라벨
     drawer  서랍 케이스 (무인양품 PP 케이스)
     crate   원목 상자 (판자와 기둥) */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const UP = new THREE.Vector3(0, 1, 0);

// ---- 재질 ----
// 질감 그림은 한 번만 만들어 같이 써요. 벽의 uv 는 cm 단위라 repeat 가 곧 '몇 cm 마다'예요
const textures = {};
function texture(name){
  if(textures[name]) return textures[name];
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 64);
  if(name === "ribs"){
    // 템바보드: 둥근 세로 골
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, "#c9c6c0"); grad.addColorStop(.25, "#fff"); grad.addColorStop(.6, "#f1efea"); grad.addColorStop(1, "#c9c6c0");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  } else if(name === "weave"){
    // 천: 가로세로 실 결
    for(let i = 0; i < 64; i += 2){
      g.fillStyle = `rgba(0,0,0,${.035 + Math.random() * .05})`; g.fillRect(0, i, 64, 1);
      g.fillStyle = `rgba(0,0,0,${.03 + Math.random() * .04})`; g.fillRect(i, 0, 1, 64);
    }
  } else if(name === "wood"){
    // 소나무: 가로 나뭇결
    for(let y = 0; y < 64; y++){
      const k = .5 + .5 * Math.sin(y * .7 + Math.sin(y * .13) * 3);
      g.fillStyle = `rgba(120,80,30,${.05 + k * .12})`; g.fillRect(0, y, 64, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const cm = { ribs: [1 / 1.4, 1], weave: [1 / 3, 1 / 3], wood: [1 / 40, 1 / 6] }[name];
  t.repeat.set(...cm);
  return textures[name] = t;
}

/* 재질 종류: plastic(무광) · clear(투명) · frosted(반투명) · fabric · paper · wood
   모든 재질은 넣고 뺄 때 흐려지도록 transparent 이고, 원래 불투명도는 userData.base 에 둬요 */
function material(kind, color, tex){
  const o = { color, roughness: .6, metalness: 0, transparent: true, opacity: 1 };
  if(kind === "clear") Object.assign(o, { roughness: .12, opacity: .3, depthWrite: false, side: THREE.DoubleSide });
  if(kind === "frosted") Object.assign(o, { roughness: .45, opacity: .78 });
  if(kind === "fabric" || kind === "paper") Object.assign(o, { roughness: 1 });
  if(kind === "wood") Object.assign(o, { roughness: .85 });
  if(kind === "metal") Object.assign(o, { roughness: .35, metalness: .25 });
  if(tex) o.map = texture(tex);
  const m = new THREE.MeshStandardMaterial(o);
  m.userData.base = o.opacity;
  return m;
}

function add(group, geometry, mat, edges){
  const m = new THREE.Mesh(geometry, mat);
  m.castShadow = mat.opacity > .5;
  m.receiveShadow = true;
  group.add(m);
  // 투명한 상자는 모서리 선이 있어야 모양이 읽혀요
  if(edges){
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25),
      new THREE.LineBasicMaterial({ color: edges, transparent: true, opacity: .55 }));
    line.material.userData.base = .55;
    line.position.copy(m.position); line.rotation.copy(m.rotation);
    group.add(line);
  }
  return m;
}

// ---- 벽 한 장 ----
/* 바깥에서 본 벽: P 는 왼쪽 아래 모서리, u 는 오른쪽 방향, Wb 는 바닥 폭, tp 는 위로 갈수록 양옆으로 벌어지는 길이,
   H 는 높이, profile 은 윗변 모양 [[왼→오 0~1, 높이 비율]...], holes 는 (Wb, L) => Path[] (벽 평면 좌표).
   벽 평면에서 다각형을 그려 두께 t 만큼 바깥쪽으로 밀어내요 */
function wall(group, { P, u, Wb, tp = 0, H, t, profile = [[0, 1], [1, 1]], holes, mat, edges }){
  const nh = new THREE.Vector3().crossVectors(u, UP);                // 바깥 방향 (수평)
  const L = Math.hypot(H, tp);
  const v = UP.clone().multiplyScalar(H).addScaledVector(nh, tp).divideScalar(L);
  const n = new THREE.Vector3().crossVectors(u, v);                 // 벽 바깥 방향
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(Wb, 0)];
  for(const [s, f] of [...profile].reverse()){
    const width = Wb + 2 * tp * f;
    pts.push(new THREE.Vector2(-tp * f + s * width, L * f));
  }
  const shape = new THREE.Shape(pts);
  if(holes) shape.holes.push(...holes(Wb, L));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 10 });
  const origin = P.clone().addScaledVector(n, -t);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(u, v, n).setPosition(origin));
  return add(group, g, mat, edges);
}

// 구멍 모양 (벽 평면 좌표, cm)
function roundHole(cx, cy, r){
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return p;
}
function slotHole(cx, cy, w, h){
  const r = h / 2, p = new THREE.Path();
  p.moveTo(cx - w / 2 + r, cy - r);
  p.lineTo(cx + w / 2 - r, cy - r);
  p.absarc(cx + w / 2 - r, cy, r, -Math.PI / 2, Math.PI / 2, false);
  p.lineTo(cx - w / 2 + r, cy + r);
  p.absarc(cx - w / 2 + r, cy, r, Math.PI / 2, Math.PI * 1.5, false);
  return p;
}

// 수평 테두리 (바깥 사각형 - 안 사각형)
function ring(group, Wo, Do, Wi, Di, y, h, mat, edges){
  const s = new THREE.Shape([new THREE.Vector2(-Wo / 2, -Do / 2), new THREE.Vector2(Wo / 2, -Do / 2), new THREE.Vector2(Wo / 2, Do / 2), new THREE.Vector2(-Wo / 2, Do / 2)]);
  s.holes.push(new THREE.Path([new THREE.Vector2(-Wi / 2, -Di / 2), new THREE.Vector2(-Wi / 2, Di / 2), new THREE.Vector2(Wi / 2, Di / 2), new THREE.Vector2(Wi / 2, -Di / 2)]));
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return add(group, g, mat, edges);
}

function block(group, w, h, d, x, y, z, mat, r = 0, edges){
  const g = r ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const m = add(group, g, mat, edges);
  m.position.set(x, y, z);
  if(edges) group.children[group.children.length - 1].position.set(x, y, z);
  return m;
}

/* 손잡이를 어느 면에 둘지: short = 짧은 두 면, long = 긴 두 면, front = 앞뒤.
   돌려받는 값은 'fb'(앞뒤) 또는 'lr'(양옆) */
function handleFaces(on, W, D){
  if(on === "front") return "fb";
  if(on === "long") return W >= D ? "fb" : "lr";
  return W <= D ? "fb" : "lr";
}

// ---- 상자 몸통 (bin · fabric 같이 써요) ----
function body(group, it, s){
  const W = it.w, D = it.d, H = it.h;
  const soft = it.shape.kind === "fabric";
  const matKind = s.material || (soft ? "fabric" : "plastic");
  const tex = s.texture || (soft ? "weave" : null);
  const mat = material(matKind, it.color || "#e7e5e0", tex);
  const edges = matKind === "clear" ? "#8fa3ad" : null;
  const t = s.t || (soft ? .5 : .35);

  // 뚜껑과 테두리가 차지하는 만큼 몸통이 작아져요
  const lid = s.lid, lip = s.lip || 0;
  const lidH = lid ? lid.h : 0, lidOver = lid ? (lid.over ?? .3) : 0;
  const side = Math.max(lip, lidOver);
  const Wt = W - 2 * side, Dt = D - 2 * side;
  const bodyH = H - lidH + (lid && lid.sink || 0);
  const tp = s.taper || 0;
  const W0 = Wt - 2 * tp, D0 = Dt - 2 * tp;

  // 앞이 낮은 모양: front = { h: 앞 높이 비율, slope: 옆면이 비스듬히 내려오는 길이 비율 (0 이면 옆은 그대로) }
  const ff = s.front ? s.front.h : 1, sl = s.front ? (s.front.slope || 0) : 0;
  const sideProfile = sl ? [[0, ff], [sl, 1], [1, 1]] : [[0, 1], [1, 1]];
  const flip = p => p.map(([a, f]) => [1 - a, f]).reverse();

  // 손잡이 구멍
  const hf = s.handles ? handleFaces(s.handles.on, W, D) : null;
  const holes = (face, topF) => {
    if(!s.handles || (s.handles.type !== "round" && s.handles.type !== "slot")) return undefined;
    if((face === "f" || face === "b") !== (hf === "fb")) return undefined;
    return (Wb, L) => {
      const top = L * topF;
      if(s.handles.type === "round") return [roundHole(Wb / 2, Math.max(top * .62, top - 4.2), Math.min(1.5, Wb * .06))];
      const sw = Math.min(10, Wb * .42), sh = Math.min(2.4, top * .16);
      return [slotHole(Wb / 2, top - sh / 2 - Math.min(2, top * .1), sw, sh)];
    };
  };

  const walls = [
    { face: "f", P: new THREE.Vector3(-W0 / 2, 0, D0 / 2), u: new THREE.Vector3(1, 0, 0), Wb: W0, profile: [[0, ff], [1, ff]], topF: ff },
    { face: "r", P: new THREE.Vector3(W0 / 2, 0, D0 / 2), u: new THREE.Vector3(0, 0, -1), Wb: D0, profile: sideProfile, topF: 1 },
    { face: "b", P: new THREE.Vector3(W0 / 2, 0, -D0 / 2), u: new THREE.Vector3(-1, 0, 0), Wb: W0, topF: 1 },
    { face: "l", P: new THREE.Vector3(-W0 / 2, 0, -D0 / 2), u: new THREE.Vector3(0, 0, 1), Wb: D0, profile: flip(sideProfile), topF: 1 },
  ];
  for(const w of walls) wall(group, { ...w, tp, H: bodyH, t, holes: holes(w.face, w.topF), mat, edges });
  block(group, W0, t, D0, 0, t / 2, 0, mat, 0, edges);   // 바닥

  // 윗단: 플라스틱은 바깥으로 꺾인 테두리, 천은 접어 내린 두꺼운 단
  if(lip) ring(group, Wt + 2 * lip, Dt + 2 * lip, Wt - 2 * t, Dt - 2 * t, bodyH - .6, .6, mat, edges);
  if(s.cuff){
    const ch = bodyH * s.cuff;
    ring(group, Wt + .5, Dt + .5, Wt - 2 * t, Dt - 2 * t, bodyH - ch, ch, material(matKind, shade(it.color, s.cuffShade ?? -.04), tex));
  }

  // 천 상자 옆 손잡이 끈
  if(s.handles && s.handles.type === "tab"){
    const tabMat = material("fabric", s.handles.color || shade(it.color, -.18));
    const y = bodyH * .78, tw = Math.min(8, (hf === "fb" ? Wt : Dt) * .35);
    if(hf === "fb") for(const z of [Dt / 2 + .25, -Dt / 2 - .25]) block(group, tw, 1.6, .5, 0, y, z, tabMat, .25);
    else for(const x of [Wt / 2 + .25, -Wt / 2 - .25]) block(group, .5, 1.6, tw, x, y, 0, tabMat, .25);
  }

  // 앞면 투명 창 (다이소 패브릭 와이어 박스)
  if(s.window === "front"){
    const win = material("clear", "#dfe7ec");
    block(group, Wt * .72, bodyH * .5, .2, 0, bodyH * .42, Dt / 2 + .12, win, 0, "#9aa7ad");
  }
  // 라벨 꽂이 (크바른비크)
  if(s.label){
    const plate = new THREE.Mesh(new THREE.CircleGeometry(1, 32), material("metal", "#e6e8e9"));
    plate.scale.set(Math.min(4.5, Wt * .17), Math.min(2.6, bodyH * .12), 1);
    plate.position.set(0, bodyH * .52, Dt / 2 + .06);
    group.add(plate);
  }

  // 뚜껑
  if(lid){
    // 뚜껑은 둥근 상자라 uv 가 cm 가 아니에요. 질감을 얹으면 줄무늬로 늘어나서, 따로 정한 때만 써요
    const lidTex = lid.texture && lid.texture !== "none" ? lid.texture : null;
    const lidMat = material(lid.material || matKind, lid.color || it.color || "#e7e5e0", lidTex);
    const Wl = Wt + 2 * lidOver, Dl = Dt + 2 * lidOver;
    block(group, Wl, lidH, Dl, 0, H - lidH / 2, 0, lidMat, Math.min(.6, lidH / 3), lid.material === "clear" || (!lid.material && edges) ? "#8fa3ad" : null);
    if(s.window === "top") block(group, Wl * .7, .15, Dl * .6, 0, H + .02, 0, material("clear", "#dfe7ec"), 0, "#9aa7ad");
    // 뚜껑 잠금 고리 / 손잡이 (짧은 두 면)
    if(lid.clips){
      const cm = material("plastic", lid.clips);
      const ch = Math.min(4, lidH + 2.5);
      if(W <= D) for(const z of [Dl / 2 + .3, -Dl / 2 - .3]) block(group, Math.min(7, Wl * .3), ch, .8, 0, H - ch / 2, z, cm, .3);
      else for(const x of [Wl / 2 + .3, -Wl / 2 - .3]) block(group, .8, ch, Math.min(7, Dl * .3), x, H - ch / 2, 0, cm, .3);
    }
  }
}

// ---- 서랍 케이스 ----
function drawer(group, it, s){
  const W = it.w, D = it.d, H = it.h, t = .4;
  const shell = material("frosted", it.color || "#eef0f0");
  shell.opacity = shell.userData.base = .55;
  shell.depthWrite = false;
  // 겉틀: 앞이 열린 상자
  block(group, W, t, D, 0, t / 2, 0, shell, .2);
  block(group, W, t, D, 0, H - t / 2, 0, shell, .2);
  block(group, t, H, D, -W / 2 + t / 2, H / 2, 0, shell, .2);
  block(group, t, H, D, W / 2 - t / 2, H / 2, 0, shell, .2);
  block(group, W, H, t, 0, H / 2, -D / 2 + t / 2, shell, .2);
  // 서랍: 안쪽 통과 앞판, 앞판 위쪽 손잡이 홈
  const inner = material("frosted", "#f6f7f7");
  const dw = W - 2 * t - .4, dh = H - 2 * t - .6, dd = D - 1.2;
  block(group, dw, dh * .96, dd - .8, 0, t + .3 + dh * .48, -.3, inner);
  const front = material("frosted", "#f2f4f4");
  front.opacity = front.userData.base = .9;
  // 앞판은 겉틀 안쪽으로 조금 들어가 있어 테두리가 보여요
  block(group, W - 1.2, H - 1.2, .6, 0, H / 2, D / 2 - .5, front, .3, "#c4caca");
  block(group, Math.min(14, W * .4), .6, .3, 0, H - Math.min(2.6, H * .14), D / 2 - .1, material("plastic", "#aeb4b4"), .25);
}

// ---- 원목 상자 ----
function crate(group, it, s){
  const W = it.w, D = it.d, H = it.h;
  const wood = material("wood", it.color || "#dcbf91", "wood");
  const post = 1.8, bt = .9, gap = Math.min(2, H * .12);
  const bh = (H - gap) / 2;
  // 네 귀퉁이 기둥
  for(const x of [-1, 1]) for(const z of [-1, 1]) block(group, post, H, post, x * (W / 2 - post / 2), H / 2, z * (D / 2 - post / 2), wood);
  // 옆판 두 장씩. 짧은 면 윗판에는 손잡이 구멍
  const hf = handleFaces("short", W, D);
  for(const [face, P, u, Wb] of [
    ["f", new THREE.Vector3(-W / 2 + post, 0, D / 2), new THREE.Vector3(1, 0, 0), W - 2 * post],
    ["b", new THREE.Vector3(W / 2 - post, 0, -D / 2), new THREE.Vector3(-1, 0, 0), W - 2 * post],
    ["r", new THREE.Vector3(W / 2, 0, D / 2 - post), new THREE.Vector3(0, 0, -1), D - 2 * post],
    ["l", new THREE.Vector3(-W / 2, 0, -D / 2 + post), new THREE.Vector3(0, 0, 1), D - 2 * post],
  ]){
    const handle = ((face === "f" || face === "b") === (hf === "fb"));
    wall(group, { P, u, Wb, H: bh, t: bt, mat: wood });
    wall(group, { P: P.clone().setY(bh + gap), u, Wb, H: bh, t: bt, mat: wood,
      holes: handle ? (wb, L) => [slotHole(wb / 2, L * .55, Math.min(9, wb * .45), Math.min(2.6, L * .4))] : undefined });
  }
  // 바닥 판자 세 장
  const sw = (W - 2 * post) / 3 - .4;
  for(const i of [-1, 0, 1]) block(group, sw, .8, D - 2 * post, i * (sw + .4), .4, 0, wood);
}

// 색을 조금 밝게(+)/어둡게(-)
function shade(hex, k){
  const c = new THREE.Color(hex || "#e7e5e0");
  return k < 0 ? c.multiplyScalar(1 + k) : c.lerp(new THREE.Color("#fff"), k);
}

/* 상품 하나의 모양을 만들어요 (회전 전, 원래 방향). 돌려받는 Group 의 자식은 Mesh 와 LineSegments 예요 */
export function buildShape(it){
  const group = new THREE.Group();
  const s = it.shape || { kind: "bin" };
  if(s.kind === "drawer") drawer(group, it, s);
  else if(s.kind === "crate") crate(group, it, s);
  else body(group, it, s);
  return group;
}
