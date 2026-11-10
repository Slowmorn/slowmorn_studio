// 도트 그림 — 임신기에는 아내·남편과 아내 배 속의 태아, 출산 뒤에는 만 3세 아이까지, 시기에 맞는 장면을 그려요.
// 96×64 작은 캔버스에 점을 찍고, 화면에는 image-rendering: pixelated 로 크게 보여 줘요.
// 캐릭터는 따로 그린 뒤 테두리(외곽선)를 한 겹 둘러서 도트 느낌을 살려요.
import { BIRTH_T, PREG_START } from './events.js?v=20261111p';

export const W = 96, H = 64;

const C = {
  line:'#5B3A30', skin:'#F8D0B4', skinS:'#EDB08F', cheek:'#F59C9C', eye:'#3B2A25', hair:'#7A5240', hairL:'#93684F',
  bgP:'#FBE4DF', bgPd:'#F7D4CE', womb:'#F4B7B2', wombD:'#E99C99', fluid:'#FDEAE6', fluidL:'#FFF6F3', bubble:'#FFFFFF',
  cord:'#E58F9C', heart:'#E5484D',
  wall:'#FFF5EC', wallD:'#FCEADB', floor:'#F0D8C2', floorD:'#E2C1A4', win:'#CDE7F5', winL:'#EAF6FC', frame:'#FFFFFF',
  c1:'#FFB38A', c1s:'#EF8E60', c2:'#9FD6B9', c2s:'#6EBE96', pants:'#7E9CD6', pantsS:'#6482BF',
  mat:'#FBE7AE', matS:'#F1D27A', bas:'#E9D8F2', basS:'#CDB3DD', bag:'#E8746A', zz:'#9A88AE', star:'#FFD36B',
  hairW:'#5A3A2E', dress:'#F4A7B0', dressS:'#E3858F', shoe:'#8C5E4A', shirt:'#8FB7E3', shirtS:'#6E98CC', pantsM:'#5D6B8A',
};

// ── 그리기 도구 ───────────────────────────────
class Layer {
  constructor(w = W, h = H){
    this.c = document.createElement('canvas');
    this.c.width = w; this.c.height = h;
    this.x = this.c.getContext('2d');
  }
  clear(){ this.x.clearRect(0, 0, this.c.width, this.c.height); }
  px(x, y, col){ this.x.fillStyle = col; this.x.fillRect(Math.round(x), Math.round(y), 1, 1); }
  rect(x, y, w, h, col){ this.x.fillStyle = col; this.x.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  ell(cx, cy, rx, ry, col){
    cx = Math.round(cx); cy = Math.round(cy); rx = Math.max(1, Math.round(rx)); ry = Math.max(1, Math.round(ry));
    this.x.fillStyle = col;
    for(let y = -ry; y <= ry; y++){
      const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / ((ry + .5) * (ry + .5)))) + .35);
      this.x.fillRect(cx - half, cy + y, half * 2 + 1, 1);
    }
  }
  disc(cx, cy, r, col){ this.ell(cx, cy, r, r, col); }
  ring(cx, cy, r, col){
    cx = Math.round(cx); cy = Math.round(cy);
    for(let a = 0; a < 360; a += 4){
      const t = a * Math.PI / 180;
      this.px(cx + Math.round(Math.cos(t) * r), cy + Math.round(Math.sin(t) * r), col);
    }
  }
  // 그린 모양 바깥쪽 한 칸에 테두리를 둘러요
  outline(col = C.line){
    const { width:w, height:h } = this.c;
    const img = this.x.getImageData(0, 0, w, h), d = img.data;
    const a = i => d[i * 4 + 3] > 0;
    const mark = [];
    for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
      const i = y * w + x;
      if(a(i)) continue;
      if((x > 0 && a(i - 1)) || (x < w - 1 && a(i + 1)) || (y > 0 && a(i - w)) || (y < h - 1 && a(i + w))) mark.push(i);
    }
    const [r, g, b] = [1, 3, 5].map(k => parseInt(col.slice(k, k + 2), 16));
    for(const i of mark){ d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
    this.x.putImageData(img, 0, 0);
  }
}

