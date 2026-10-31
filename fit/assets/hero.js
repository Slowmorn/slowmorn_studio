/* 모두핏 소개 그림 — 앱과 같은 수납함 모델(shapes.js)로, 수납장에 딱 맞게 들어가는 모습을 보여 줘요.
   72 × 40 × 30cm 칸의 왼쪽에 이케아 쿠기스 26 × 35 × 15cm 4개(가로 2 · 높이 2),
   오른쪽에 무인양품 파일박스 10 × 32 × 24cm 2개를 나란히 넣어요. 가로는 26 + 26 + 10 + 10 = 72 로 꼭 맞아요.
   보는 각도는 처음 그림처럼 앞-오른쪽 위에서 비스듬히 내려다보는 그림(원근 없음)이에요.
   상자가 하나씩 앞에서 부드럽게 들어와 자리를 잡고, 다 차면 잠시 머문 뒤 처음부터 다시 시작해요 (빠지는 움직임은 없어요).
   3D 를 못 그리면 그림 자리를 접어요 (index.html 의 is-loading 을 풀어요). */
import * as THREE from "three";
import { buildShape } from "./shapes.js";

const host = document.querySelector(".hero-art");
const CAB = { w: 72, d: 40, h: 30 };
// 들어오는 순서대로 한 상자씩. rot 1 은 가로·깊이를 바꿔 놓은 것, x 는 칸 왼쪽 끝에서 상자 왼쪽까지(cm), k 는 몇 번째 단
const KUGGIS = "ikea-kuggis-lid-26x35x15", FILEBOX = "muji-pp-filebox-10x32x24";
const SET = [
  { id: KUGGIS, x: 0, k: 0 }, { id: KUGGIS, x: 26, k: 0 },
  { id: KUGGIS, x: 0, k: 1 }, { id: KUGGIS, x: 26, k: 1 },
  { id: FILEBOX, x: 52, k: 0 }, { id: FILEBOX, x: 62, k: 0 },
];
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

// 시간표 (초): 상자마다 STEP 간격으로 SLIDE 동안 들어오고, 다 차면 HOLD 동안 머문 뒤 바로 처음부터
const START = .4, STEP = .7, SLIDE = 1.1, HOLD = 3;
// 들어올 때 출발하는 자리: 제자리에서 앞으로 이만큼, 위로 이만큼 (cm)
const FROM_Z = 16, FROM_Y = 3;

