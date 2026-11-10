// 초음파 사진 — 진짜 사진이 아니라, 초음파 화면처럼 보이게 그린 그림이에요.
//   sac    첫 진료 (작은 아기집과 난황, 콩 같은 배아)
//   nt     1차 기형아 검사 (11~13주, 머리가 큰 '젤리곰' 옆모습)
//   detail 정밀 초음파 (입체 초음파 사진을 도트로 줄이고 웃는 눈과 볼터치를 더한 그림)
// 사진 위에는 부모가 꾸민 것처럼 이름 스티커와 하트를 붙여요.
// 같은 시뮬레이션에서는 늘 같은 그림이 나오도록 id 로 난수를 고정해요.

const OW = 384, OH = 288;
const cache = new Map();

function rng(seed){
  let a = 0;
  for(const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const d2 = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// ── 흑백 초음파 (아기집 · 젤리곰) ─────────────────────
function shapes(kind, twins){
  const S = [];   // 뒤에 넣은 모양이 위에 그려져요
  const E = (cx, cy, rx, ry, v) => S.push({ cx, cy, rx, ry, v });
  if(kind === 'sac'){
    const sacs = twins ? [[46, 50, 15, 12], [84, 52, 15, 12]] : [[64, 50, 21, 16]];
    for(const [cx, cy, rx, ry] of sacs){
      E(cx, cy, rx + 3, ry + 3, 'wall');
      E(cx, cy, rx, ry, 'fluid');
      E(cx - rx * .4, cy - 3, 3.6, 3.6, 'bone'); E(cx - rx * .4, cy - 3, 2.1, 2.1, 'fluid');   // 난황 (동그란 고리)
      E(cx + rx * .15, cy + 3, 5.2, 3.2, 'body');                                             // 콩 같은 배아
      E(cx + rx * .15 - 3.4, cy + 1.4, 2.6, 2.4, 'body');                                     // 머리 쪽이 살짝 둥글게
    }
  } else {
    const babies = twins ? [[44, 46, .62], [86, 60, .62]] : [[64, 52, 1]];
    for(const [cx, cy, k] of babies){
      E(cx, cy, 38 * k, 25 * k, 'wall');
      E(cx, cy, 35 * k, 22 * k, 'fluid');
      E(cx + 7 * k, cy + 4 * k, 12 * k, 9.5 * k, 'body');          // 동글동글 몸
      E(cx + 17 * k, cy + 11 * k, 4.5 * k, 3.2 * k, 'body');       // 다리
      E(cx + 4 * k, cy + 12.5 * k, 3.6 * k, 2.4 * k, 'body');      // 팔
      E(cx - 11 * k, cy - 3 * k, 12 * k, 11 * k, 'bone');          // 큰 머리
      E(cx - 11 * k, cy - 3 * k, 10.4 * k, 9.4 * k, 'body');
      E(cx - 22 * k, cy - 1 * k, 2.2 * k, 2.6 * k, 'body');        // 코끝
      E(cx - 3 * k, cy - 11 * k, 4 * k, 1.3 * k, 'fluid');         // 목덜미 투명대
    }
  }
  return S;
}

function grayFan(kind, twins, r){
  const LW = 128, LH = 96;
  const c = document.createElement('canvas');
  c.width = LW; c.height = LH;
  const x2 = c.getContext('2d');
  const img = x2.createImageData(LW, LH), d = img.data;
  const S = shapes(kind, twins);
  for(let y = 0; y < LH; y++) for(let x = 0; x < LW; x++){
    const dx = x - 64, dy = y - 4;
    const rad = Math.hypot(dx, dy), ang = Math.atan2(dx, dy);
    let v = 0;
    if(rad > 9 && rad < 94 && Math.abs(ang) < .72){
      v = 42 + r() * 30 + 14 * Math.sin(rad * .3 + ang * 3);       // 부드러운 조직 결
      for(const s of S){
        const q = d2(x, y, s.cx, s.cy, s.rx, s.ry);
        if(q > 1) continue;
        if(s.v === 'wall') v = 120 + r() * 40;
        else if(s.v === 'fluid') v = 6 + r() * 8;
        else if(s.v === 'bone') v = 215 + r() * 30;
        else v = 175 + r() * 25 - q * 45;
      }
      v *= 1 - rad / 190;
      if(Math.abs(ang) > .68) v *= .6;
    }
    const i = (y * LW + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = clamp(v, 0, 255);
    d[i + 3] = 255;
  }
  x2.putImageData(img, 0, 0);
  return c;
}

// ── 입체 초음파 (정밀 초음파) ──────────────────────
// 실제 입체 초음파 사진을 64×48 도트로 줄이고, 웃는 감은 눈·볼터치·작은 입을 찍어 귀엽게 다듬은 그림이에요.
const PIX3D = 'data:image/png;base64,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';
const pix3d = new Image();
pix3d.src = PIX3D;

// ── 꾸미기: 하트와 이름 스티커 ────────────────────
function heart(x2, cx, cy, s, col){
  x2.fillStyle = col;
  x2.beginPath();
  x2.moveTo(cx, cy + s * .9);
  x2.bezierCurveTo(cx - s * 1.4, cy, cx - s * .8, cy - s * 1.1, cx, cy - s * .35);
  x2.bezierCurveTo(cx + s * .8, cy - s * 1.1, cx + s * 1.4, cy, cx, cy + s * .9);
  x2.fill();
}
function sparkle(x2, cx, cy, s, col){
  x2.fillStyle = col;
  x2.beginPath();
  x2.moveTo(cx, cy - s); x2.quadraticCurveTo(cx, cy, cx + s, cy); x2.quadraticCurveTo(cx, cy, cx, cy + s);
  x2.quadraticCurveTo(cx, cy, cx - s, cy); x2.quadraticCurveTo(cx, cy, cx, cy - s);
  x2.fill();
}
function sticker(x2, text, x, y){
  x2.font = '700 15px Pretendard, "Apple SD Gothic Neo", system-ui, sans-serif';
  const tw = x2.measureText(text).width;
  const w = tw + 46, h = 30, rr = 15;
  x2.save();
  x2.translate(x, y); x2.rotate(-.05);
  x2.fillStyle = 'rgba(0,0,0,.25)';
  x2.beginPath(); x2.roundRect(2, 3, w, h, rr); x2.fill();
  x2.fillStyle = '#FFE3E8';
  x2.beginPath(); x2.roundRect(0, 0, w, h, rr); x2.fill();
  heart(x2, 17, 15, 7, '#F06C87');
  x2.fillStyle = '#7A3443';
  x2.textBaseline = 'middle'; x2.textAlign = 'left';
  x2.fillText(text, 32, 16);
  x2.restore();
}

export function ultrasound(kind, { seed = 'x', twins = false, week = 12, name = '' } = {}){
  const key = [kind, seed, twins, week, name, 4].join('|');
  if(cache.has(key)) return cache.get(key);
  const r = rng(key);
  const big = document.createElement('canvas');
  big.width = OW; big.height = OH;
  const x2 = big.getContext('2d');
  x2.imageSmoothingEnabled = true;
  x2.imageSmoothingQuality = 'high';
  const is3d = kind === 'detail';
  if(is3d) x2.imageSmoothingEnabled = false;      // 정밀 초음파는 도트 그대로 키워요
  x2.drawImage(is3d ? pix3d : grayFan(kind, twins, r), 0, 0, OW, OH);
  if(is3d){
    // 가장자리를 어둡게 (렌즈 느낌)
    const g = x2.createRadialGradient(OW / 2, OH / 2, OH * .35, OW / 2, OH / 2, OH * .85);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,4,0,.35)');
    x2.fillStyle = g; x2.fillRect(0, 0, OW, OH);
  }
  // 화면 글자
  x2.fillStyle = is3d ? '#F6D9CF' : '#D9E2E8';
  x2.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
  x2.textBaseline = 'top';
  x2.textAlign = 'left';
  x2.fillText(is3d ? 'MIRI OB/GYN  3D' : 'MIRI OB/GYN', 10, 8);
  x2.textAlign = 'right';
  x2.fillText(`GA ${week}w${Math.floor(r() * 7)}d`, OW - 10, 8);
  x2.fillText(is3d ? 'SURFACE' : kind === 'nt' ? 'NT 1.4mm' : twins ? 'DCDA' : 'GS', OW - 10, 22);
  if(!is3d) for(let k = 0; k < 9; k++) x2.fillRect(OW - 12, 40 + k * 26, k % 2 ? 4 : 7, 1);
  // 꾸미기
  const who = name || (twins ? '쌍둥이' : '아기');
  const msg = kind === 'sac' ? `안녕, ${who}` : kind === 'nt' ? `${who} 젤리곰 시절` : `${who} 첫 얼굴`;
  sticker(x2, msg, 14, is3d ? 30 : OH - 46);   // 입체 사진은 아래쪽 손이 가려지지 않게 위에 붙여요
  heart(x2, OW - 40, OH - 40, 11, 'rgba(255,150,170,.92)');
  heart(x2, OW - 62, OH - 58, 6, 'rgba(255,190,205,.85)');
  const sy = is3d ? 82 : 46;
  sparkle(x2, 34, sy, 7, 'rgba(255,255,255,.85)');
  sparkle(x2, 50, sy + 16, 4, 'rgba(255,255,255,.7)');
  if(twins && !is3d){
    x2.fillStyle = '#FFFFFF';
    x2.font = '700 13px ui-monospace, SFMono-Regular, Menlo, monospace';
    x2.textAlign = 'center'; x2.textBaseline = 'middle';
    const pos = kind === 'sac' ? [[46, 32], [84, 34]] : [[44, 24], [86, 40]];
    pos.forEach(([px, py], k) => x2.fillText(k ? 'B' : 'A', px * 3, py * 3));
  }
  const url = big.toDataURL('image/png');
  if(!is3d || pix3d.complete) cache.set(key, url);   // 도트 사진이 아직 덜 읽혔으면 다음에 다시 그려요
  return url;
}

export const ULTRA_LABEL = { sac:'첫 초음파 · 아기집', nt:'1차 기형아 검사 · 젤리곰', detail:'정밀 초음파 · 입체 얼굴' };
export const ULTRA_WEEK = { sac:6, nt:12, detail:21 };