// ── 시기별 크기와 한 줄 설명 ───────────────────────
const FETUS = [ // 주, 비유, 크기
  [4, '양귀비씨', '약 0.2cm'], [6, '렌틸콩', '약 0.6cm'], [8, '라즈베리', '약 1.6cm'], [10, '딸기', '약 3cm'],
  [12, '라임', '약 5cm'], [14, '레몬', '약 9cm'], [16, '아보카도', '약 12cm'], [18, '고구마', '약 14cm'],
  [20, '바나나', '약 25cm'], [22, '파파야', '약 28cm'], [24, '옥수수', '약 30cm · 600g'], [26, '양상추', '약 35cm · 800g'],
  [28, '가지', '약 37cm · 1kg'], [30, '양배추', '약 40cm · 1.3kg'], [32, '단호박', '약 42cm · 1.7kg'], [34, '멜론', '약 45cm · 2.1kg'],
  [36, '파인애플', '약 47cm · 2.6kg'], [38, '작은 수박', '약 49cm · 3kg'], [40, '수박', '약 50cm · 3.3kg'],
];
const BABY = [ // 개월, 키·몸무게, 하는 일
  [0, '50cm · 3.3kg', '하루 대부분을 자요'], [1, '54cm · 4.3kg', '눈을 맞추기 시작해요'], [2, '58cm · 5.4kg', '방긋 웃어요'],
  [3, '61cm · 6.2kg', '목을 가눠요'], [4, '63cm · 6.8kg', '뒤집기를 해요'], [6, '67cm · 7.6kg', '혼자 앉아요'],
  [9, '71cm · 8.6kg', '기어 다녀요'], [12, '75cm · 9.5kg', '첫걸음을 떼요'], [15, '78cm · 10.2kg', '아장아장 걸어요'],
  [18, '81cm · 10.9kg', '단어를 말해요'], [24, '87cm · 12.2kg', '두 단어로 말해요'], [30, '91cm · 13.3kg', '"내가 할래!"가 늘어요'],
  [36, '95cm · 14.3kg', '친구랑 놀아요'],
];
const pick = (list, v) => list.reduce((acc, row) => row[0] <= v ? row : acc, list[0]);

// 머리 아래 한 줄: "콩콩이는 지금 라임만 해요 · 약 5cm"
export function caption(t, name, twins){
  const who = name || (twins ? '쌍둥이' : '아기');
  const i = Math.floor(t + 1e-6);
  if(i < BIRTH_T){
    const [, fruit, size] = pick(FETUS, i + PREG_START);
    return `${who}${twins ? '는 각각' : '는 지금'} ${fruit}만 해요 · ${size}`;
  }
  const [, size, doing] = pick(BABY, i - BIRTH_T);
  return `${size}${twins ? ' (한 명 기준)' : ''} · ${doing}`;
}

// ── 장면 ────────────────────────────────────
const L = { char:null, tmp:null, p2:null };
function layers(){
  if(!L.char){ L.char = new Layer(); L.tmp = new Layer(); L.p2 = new Layer(); }
  return L;
}

// main: 96×64 Layer, t: 시간 축, now: ms (움직임용)
export function drawScene(main, t, twins, now){
  const i = Math.floor(t + 1e-6);
  main.clear();
  if(i < BIRTH_T) couple(main, i + PREG_START, twins, now);
  else room(main, i - BIRTH_T, twins, now);
}

