/* 룰러 3D 화면 — 수납장과 수납함을 그리고, 끌어서 옮기거나 빼는 손놀림을 받아요.
   무엇이 어디 있는지는 app.js 가 정합니다. 이 파일은 받은 대로 그리고, 손으로 옮긴 결과만 알려 줘요.
   1 = 1cm. pack.js 좌표(왼쪽-앞-바닥 원점, z 는 안쪽)를 Three 좌표(가운데 원점, -Z 가 안쪽)로 바꿔 그립니다. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { snap, sizeOf, restY, fits, inside, magnet } from "./pack.js";
import { buildShape } from "./shapes.js";

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createScene(host, { onSelect, onMove, onRemove }){
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  // 치수 글자는 HTML 로 얹어요 (3D 글자보다 선명하고 Pretendard 를 그대로 써요)
  const labels = new CSS2DRenderer();
  labels.domElement.className = "scene-labels";
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;   // 바닥 밑으로는 못 내려가요
  controls.screenSpacePanning = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e8e4, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  const cabinetGroup = new THREE.Group();
  scene.add(cabinetGroup);
  const boxGroup = new THREE.Group();
  scene.add(boxGroup);

  let cab = { w: 60, d: 40, h: 30 };
  const meshes = new Map();   // uid → mesh
  const leaving = new Set();  // 빠져나가는 중인 mesh
  let selected = null;

  // ---- 좌표 바꾸기 ----
  const toWorld = (b, out = new THREE.Vector3()) =>
    out.set(b.x + b.w / 2 - cab.w / 2, b.y + b.h / 2, cab.d / 2 - (b.z + b.d / 2));
  const fromWorldXZ = (p, s) => ({ x: p.x + cab.w / 2 - s.w / 2, z: cab.d / 2 - p.z - s.d / 2 });

  // ---- 수납장 ----
  function buildCabinet(){
    cabinetGroup.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
    cabinetGroup.clear();
    const { w, d, h } = cab;
    const line = new THREE.LineBasicMaterial({ color: css("--ink"), transparent: true, opacity: .55 });
    const wall = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .32, roughness: 1, side: THREE.DoubleSide, depthWrite: false });

    // 바닥: 종이 색 판 + 1cm 격자(10cm 마다 진하게)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: css("--paper"), roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    cabinetGroup.add(floor);
    cabinetGroup.add(grid(w, d, 1, css("--line"), .9, .02));
    cabinetGroup.add(grid(w, d, 10, css("--muted"), .35, .03));

    // 옆·뒤·천장 벽 (앞은 열려 있어요)
    const panel = (pw, ph, pos, rot) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), wall);
      m.position.copy(pos); m.rotation.set(...rot); m.receiveShadow = true;
      cabinetGroup.add(m);
    };
    panel(w, h, new THREE.Vector3(0, h / 2, -d / 2), [0, 0, 0]);
    panel(d, h, new THREE.Vector3(-w / 2, h / 2, 0), [0, Math.PI / 2, 0]);
    panel(d, h, new THREE.Vector3(w / 2, h / 2, 0), [0, -Math.PI / 2, 0]);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), line);
    edges.position.y = h / 2;
    cabinetGroup.add(edges);

    // 바깥 바닥에 깔리는 옅은 그림자 받이
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w * 4, d * 4), new THREE.ShadowMaterial({ opacity: .08 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.05; ground.receiveShadow = true;
    cabinetGroup.add(ground);

    // 치수 글자: 가로는 앞 바닥, 깊이는 오른쪽 바닥, 높이는 오른쪽 앞 기둥
    cabinetGroup.add(label(`${w}cm`, 0, 0, d / 2 + 3, "dim"));
    cabinetGroup.add(label(`${d}cm`, w / 2 + 3, 0, 0, "dim"));
    cabinetGroup.add(label(`${h}cm`, w / 2 + 3, h / 2, d / 2, "dim"));

    const span = Math.max(w, d, h);
    sun.position.set(-w * .6, h + span * 1.6, d * 1.4);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -span * 1.5;
    sun.shadow.camera.right = sun.shadow.camera.top = span * 1.5;
    sun.shadow.camera.far = span * 6;
    sun.shadow.camera.updateProjectionMatrix();
  }

  function grid(w, d, step, color, opacity, lift){
    const pts = [];
    for(let x = -w / 2; x <= w / 2 + 1e-6; x += step) pts.push(x, lift, -d / 2, x, lift, d / 2);
    for(let z = -d / 2; z <= d / 2 + 1e-6; z += step) pts.push(-w / 2, lift, z, w / 2, lift, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  }

  function label(text, x, y, z, cls){
    const el = document.createElement("div");
    el.className = "scene-label " + (cls || "");
    el.textContent = text;
    const o = new CSS2DObject(el);
    o.position.set(x, y, z);
    return o;
  }

  // 처음 시점: 앞에서 살짝 위·오른쪽. 폰처럼 좁은 화면이면 가로가 다 보이도록 더 물러나요
  function resetView(){
    const span = Math.max(cab.w, cab.d * 1.2, cab.h * 1.4);
    const half = THREE.MathUtils.degToRad(camera.fov / 2);
    const wide = Math.hypot(cab.w, cab.d) * .62 / (Math.tan(half) * camera.aspect);   // 가로가 들어갈 거리
    const far = Math.max(1, wide / (span * 1.65));
    controls.target.set(0, cab.h * .38, 0);
    camera.position.set(cab.w * .35, cab.h * .9 + span * .55, span * 1.65 + cab.d / 2)
      .sub(controls.target).multiplyScalar(far).add(controls.target);
    camera.near = span / 100; camera.far = span * 20;
    camera.updateProjectionMatrix();
    controls.update();
  }

  // ---- 상자 ----
  /* 상자 하나 = 묶음(Group). 안에 상품 모양(shapes.js)과, 골랐을 때만 보이는 바깥 테두리가 있어요.
     묶음의 원점은 상자 한가운데라 위치 계산은 예전과 같아요 */
  function makeMesh(entry){
    const s = sizeOf(entry.item, entry.rot);
    const root = new THREE.Group();
    const shape = buildShape(entry.item);
    shape.position.y = -s.h / 2;
    if(entry.rot) shape.rotation.y = Math.PI / 2;   // 가로와 깊이를 바꿔 놓으면 모양도 같이 돌아가요
    root.add(shape);
    const mats = [];
    shape.traverse(o => { if(o.material) mats.push(o.material); });
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(s.w + .3, s.h + .3, s.d + .3)),
      new THREE.LineBasicMaterial({ color: css("--ink"), transparent: true }));
    outline.visible = false;
    root.add(outline);
    root.userData = { uid: entry.uid, rot: entry.rot, size: s, outline, mats, fade: 1, target: new THREE.Vector3(), item: entry.item, box: null };
    return root;
  }

  function dispose(root){
    // 질감 그림(map)은 여러 상자가 같이 쓰니 지우지 않아요 (material.dispose 는 map 을 건드리지 않아요)
    root.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    root.removeFromParent();
  }

  // 넣고 빼는 동안 묶음 전체를 흐리게: 재질마다 원래 불투명도(base)에 fade 를 곱해요
  function setFade(root, f){
    root.userData.fade = f;
    for(const m of root.userData.mats) m.opacity = (m.userData.base ?? 1) * f;
  }

  /* app.js 가 가진 배치를 그대로 그려요. entries = [{uid, item, rot, x, y, z}]
     opts.enter = 이번에 새로 넣은 uid (앞에서 미끄러져 들어와요) */
  function sync(entries, opts = {}){
    const seen = new Set();
    for(const e of entries){
      seen.add(e.uid);
      let mesh = meshes.get(e.uid);
      if(mesh && mesh.userData.rot !== e.rot){ dispose(mesh); meshes.delete(e.uid); mesh = null; }
      const s = sizeOf(e.item, e.rot);
      const box = { x: e.x, y: e.y, z: e.z, ...s, stackable: e.item.stackable };
      if(!mesh){
        mesh = makeMesh(e);
        meshes.set(e.uid, mesh);
        boxGroup.add(mesh);
        toWorld(box, mesh.position);
        if(e.uid === opts.enter){
          // 수납장 앞, 살짝 위에서 시작해 안으로 밀려 들어가요
          mesh.position.z = cab.d / 2 + s.d / 2 + Math.max(12, cab.d * .5);
          mesh.position.y += Math.min(6, cab.h * .2);
          setFade(mesh, 0);
        }
      }
      mesh.userData.box = box;
      toWorld(box, mesh.userData.target);
    }
    for(const [uid, mesh] of meshes) if(!seen.has(uid)) leave(uid, mesh);
    if(selected && !meshes.has(selected)) select(null);
    paint();
  }

  // 빠질 때는 앞으로 미끄러져 나가며 흐려져요
  function leave(uid, mesh){
    meshes.delete(uid);
    mesh.userData.target.z = cab.d / 2 + mesh.userData.size.d / 2 + Math.max(16, cab.d * .6);
    mesh.userData.leaving = true;
    leaving.add(mesh);
  }

  function select(uid){
    selected = uid;
    paint();
    onSelect && onSelect(uid);
  }

  // 테두리 색: 고른 상자는 먹색 진하게, 놓을 수 없는 자리는 경고색
  function paint(){
    for(const [uid, mesh] of meshes){
      const outline = mesh.userData.outline;
      outline.visible = !!mesh.userData.bad || uid === selected;
      outline.material.color.set(css(mesh.userData.bad ? "--warn" : "--ink-strong"));
      for(const m of mesh.userData.mats) m.emissive?.set(uid === selected ? 0x1c1c1c : 0x000000);
    }
  }

  // ---- 끌기 ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let drag = null;   // { mesh, grab:Vector3, start:{x,y,z}, moved }

  // 눌린 곳의 상자 묶음 (모양 안 부품을 맞혀도 묶음을 돌려줘요)
  function pick(){
    const hit = ray.intersectObjects([...meshes.values()], true).find(h => h.object.isMesh);
    let o = hit && hit.object;
    while(o && !o.userData.uid) o = o.parent;
    return o || null;
  }

  function pointer(ev){
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }

  // 컨트롤보다 먼저 받아야 상자를 잡았을 때 화면이 같이 돌지 않아요 (capture)
  host.addEventListener("pointerdown", ev => {
    if(ev.button !== 0 || ev.target !== renderer.domElement) return;
    pointer(ev);
    const mesh = pick();
    if(!mesh){ controls.enabled = true; return; }
    controls.enabled = false;
    const b = mesh.userData.box;
    plane.constant = -b.y;   // 잡은 상자 바닥 높이의 평면 위로 움직여요
    ray.ray.intersectPlane(plane, hit);
    drag = { mesh, grab: hit.clone().sub(toWorld({ ...b, y: b.y })).setY(0), start: { x: b.x, y: b.y, z: b.z }, moved: false, x0: ev.clientX, y0: ev.clientY };
    renderer.domElement.setPointerCapture(ev.pointerId);
    select(mesh.userData.uid);
  }, true);

  host.addEventListener("pointermove", ev => {
    if(!drag) return;
    if(!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 4) return;
    drag.moved = true;
    pointer(ev);
    if(!ray.ray.intersectPlane(plane, hit)) return;
    const { mesh } = drag;
    const s = mesh.userData.size;
    const xz = fromWorldXZ(hit.sub(drag.grab), s);
    let box = { x: snap(xz.x), z: snap(xz.z), ...s, stackable: mesh.userData.item.stackable };
    const others = othersOf(mesh);
    // 수납장 안에서는 벽과 옆 상자에 자석처럼 붙고 벽에 막혀 미끄러져요.
    // 앞으로 완전히 끌어내면 '빼기'로 봐요 (흐려져요)
    mesh.userData.out = !overCabinet(box);
    if(!mesh.userData.out){
      box = magnet(box, others, cab);
      box.x = Math.min(Math.max(0, box.x), Math.max(0, cab.w - s.w));
      box.z = Math.min(Math.max(0, box.z), Math.max(0, cab.d - s.d));
    }
    const y = restY(box, others);
    box.y = y == null ? Math.max(0, ...others.map(p => p.y + p.h)) : y;
    mesh.userData.box = box;
    mesh.userData.bad = !mesh.userData.out && (y == null || !fits(box, others, cab));
    toWorld(box, mesh.userData.target);
    mesh.userData.target.y += 1.2;   // 들고 있는 동안 살짝 떠 있어요
    paint();
  });

  function endDrag(){
    if(!drag) return;
    const { mesh, start, moved } = drag;
    drag = null;
    controls.enabled = true;
    const uid = mesh.userData.uid;
    if(!moved) return;
    const b = mesh.userData.box;
    mesh.userData.bad = false;
    if(mesh.userData.out){ onRemove && onRemove(uid); return; }
    if(!fits(b, othersOf(mesh), cab) || restY(b, othersOf(mesh)) == null){
      // 놓을 수 없는 자리면 원래 자리로 돌아가요
      onMove && onMove(uid, start, false);
    } else {
      onMove && onMove(uid, { x: b.x, y: b.y, z: b.z }, true);
    }
    paint();
  }
  host.addEventListener("pointerup", endDrag);
  host.addEventListener("pointercancel", endDrag);

  // 빈 곳을 눌렀다 떼면 고른 상자를 풀어요 (돌리려고 끈 건 빼고)
  let downAt = null;
  renderer.domElement.addEventListener("pointerdown", ev => { downAt = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener("click", ev => {
    if(!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 4) return;
    pointer(ev);
    if(!pick()) select(null);
  });

  const othersOf = mesh => [...meshes.values()].filter(m => m !== mesh).map(m => m.userData.box);
  // 옆과 뒤는 벽이라 막히고, 열린 앞쪽으로 완전히 끌어내야 '빼기'예요
  const overCabinet = b => b.z + b.d > 0;

  // ---- 그리기 ----
  let lastW = 0;
  function resize(){
    const w = host.clientWidth, h = host.clientHeight;
    if(!w || !h) return;
    renderer.setSize(w, h, false);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // 화면 폭이 크게 바뀌면(폰 회전, 창 크기) 처음 시점으로 다시 맞춰요
    if(Math.abs(w - lastW) > 80){ lastW = w; resetView(); }
  }
  new ResizeObserver(resize).observe(host);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const k = 1 - Math.exp(-clock.getDelta() * 14);   // 화면 빠르기와 상관없이 같은 속도로 따라가요
    for(const mesh of meshes.values()){
      mesh.position.lerp(mesh.userData.target, k);
      const goal = mesh.userData.out ? .35 : 1;
      if(Math.abs(goal - mesh.userData.fade) > .002) setFade(mesh, mesh.userData.fade + (goal - mesh.userData.fade) * k);
    }
    for(const mesh of leaving){
      mesh.position.lerp(mesh.userData.target, k);
      setFade(mesh, mesh.userData.fade * (1 - k));
      if(mesh.userData.fade < .02){ leaving.delete(mesh); dispose(mesh); }
    }
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  function setCabinet(next){
    const changed = next.w !== cab.w || next.d !== cab.d || next.h !== cab.h;
    cab = { ...next };
    buildCabinet();
    if(changed) resetView();
  }

  buildCabinet();
  resetView();
  resize();

  return { setCabinet, sync, select, resetView, get selected(){ return selected; }, inside: b => inside(b, cab) };
}