async function start(){
  const data = await (await fetch(new URL("catalog.json?v=20261031d", import.meta.url))).json();
  const byId = new Map(data.items.map(it => [it.id, it]));
  if(SET.some(p => !byId.has(p.id))) return;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "hero-3d";
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "72×40×30cm 수납장에 이케아 쿠기스 4개와 무인양품 파일박스 2개가 빈틈없이 들어가는 모습");

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e8e4, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-50, 110, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -90;
  sun.shadow.camera.right = sun.shadow.camera.top = 90;
  scene.add(sun);

  // 수납장: 앞이 열린 선반. 바닥은 종이 색, 벽은 옅은 판, 모서리는 먹색 선 (앱과 같은 느낌)
  const { w, d, h } = CAB;
  const cab = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0xf7f6f3, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  cab.add(floor);
  const wall = new THREE.MeshStandardMaterial({ color: 0xeeece7, transparent: true, opacity: .55, roughness: 1, side: THREE.DoubleSide, depthWrite: false });
  const panel = (pw, ph, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), wall);
    m.position.copy(pos); m.rotation.set(...rot); m.receiveShadow = true;
    cab.add(m);
  };
  panel(w, h, new THREE.Vector3(0, h / 2, -d / 2), [0, 0, 0]);
  panel(d, h, new THREE.Vector3(-w / 2, h / 2, 0), [0, Math.PI / 2, 0]);
  panel(d, h, new THREE.Vector3(w / 2, h / 2, 0), [0, -Math.PI / 2, 0]);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
    new THREE.LineBasicMaterial({ color: 0x37352f, transparent: true, opacity: .5 }));
  edges.position.y = h / 2;
  cab.add(edges);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(w * 3, d * 4), new THREE.ShadowMaterial({ opacity: .07 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.05; ground.receiveShadow = true;
  cab.add(ground);
  scene.add(cab);

  // 상자들: 바닥 가운데가 원점인 모양을 칸 자리로 옮겨요. 앞면을 수납장 앞선에 맞춰 놓아요
  const boxes = [];
  for(const p of SET){
    const item = byId.get(p.id);
    const fw = p.rot ? item.d : item.w, fd = p.rot ? item.w : item.d;
    const shape = buildShape(item);
    if(p.rot) shape.rotation.y = Math.PI / 2;
    const mats = [];
    shape.traverse(o => {
      if(o.isMesh) o.castShadow = o.receiveShadow = true;
      if(o.material) mats.push(o.material);
    });
    const home = new THREE.Vector3(-w / 2 + p.x + fw / 2, item.h * p.k, d / 2 - fd / 2);
    scene.add(shape);
    boxes.push({ shape, mats, home });
  }

  /* 처음 그림처럼 앞-오른쪽 위에서 내려다보는 그림: 옆으로 45°, 위에서 26° (윗면이 너무 넓지 않게), 원근 없음.
     수납장 모서리 8개가 화면 안에 들어오도록 테두리를 재서, 그 비율대로 그림 크기를 정해요 */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  const center = new THREE.Vector3(0, h / 2, 0);
  camera.position.copy(center).add(new THREE.Vector3(1, Math.SQRT2 * Math.tan(THREE.MathUtils.degToRad(26)), 1).setLength(300));
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for(const x of [-w / 2, w / 2]) for(const y of [0, h]) for(const z of [-d / 2, d / 2]){
    const v = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    bounds.minX = Math.min(bounds.minX, v.x); bounds.maxX = Math.max(bounds.maxX, v.x);
    bounds.minY = Math.min(bounds.minY, v.y); bounds.maxY = Math.max(bounds.maxY, v.y);
  }
  const pad = .08 * (bounds.maxX - bounds.minX);
  camera.left = bounds.minX - pad; camera.right = bounds.maxX + pad;
  camera.top = bounds.maxY + pad; camera.bottom = bounds.minY - pad * 1.4;   // 아래는 그림자 자리로 조금 더
  camera.updateProjectionMatrix();
  const ratio = (camera.top - camera.bottom) / (camera.right - camera.left);

  // 들어올 때: 제자리 바로 앞 조금 위에서 출발해 천천히 미끄러져 들어와 부드럽게 멈춰요
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function place(b, enter){
    const e = easeOut(Math.min(1, Math.max(0, enter)));
    b.shape.position.set(b.home.x, b.home.y + (1 - e) * FROM_Y, b.home.z + (1 - e) * FROM_Z);
    const a = Math.min(e * 1.6, 1);
    for(const m of b.mats) m.opacity = (m.userData.base ?? 1) * a;
    b.shape.visible = a > .01;
  }

  const note = document.createElement("p");
  note.className = "hero-fit";
  note.innerHTML = `<b>72 × 40 × 30cm</b> 칸에 쿠기스 4개 · 파일박스 2개가 <b>딱</b> 맞아요`;

  function resize(){
    const width = host.clientWidth;
    renderer.setSize(width, Math.round(width * ratio), false);   // 원근이 없어 비율만 맞추면 돼요
  }

  const fullAt = START + STEP * (boxes.length - 1) + SLIDE;   // 마지막 상자까지 다 들어간 때
  const cycle = fullAt + HOLD;
  function frame(t){
    if(still){ boxes.forEach(b => place(b, 1)); note.classList.add("on"); return; }
    const time = t % cycle;   // 한 바퀴가 끝나면 빈 수납장에서 바로 다시 시작해요
    boxes.forEach((b, i) => place(b, (time - START - STEP * i) / SLIDE));
    note.classList.toggle("on", time > fullAt);
  }

  host.classList.remove("is-loading");
  host.classList.add("has-3d");
  host.append(renderer.domElement, note);
  new ResizeObserver(resize).observe(host);
  resize();

  // 화면에 보일 때만 움직여요
  let visible = true, t0 = performance.now();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(host);
  renderer.setAnimationLoop(now => {
    if(!visible) return;
    frame((now - t0) / 1000);
    renderer.render(scene, camera);
    if(still) renderer.setAnimationLoop(null);
  });
}

// 실패하면 빈자리를 풀어 그림 자리를 접어요
if(host) start().catch(() => host.classList.remove("is-loading"));