// 임신기: 아내와 남편, 그리고 아내 배 속 창으로 보이는 태아
function couple(m, week, twins, now){
  // 바탕: 방 벽과 바닥
  m.rect(0, 0, W, 52, C.bgP);
  for(let y = 3; y < 52; y += 6) for(let x = (y / 6 % 2) * 3 + 2; x < W; x += 6) m.px(x, y, C.bgPd);
  m.rect(0, 52, W, 12, C.floor);
  for(let y = 56; y < H; y += 4) m.rect(0, y, W, 1, C.floorD);
  // 벽에 걸린 액자 (하트)
  m.rect(82, 8, 10, 9, C.frame); m.rect(83, 9, 8, 7, C.winL);
  m.rect(85, 11, 2, 1, C.heart); m.rect(88, 11, 2, 1, C.heart); m.rect(85, 12, 5, 1, C.heart); m.rect(86, 13, 3, 1, C.heart); m.px(87, 14, C.heart);

  const g = Math.min(1, Math.max(0, (week - 4) / 36));
  const R = Math.round(6 + g * 7 + (twins ? g * 1.5 : 0));     // 배 반지름 6 → 13
  const wx = 32, wy = 15;                                       // 아내 머리
  const bx = wx + 2, by = 40;                                   // 배 가운데
  const ir = R - 3;                                             // 배 속 창 반지름
  const { char, tmp, p2 } = layers();
  m.ell(wx, 60, 11, 2, C.floorD); m.ell(70, 60, 10, 2, C.floorD);

  // ── 아내
  char.clear();
  char.ell(wx, wy + 4, 10, 12, C.hairW);                        // 뒷머리 (긴 머리)
  char.rect(wx - 5, 50, 3, 8, C.skin); char.rect(wx + 2, 50, 3, 8, C.skin);
  char.rect(wx - 6, 58, 5, 2, C.shoe); char.rect(wx + 2, 58, 5, 2, C.shoe);
  for(let y = 24; y <= 51; y++){ const hw = Math.round(5 + (y - 24) * .28); char.rect(wx - hw, y, hw * 2 + 1, 1, C.dress); }
  char.rect(wx - 9, 26, 3, 9, C.dress); char.rect(wx - 9, 35, 3, 3, C.skin);   // 왼팔
  char.disc(bx, by, R, C.dressS);                               // 배
  char.disc(bx, by, R - 1, C.dress);
  char.disc(bx, by, R - 2, C.wombD);                            // 배 속 창
  char.disc(bx, by, ir, C.fluid);
  char.disc(wx, wy, 9, C.skin);                                 // 얼굴
  for(let y = wy - 9; y <= wy - 4; y++){                        // 앞머리
    const half = Math.floor(Math.sqrt(Math.max(0, 81 - (y - wy) ** 2)));
    char.rect(wx - half, y, half * 2 + 1, 1, C.hairW);
  }
  char.rect(wx - 9, wy - 4, 2, 12, C.hairW); char.rect(wx + 8, wy - 4, 2, 12, C.hairW);
  face(char, wx, wy - 1, 9);
  // 배 속 태아 (탯줄은 창 안에만)
  const inside = (x, y) => Math.hypot(x - bx, y - by) < ir - .5;
  tmp.clear();
  if(twins){
    babyInWomb(tmp, char, bx - ir * .45, by + 1, week, now, fitK(week, ir * .55), 0, inside);
    babyInWomb(tmp, char, bx + ir * .45, by - 1, week, now + 700, fitK(week, ir * .55), 1, inside);
  } else {
    babyInWomb(tmp, char, bx, by, week, now, fitK(week, ir), 0, inside);
  }
  tmp.outline();
  char.x.drawImage(tmp.c, 0, 0);
  if(week >= 6 && week < 12 && (now % 900) < 300){             // 콩닥콩닥 심장
    const hs = twins ? [[bx - ir * .45, by + 1], [bx + ir * .45, by - 1]] : [[bx, by]];
    for(const [hx, hy] of hs) char.px(hx, hy, C.heart);
  }
  char.outline();
  m.x.drawImage(char.c, 0, 0);

  // ── 남편: 아내 배에 손을 얹고 토닥토닥
  const hx = 70, hy = 12;
  const pat = Math.floor(now / 380) % 4 === 1 ? 1 : 0;
  p2.clear();
  p2.rect(hx - 5, 47, 4, 11, C.pantsM); p2.rect(hx + 1, 47, 4, 11, C.pantsM);
  p2.rect(hx - 6, 58, 6, 2, C.shoe); p2.rect(hx + 1, 58, 6, 2, C.shoe);
  p2.rect(hx - 7, 22, 15, 26, C.shirt);
  p2.rect(hx - 7, 45, 15, 2, C.shirtS);
  p2.rect(hx + 8, 24, 3, 14, C.shirt); p2.rect(hx + 8, 38, 3, 3, C.skin);      // 오른팔
  // 왼팔: 어깨에서 아내 배 오른쪽까지
  const ax0 = hx - 7, ay0 = 25, ax1 = bx + R - 2, ay1 = by - 3 + pat;
  for(let s2 = 0; s2 <= 1; s2 += .02){
    const x = ax0 + (ax1 - ax0) * s2, y = ay0 + (ay1 - ay0) * s2 + Math.sin(s2 * Math.PI) * 2;
    p2.rect(x, y - 1, 2, 3, s2 > .8 ? C.skin : C.shirt);
  }
  p2.disc(hx, hy, 9, C.skin);
  for(let y = hy - 9; y <= hy - 5; y++){                        // 짧은 머리
    const half = Math.floor(Math.sqrt(Math.max(0, 81 - (y - hy) ** 2)));
    p2.rect(hx - half, y, half * 2 + 1, 1, y % 2 ? C.hairL : C.hair);
  }
  p2.rect(hx - 9, hy - 5, 2, 3, C.hair); p2.rect(hx + 8, hy - 5, 2, 3, C.hair);
  face(p2, hx, hy, 9);
  p2.outline();
  m.x.drawImage(p2.c, 0, 0);

  // 토닥일 때 하트가 떠올라요
  const ph = (now % 3000) / 3000;
  if(ph < .5 && now){
    const ty = Math.round(by - R - 3 - ph * 16), tx = bx + 4;
    m.rect(tx, ty, 2, 1, C.heart); m.rect(tx + 3, ty, 2, 1, C.heart); m.rect(tx, ty + 1, 5, 1, C.heart); m.rect(tx + 1, ty + 2, 3, 1, C.heart); m.px(tx + 2, ty + 3, C.heart);
  }
}

// 창 크기(반지름 r)에 맞게 태아 크기를 줄이는 배율
function fitK(week, r){
  if(week < 10) return Math.min(1, (r * .8) / (1.5 + (week - 4) * 1.1));
  const g = Math.min(1, (week - 10) / 30);
  return Math.min(1, (2 * r - 1) / 3.3 / (4.5 + 4 * g));
}

function babyInWomb(L1, cordL, cx, cy, week, now, k, seed, inside){
  const bob = Math.floor(now / 650) % 2;
  if(week < 10){
    // 콩 모양 배아
    const s = Math.max(.6, (1.5 + (week - 4) * 1.1) * k);
    L1.ell(cx, cy + bob, s * .75, s, C.skin);
    if(s > 1.5) L1.disc(cx - s * .2, cy - s * .7 + bob, s * .55, C.skin);
    if(week >= 8 && s > 2) L1.px(cx + s * .1, cy - s * .7 + bob, C.eye);
    return;
  }
  const g = Math.min(1, (week - 10) / 30);
  const hr = (4.5 + 4 * g) * k;            // 머리가 크고 몸이 작은 비율로 귀엽게
  const hx = cx - hr * .3, hy = cy - hr * .5 + bob;
  const bx = cx + hr * .5, by = cy + hr * .65 + bob;
  const kick = (Math.floor(now / 2600 + seed) % 3 === 0) && (now % 2600) < 400 ? 1 : 0;
  // 탯줄 (태아 뒤에 깔려요)
  for(let s = 0; s <= 1; s += .04){
    const x = bx + hr * .2 + s * (hr * 1.6), y = by - (s * hr * 1.6) + Math.sin(s * 9 + now / 500) * 1.2;
    if(!inside || inside(x, y)) cordL.px(x, y, C.cord);
  }
  L1.ell(bx, by, hr * .75, hr * .85, C.skin);                          // 몸
  L1.ell(bx + hr * .35 + kick, by + hr * .75, hr * .55, hr * .32, C.skinS);       // 다리
  L1.disc(hx, hy, hr, C.skin);                                         // 머리
  L1.ell(hx + hr * .65, hy + hr * .85, hr * .3, hr * .25, C.skinS);   // 손
  if(hr >= 3){
    L1.rect(hx + hr * .25, hy + hr * .05, Math.max(1, hr * .3), 1, C.eye);      // 감은 눈
    L1.rect(hx + hr * .3, hy + hr * .45, Math.max(1, hr * .25), 1, C.cheek);
  }
}

// 아기방
function room(m, month, twins, now){
  m.rect(0, 0, W, 44, C.wall);
  for(let x = 0; x < W; x += 8) m.rect(x, 0, 4, 44, C.wallD);
  m.rect(0, 44, W, 20, C.floor);
  for(let y = 48; y < H; y += 5) m.rect(0, y, W, 1, C.floorD);
  // 창문 + 햇빛
  m.rect(7, 7, 22, 18, C.frame);
  m.rect(9, 9, 8, 6, C.win); m.rect(19, 9, 8, 6, C.win); m.rect(9, 17, 8, 6, C.win); m.rect(19, 17, 8, 6, C.win);
  m.px(10, 10, C.winL); m.px(11, 10, C.winL); m.px(20, 10, C.winL);
  // 모빌 / 별 장식
  if(month < 12){
    const sw = Math.round(Math.sin(now / 700) * 1.5);
    m.rect(70, 0, 1, 8, C.basS);
    m.rect(64 + sw, 8, 14, 1, C.basS);
    m.rect(64 + sw, 9, 1, 3, C.basS); m.rect(77 + sw, 9, 1, 3, C.basS);
    star(m, 64 + sw, 13); star(m, 77 + sw, 13);
  } else {
    star(m, 72, 10); star(m, 84, 16); star(m, 62, 18);
  }
  const { char } = layers();
  char.clear();
  const spots = twins ? (month >= 3 && month < 12 && month !== 6 && month !== 7 && month !== 8 ? [[28, 0], [66, 1]] : [[34, 0], [62, 1]]) : [[48, 0]];
  if(month < 3){
    // 아기 바구니 침대
    const bw = twins ? 54 : 34, bx = 48 - bw / 2;
    m.rect(bx + 2, 50, 2, 8, C.basS); m.rect(bx + bw - 4, 50, 2, 8, C.basS);
    char.rect(bx, 38, bw, 12, C.bas);
    for(const [x, i] of spots) swaddled(char, x + (twins ? 0 : 0), 36, i);
    char.rect(bx, 41, bw, 9, C.bas);
    for(let x = bx + 2; x < bx + bw - 1; x += 4) char.rect(x, 43, 2, 5, C.basS);
    for(const [x] of spots) zzz(m, x + 8, 30, now);
  } else if(month < 6){
    m.ell(48, 54, twins ? 40 : 26, 5, C.matS); m.ell(48, 53, twins ? 39 : 25, 4, C.mat);
    for(const [x, i] of spots) tummy(char, x, 49, i, now);
  } else if(month < 9){
    for(const [x, i] of spots) sitting(char, x, 56, i, now);
  } else if(month < 12){
    for(const [x, i] of spots) crawling(char, x, 54, i, now);
  } else {
    const big = month >= 30 ? 2 : month >= 18 ? 1 : 0;
    for(const [x, i] of spots) standing(char, x, 58, i, now, big, month);
  }
  char.outline();
  m.x.drawImage(char.c, 0, 0);
}

function star(m, x, y){ m.px(x, y - 1, C.star); m.rect(x - 1, y, 3, 1, C.star); m.px(x, y + 1, C.star); }
function zzz(m, x, y, now){
  const p = Math.floor(now / 500) % 3;
  for(let k = 0; k <= p; k++){
    const zx = x + k * 4, zy = y - k * 5;
    m.rect(zx, zy, 3, 1, C.zz); m.px(zx + 1, zy + 1, C.zz); m.rect(zx, zy + 2, 3, 1, C.zz);
  }
}
const cloth = i => i ? [C.c2, C.c2s] : [C.c1, C.c1s];

function face(L1, x, y, r, side = 0){
  // side: 0 정면, 1 오른쪽 보기
  const ex = side ? [x + r * .45] : [x - r * .4, x + r * .4];
  for(const e of ex){ L1.rect(e, y, 1, 2, C.eye); }
  for(const e of ex){ L1.rect(e - (side ? 0 : 1), y + 3, 2, 1, C.cheek); }
  if(!side) L1.px(x, y + 3, C.eye);
}
function hair(L1, x, y, r, i, amount){
  // amount 0: 한 가닥, 1: 짧은 머리, 2: 더 덮은 머리
  if(amount === 0){ L1.px(x, y - r - 1, C.hair); L1.px(x + 1, y - r - 2, C.hair); return; }
  for(let dx = -r; dx <= r; dx++){
    const top = Math.round(y - Math.sqrt(Math.max(0, r * r - dx * dx)));
    const len = amount === 2 ? 3 : 2;
    L1.rect(x + dx, top, 1, len - (Math.abs(dx) > r - 2 ? 1 : 0), dx % 3 === 0 ? C.hairL : C.hair);
  }
  if(i === 1 && amount === 2){ L1.rect(x + r - 1, y - 2, 2, 3, C.hair); L1.rect(x - r - 1, y - 2, 2, 3, C.hair); }
}

function swaddled(L1, x, y, i){
  const [c, cs] = cloth(i);
  L1.ell(x + 7, y + 2, 10, 5, c);
  L1.rect(x + 2, y + 2, 14, 1, cs);
  L1.disc(x - 3, y, 6, C.skin);
  L1.rect(x - 5, y, 2, 1, C.eye); L1.rect(x - 1, y, 2, 1, C.eye);
  L1.rect(x - 6, y + 2, 2, 1, C.cheek);
  hair(L1, x - 3, y, 6, i, 0);
}
function tummy(L1, x, y, i, now){
  const [c, cs] = cloth(i);
  const kick = Math.floor(now / 400 + i) % 2;
  L1.ell(x + 5, y, 9, 4, c);
  L1.rect(x + 12, y - 1 - kick, 4, 3, cs);           // 발 버둥
  L1.rect(x - 5, y + 2, 3, 3, C.skin);               // 팔
  L1.disc(x - 6, y - 5, 6, C.skin);
  face(L1, x - 6, y - 6, 6, 1);
  hair(L1, x - 6, y - 5, 6, i, 0);
}
function sitting(L1, x, y, i, now){
  const [c, cs] = cloth(i);
  const wave = Math.floor(now / 350 + i) % 2;
  L1.ell(x, y - 2, 9, 3, cs);                         // 다리
  L1.rect(x - 9, y - 3, 3, 3, C.skin); L1.rect(x + 7, y - 3, 3, 3, C.skin);
  L1.ell(x, y - 9, 7, 7, c);                          // 몸
  L1.rect(x - 9, y - 12 - wave * 3, 3, 6, C.skin);    // 팔 흔들기
  L1.rect(x + 7, y - 12 - (1 - wave) * 3, 3, 6, C.skin);
  L1.disc(x, y - 21, 8, C.skin);
  face(L1, x, y - 22, 8);
  hair(L1, x, y - 21, 8, i, 0);
}
function crawling(L1, x, y, i, now){
  const [c, cs] = cloth(i);
  const st = Math.floor(now / 300 + i) % 2;
  L1.rect(x - 6 + st, y - 4, 3, 5, C.skin); L1.rect(x - 1 - st, y - 4, 3, 5, C.skin);  // 팔
  L1.rect(x + 7 - st, y - 3, 4, 4, cs); L1.rect(x + 11 + st, y - 3, 3, 4, cs);           // 다리
  L1.ell(x + 4, y - 8, 9, 5, c);
  L1.disc(x - 7, y - 11, 7, C.skin);
  face(L1, x - 7, y - 12, 7, 1);
  hair(L1, x - 7, y - 11, 7, i, 1);
}
// 서기·걷기·만 3세: big 0 아장아장, 1 걷고 뛰기, 2 가방 멘 아이
function standing(L1, x, y, i, now, big, month){
  const [c, cs] = cloth(i);
  const ph = Math.floor(now / (big ? 260 : 420) + i) % 2;
  const sway = big ? 0 : (ph ? 1 : -1);
  const hr = big === 2 ? 8 : 9 - (big ? 0 : 1);
  const bodyH = 9 + big * 2, legH = 5 + big * 2;
  const bx = x + sway;
  // 다리
  const l1 = big ? (ph ? 1 : -1) : 0;
  L1.rect(bx - 3 + l1, y - legH, 3, legH, C.pants);
  L1.rect(bx + 1 - l1, y - legH, 3, legH, C.pants);
  L1.rect(bx - 4 + l1, y - 1, 4, 1, C.pantsS); L1.rect(bx + 1 - l1, y - 1, 4, 1, C.pantsS);
  // 가방
  if(big === 2){ L1.rect(bx + 5, y - legH - bodyH + 1, 4, 7, C.bag); }
  // 몸
  L1.rect(bx - 5, y - legH - bodyH, 11, bodyH, c);
  L1.rect(bx - 5, y - legH - 2, 11, 1, cs);
  // 팔: 아장아장은 두 팔 들기, 크면 한 팔 흔들기
  if(big === 0){
    L1.rect(bx - 8, y - legH - bodyH - 3, 3, 6, C.skin); L1.rect(bx + 6, y - legH - bodyH - 3, 3, 6, C.skin);
  } else {
    L1.rect(bx - 7, y - legH - bodyH + 1 + (ph ? 0 : -2), 2, 7, C.skin);
    L1.rect(bx + 6, y - legH - bodyH + 1 + (ph ? -2 : 0), 2, 7, C.skin);
  }
  // 머리
  const hy = y - legH - bodyH - hr + 1;
  L1.disc(bx, hy, hr, C.skin);
  face(L1, bx, hy - 1, hr);
  hair(L1, bx, hy, hr, i, month >= 18 ? 2 : 1);
}

// ── 캔버스에 붙이기 ──────────────────────────────
// canvas 하나에 장면을 계속 그려 주는 작은 플레이어. get() 이 { t, twins } 를 돌려줘요
export function mountScene(canvas, get){
  const main = new Layer();
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, last = 0;
  function paint(now){
    const { t, twins } = get();
    drawScene(main, t, twins, reduce ? 0 : now);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(main.c, 0, 0);
  }
  function frame(now){
    raf = requestAnimationFrame(frame);
    if(now - last < 90) return;             // 도트 그림이라 초당 10장 정도면 충분해요
    last = now;
    paint(now);
  }
  paint(0);                                 // 첫 장은 바로 그려 둬요 (움직임이 멈춘 화면에서도 보이게)
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

// 한 장만 그려서 이미지 주소로 (정리 화면용)
export function sceneImage(t, twins){
  const main = new Layer();
  drawScene(main, t, twins, 0);
  return main.c.toDataURL();
}
