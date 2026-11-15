// 도트 그림 — 임신기에는 곰 부부와 그 사이에 크게 보이는 배 속, 출산 뒤에는 만 3세 아기 곰까지, 시기에 맞는 장면을 그려요.
// 80×40 작은 캔버스에 점을 찍고, 화면에는 image-rendering: pixelated 로 크게 보여 줘요.
// 캐릭터는 한 줄씩 글자로 적은 도트 지도(스프라이트)를 찍어요. 테두리까지 지도에 들어 있어요.
import { BIRTH_T, PREG_START } from './events.js?v=20261117c';

// 높이는 40칸 그대로, 가로 칸 수는 그림이 놓인 자리의 폭에 맞춰 늘어나요 (최소 80칸). 사람·벽난로·트리는 가운데를 기준으로 놓아요
export let W = 80;
export const H = 52;
// 장면은 40칸 높이로 그리고, 위에 벽을 TOP 칸 더 붙여요. 남는 아래 3칸은 마룻바닥 한 줄이 더 깔려요 (캐릭터 크기는 그대로)
const TOP = 9;
export const MIN_W = 140;   // 부부와 아기, 벽난로, 트리가 다 들어가는 가장 좁은 폭
// 크리스마스 시즌: 벽난로·트리·선물이 있는 거실을 배경으로 써요. 시즌이 끝나면 false 로
const XMAS = true;

const C = {
  line:'#3E3343', eye:'#2E2530', cheek:'#F29A9A',
  bgP:'#FBE4DF', bgPd:'#F5D3CC', womb:'#F4B7B2', wombD:'#E99C99', fluid:'#FDEAE6', fluidL:'#FFF6F3', bubble:'#FFFFFF',
  cord:'#E58F9C', heart:'#E5484D',
  wall:'#FFF5EC', wallD:'#FCEADB', floor:'#F0D8C2', floorD:'#E2C1A4', win:'#CDE7F5', winL:'#EAF6FC', frame:'#FFFFFF',
  mat:'#FBE7AE', matS:'#F1D27A', bas:'#E9D8F2', basS:'#CDB3DD', bag:'#E8746A', zz:'#9A88AE', star:'#FFD36B',
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
  // 19주까지는 다리를 웅크리고 있어서 머리~엉덩이 길이로, 20주부터는 머리~발끝 키로 재요 (그래서 20주에 숫자가 크게 뛰어요)
  [4, '양귀비씨', '약 0.2cm'], [6, '렌틸콩', '약 0.6cm'], [8, '라즈베리', '머리~엉덩이 약 1.6cm'], [10, '딸기', '머리~엉덩이 약 3cm'],
  [12, '라임', '머리~엉덩이 약 5cm'], [14, '레몬', '머리~엉덩이 약 9cm'], [16, '아보카도', '머리~엉덩이 약 12cm'], [18, '고구마', '머리~엉덩이 약 14cm'],
  [20, '바나나', '머리~엉덩이 약 16cm · 발끝까지 약 25cm'], [22, '파파야', '키 약 28cm'], [24, '옥수수', '키 약 30cm · 600g'], [26, '양상추', '키 약 35cm · 800g'],
  [28, '가지', '키 약 37cm · 1kg'], [30, '양배추', '키 약 40cm · 1.3kg'], [32, '단호박', '키 약 42cm · 1.7kg'], [34, '멜론', '키 약 45cm · 2.1kg'],
  [36, '파인애플', '키 약 47cm · 2.6kg'], [38, '작은 수박', '키 약 49cm · 3kg'], [40, '수박', '키 약 50cm · 3.3kg'],
];
const BABY = [ // 개월, 키·몸무게, 하는 일
  [0, '50cm · 3.3kg', '하루 대부분을 자요'], [1, '54cm · 4.3kg', '눈을 맞추기 시작해요'], [2, '58cm · 5.4kg', '방긋 웃어요'],
  [3, '61cm · 6.2kg', '목을 가눠요'], [4, '63cm · 6.8kg', '뒤집기를 해요'], [6, '67cm · 7.6kg', '혼자 앉아요'],
  [9, '71cm · 8.6kg', '기어 다녀요'], [12, '75cm · 9.5kg', '첫걸음을 떼요'], [15, '78cm · 10.2kg', '아장아장 걸어요'],
  [18, '81cm · 10.9kg', '단어를 말해요'], [24, '87cm · 12.2kg', '두 단어로 말해요'], [30, '91cm · 13.3kg', '"내가 할래!"가 늘어요'],
  [36, '95cm · 14.3kg', '친구랑 놀아요'],
];
const pick = (list, v) => list.reduce((acc, row) => row[0] <= v ? row : acc, list[0]);

// 엄마 몸은 지금 어떤지 (주수·개월 기준): 아기 소식 아래에 한 줄로 보여 줘요
const MOM = [   // 여러 가지면 · 로 이어요
  [4, '생리가 늦어져요 · 가슴이 붓고 쉽게 피곤해요 · 아랫배가 살짝 당겨요'],
  [6, '입덧이 시작돼요(빈속일 때 더 메스꺼워요) · 냄새에 예민해져요 · 화장실을 자주 가요'],
  [8, '입덧이 가장 심한 때예요 · 어지럽고 자꾸 졸려요 · 침이 많아지기도 해요'],
  [10, '입덧과 피로가 이어져요 · 갑자기 일어나면 어지러워요 · 변비가 생겨요'],
  [12, '입덧이 조금씩 줄어들어요 · 아랫배가 조금 단단해져요'],
  [14, '몸이 한결 편해지고 입맛이 돌아와요 · 코가 막히거나 잇몸에서 피가 나기도 해요'],
  [16, '배가 나오기 시작해요 · 몸을 돌릴 때 아랫배가 찌릿해요 · 속쓰림이 오면 조금씩 자주 먹어요'],
  [18, '첫 태동을 느낄 수 있어요(콕콕, 간질간질) · 허리가 뻐근해요'],
  [20, '배가 가끔 딱딱하게 뭉쳐요(쉬면 풀려요) · 허리가 아파요 · 바로 눕기보다 옆으로 누워요'],
  [22, '다리에 쥐가 잘 나요 · 배와 가슴에 튼살이 생기기 시작해요 · 배뭉침이 잦아져요'],
  [24, '속쓰림과 소화불량이 생겨요 · 숨이 조금 차요 · 식사는 조금씩 자주'],
  [26, '갈비뼈 아래가 아파요 · 누웠다 일어나기 힘들어요(옆으로 돌아서 일어나요) · 발톱 깎기, 양말 신기가 어려워져요'],
  [28, '다리와 발이 붓고 밤에 자주 깨요 · 배뭉침이 더 잦아져요 · 갈비뼈 통증이 이어져요'],
  [30, '숨이 차고 속쓰림이 심해져요 · 손목과 손가락이 저리기도 해요 · 발톱 깎기, 신발 신기는 도움을 받아요'],
  [32, '배뭉침이 잦아요(규칙적으로 오거나 아프면 병원에 연락해요) · 편한 잠자리를 찾기 어려워요'],
  [34, '화장실을 더 자주 가요 · 숨이 차고 쉽게 지쳐요'],
  [36, '아기가 내려가 숨쉬기는 편해져요 · 골반과 치골이 아파요 · 배뭉침이 더 잦아져요'],
  [38, '언제든 진통이 올 수 있어요 · 이슬, 양수가 새는 느낌을 알아 둬요 · 출산 가방은 현관에'],
];
const MOM_AFTER = [   // 출산 뒤 개월
  [0, '오로가 나오고 회음부나 수술 부위가 아파요. 최대한 쉬어요'],
  [1, '밤 수유로 잠이 모자라요. 아기가 잘 때 같이 자요'],
  [2, '머리카락이 빠지기 시작해요(산후 탈모). 대부분 다시 나요'],
  [3, ''],
];
export function momNote(t, twins){
  const i = Math.floor(t + 1e-6);
  if(i < BIRTH_T){
    const week = i + PREG_START;
    // 쌍둥이는 배가 더 빨리 불러와서 몸의 변화가 일찍 와요: 20주부터 2주, 22주부터는 4주쯤 (첫 태동 18주는 그대로, 초기에는 입덧이 더 심할 수 있어요)
    if(twins && week >= 20) return pick(MOM, Math.min(38, week + (week >= 22 ? 4 : 2)))[1];
    if(twins && week >= 14) return pick(MOM, week)[1];
    const text = pick(MOM, week)[1];
    return twins && week >= 6 ? text + ' · 쌍둥이는 입덧이 더 심할 수 있어요' : text;
  }
  return pick(MOM_AFTER, i - BIRTH_T)[1];
}

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


// ── 사람 스프라이트 ─────────────────────────────
// o 테두리 · f 피부 · s 피부 그늘 · e 눈 · c 볼 · m 입 · h 머리카락 · H 머리 윤기 · t 옷 · u 옷 그늘 · l 옷 밝은 곳 · g 다리 · G 다리 그늘 · . 빈칸
// 머리가 크고 몸이 작은 비율, 모서리를 깎은 둥근 머리. 얼굴은 오른쪽을 살짝 봐요 (3/4)
// 머리 모양은 덮어 그리는 지도(HAIR)로 바꿔요. '.' 은 밑그림 그대로
const HEAD_ADULT = [           // 17칸 폭, 0~12줄
  '.................',
  '.................',
  '.....ooooooo.....',
  '...oofffffffoo...',
  '..offfffffffffo..',
  '.offfffffffffffo.',
  'offffffefffffeffo',
  'offffffefffffeffo',
  'offfffcfffffffcfo',
  'offfffffffmfffffo',
  '.offfffffffffffo.',
  '..ossssssssssso..',
  '...ooooooooooo...',
];
const BODY_ADULT = [           // 13~20줄
  '....ottttttto....',
  '...ottttttttto...',
  '..oftttttttttfo..',
  '..offtttttttffo..',
  '...ootttttttoo...',
  '....ouuuuuuuo....',
  '....ogggogggo....',
  '.....ooo.ooo.....',
];
const HAIR = {
  // 짧은 머리
  short:{ 1:'.....ooooooo.....', 2:'...oohhHHhhhoo...', 3:'..ohhhhhhHhhhho..', 4:'.ohhhhhhhhhhhhho.', 5:'ohhhhhhhhhhhfhhfo', 6:'ohhhfffefffffeffo', 7:'ohhffffefffffeffo' },
  // 가르마 (이마가 보이게 넘긴 머리)
  part:{ 1:'.....ooooooo.....', 2:'...oohhhHHhhoo...', 3:'..ohhhhhhhhHhho..', 4:'.ohhhhhhhhhhhhfo.', 5:'ohhhhhhhhhhfffffo', 6:'ohhhfffefffffeffo', 7:'ohhffffefffffeffo' },
  // 아주 짧은 머리
  buzz:{ 3:'...oohhhhhhhoo...', 4:'..ohhhhhHhhhhho..', 5:'.ohhhffffffffffo.' },
  // 아내 머리 윗부분 (긴 머리·묶은 머리·올림머리가 같이 써요): 둥근 머리 위를 덮고 앞머리는 옆으로 넘겨 이마가 살짝 보여요
  cap:{ 1:'....ooooooooo....', 2:'..oohhhhHHhhhoo..', 3:'.ohhhhhhhhhHhhho.', 4:'ohhhhhhhhhhhhhhho', 5:'ohhhhhhhhhhhhfffo',
        6:'ohhhfffefffffeffo', 7:'ohhffffefffffeffo' },
  // 긴 머리: 얼굴 뒤쪽을 따라 내려와요 (등 뒤로 흘러내리는 부분은 BEHIND.long)
  long:{ 1:'....ooooooooo....', 2:'..oohhhhHHhhhoo..', 3:'.ohhhhhhhhhHhhho.', 4:'ohhhhhhhhhhhhhhho', 5:'ohhhhhhhhhhhhfffo',
         6:'ohhhfffefffffeffo', 7:'ohhhfffefffffeffo', 8:'ohhhffcfffffffcfo', 9:'ohhhffffffmfffffo', 10:'.ohhfffffffffffo.', 11:'..ohsssssssssso..' },
  // 단발: 턱선까지 둥글게
  bob:{ 1:'....ooooooooo....', 2:'..oohhhhHHhhhoo..', 3:'.ohhhhhhhhhHhhho.', 4:'ohhhhhhhhhhhhhhho', 5:'ohhhhhhhhhhhhhhho',
        6:'ohhhhffefffffefho', 7:'ohhhhffefffffefho', 8:'ohhhhfcfffffffcho', 9:'ohhhhfffffmffffho', 10:'.ohhhhfffffffffo.', 11:'..oooosssssssso..' },
};

function overlay(base, map){
  return base.map((row, y) => {
    const o = map[y];
    if(!o) return row;
    return [...row].map((ch, x) => o[x] && o[x] !== '.' ? o[x] : ch).join('');
  });
}
// 머리 뒤쪽·위쪽으로 삐져나오는 머리(묶은 머리, 올림머리, 흘러내린 긴 머리)를 그릴 자리로 왼쪽 3칸, 위쪽 2칸을 비워 둬요
const PAD_L = 3, PAD_T = 3;
// 머리 뒤에 깔리는 부분: 빈칸에만 채워서 얼굴·몸 뒤에 있는 것처럼 보여요. [왼쪽 x, 위 y (여백 포함 좌표), 줄들]
const BEHIND = {
  long:[0, PAD_T + 5, ['..o...', '.oh...', '.oh...', 'ohh...', 'ohH...', 'ohhh..', 'ohhhh.', 'ohhhhh', 'ohhhh.', '.ohhh.', '..ooo.']],
  pony:[0, PAD_T + 3, ['..oo', '.ohk', 'ohhh', 'ohH.', 'ohh.', 'ohh.', 'ohh.', '.oh.', '..o.']],
  bun:[1, 0, ['...oooo...', '.oohhhHoo.', 'ohhhhhhHHo', 'ohhhhhhhHo', 'ohhhhhhhho', 'ohhhhhhhho', '.ohhhhhho.', '..oooooo..']],
};
const CAP_OF = { pony:'cap', bun:'cap' };
function adultRows(style){
  let rows = turn(13, overlay([...HEAD_ADULT, ...BODY_ADULT], HAIR[CAP_OF[style] || style] || {}));
  const w = rows[0].length + PAD_L;
  rows = [...Array(PAD_T).fill(''), ...rows].map(r => '.'.repeat(w - r.length) + r);
  const b = BEHIND[style];
  if(b){
    const [x0, y0, tpl] = b, a = rows.map(r => r.split(''));
    tpl.forEach((line, dy) => [...line].forEach((ch, dx) => { const y = y0 + dy, x = x0 + dx; if(ch !== '.' && a[y] && a[y][x] === '.') a[y][x] = ch; }));
    rows = a.map(r => r.join(''));
  }
  return rows;
}
const ADULT_H = PAD_T + HEAD_ADULT.length + BODY_ADULT.length;   // 23줄
const ADULT_LEGS = ADULT_H - 2;                          // 숨 쉴 때 이 줄부터 아래(다리)는 제자리
const EYE_Y = PAD_T + 6;                                 // 눈 줄

const KID_BASE = turn(10, [    // 15×16 걸음마 아이 (10줄부터 몸)
  '...............',
  '....ooooooo....',
  '..oohhhhHhhoo..',
  '.ohhhhhhhhHhho.',
  'ohhhffefffffefo',
  'ohhfffefffffefo',
  'offffcffmffffco',
  'offfffffffffffo',
  '.ossssssssssso.',
  '...ooooooooo...',
  '...ottttttto...',
  '..oftttttttfo..',
  '..offtttttffo..',
  '...oouuuuuoo...',
  '....oggoggo....',
  '.....oo.oo.....',
]);
const BABY_BASE = [            // 13×9 아기 머리
  '.............',
  '...ooooooo...',
  '..offfffffo..',
  '.offfffffffo.',
  'offffeffffefo',
  'offfcfmfffcfo',
  'offfffffffffo',
  '.ossssssssso.',
  '...ooooooo...',
];
// 아기 머리카락: 갓난아기는 한 가닥, 6개월부터 짧게 덮어요
const babyHeadRows = month => month < 6
  ? setPx(BABY_BASE, [[6, 0, 'h'], [7, 0, 'o'], [5, 0, 'o']])
  : overlay(BABY_BASE, { 1:'...ooooooo...', 2:'..ohhhHhhho..', 3:'.ohhhffffffo.' });

// 눈 감기: 눈 두 줄 중 위쪽은 피부로, 아래쪽은 가로선으로
function closeEyes(rows, top){
  const r = rows.slice();
  const a = r[top].split(''), b = r[top + 1].split('');
  const xs = a.map((ch, x) => ch === 'e' ? x : -1).filter(x => x >= 0);
  const mid = (a.length - 1) / 2;
  for(const x of xs){ a[x] = 'f'; b[x] = 'e'; b[x < mid ? x + 1 : x - 1] = 'e'; }
  r[top] = a.join(''); r[top + 1] = b.join('');
  return r;
}
// 아기 머리처럼 눈이 한 줄이면 그 줄을 가로선으로
function closeEyes1(rows, y){
  const r = rows.slice(), a = r[y].split(''), mid = (a.length - 1) / 2;
  const xs = a.map((ch, x) => ch === 'e' ? x : -1).filter(x => x >= 0);
  for(const x of xs) a[x < mid ? x + 1 : x - 1] = 'e';
  r[y] = a.join('');
  return r;
}
// 몸을 살짝 틀기: from 줄부터 아래(몸)는 가운데 그대로 두고, 뒤쪽(왼쪽) 팔·다리만 그늘색으로
function turn(from, rows){
  return rows.map((r, y) => {
    if(y < from) return r;
    const a = r.split('');
    const i = a.findIndex(ch => ch !== '.');
    if(a[i + 1] === 't') a[i + 1] = 'u';
    else if(a[i + 1] === 'g') for(let k = i + 1; a[k] === 'g'; k++) a[k] = 'G';
    else for(let k = i + 1; a[k] === 'f'; k++) a[k] = 's';
    return a.join('');
  });
}
// 좌우 뒤집기 (오른쪽 보던 얼굴이 왼쪽을 봐요)
const mirror = rows => rows.map(r => [...r].reverse().join(''));
function setPx(rows, list){
  const r = rows.map(s => s.split(''));
  for(const [x, y, ch] of list) if(r[y] && r[y][x] !== undefined) r[y][x] = ch;
  return r.map(a => a.join(''));
}

// ── 등장인물 고르기 ── 시뮬레이션마다(id 로) 피부색·머리 모양·머리색·옷·안경을 무작위로 골라요. 같은 시뮬레이션에서는 늘 같아요
const BASE = { o:C.line, e:C.eye, c:C.cheek, m:'#B5534F', k:'#E5484D' };   // k 머리끈
const SKIN = [['#F9DCC6', '#EBC0A2']];   // 피부색은 밝은 한 가지
const HAIR_C = [['#2E2420', '#4A3A33'], ['#4A3024', '#6B4A38'], ['#6E4630', '#8E6248'], ['#2A2A33', '#474756'], ['#9C6B45', '#BC8A60'], ['#C99A5E', '#E0B97E']];
const MOM_TOP = [['#F5A3B4', '#E07C93', '#FBC9D3'], ['#F6C26B', '#E0A447', '#FBDDA3'], ['#B7A3E0', '#9580C9', '#D6CBF0'], ['#9FD6B9', '#6EBE96', '#C7EAD7'], ['#F49B7A', '#DE7C5A', '#F9C2AD'], ['#F2EFE6', '#D9D3C4', '#FFFFFF']];
const DAD_TOP = [['#82B4E6', '#5E93CC', '#B5D3F2'], ['#7FAF7A', '#5F9159', '#B3D3AE'], ['#E8D2A6', '#CDB27F', '#F3E6CB'], ['#9A93A3', '#7D7688', '#C4BFCB'], ['#E58A7E', '#C96C60', '#F2B8AF'], ['#4C5A7A', '#3A4663', '#6C7CA0']];
const DAD_LEGS = [['#5D6B8A', '#48546E'], ['#4A4A4A', '#363636'], ['#7A6248', '#5F4B37'], ['#C8B48E', '#AE9A74']];
// 배 속 아기는 분홍
const FETUS_PAL = { f:'#F6B3BE', s:'#E8919F' };
// 아기 옷 색 (쌍둥이는 둘째가 민트)
const CLOTH = [{ t:'#FFB38A', u:'#EF8E60', l:'#FFD0B5' }, { t:'#9FD6B9', u:'#6EBE96', l:'#C7EAD7' }];

function rng(seed){
  let h = 1779033703;
  for(const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353), h = h << 13 | h >>> 19;
  return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
let CAST = null, CAST_SEED = null;
function castFor(seed = 'miri'){
  if(CAST && CAST_SEED === seed) return CAST;
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)];
  const mSkin = pick(SKIN), dSkin = pick(SKIN), mHair = pick(HAIR_C), dHair = pick(HAIR_C);
  const mTop = pick(MOM_TOP), dTop = pick(DAD_TOP), dLegs = pick(DAD_LEGS);
  const mom = { rows:adultRows(pick(['long', 'bob', 'pony', 'bun'])),
    pal:{ ...BASE, f:mSkin[0], s:mSkin[1], h:mHair[0], H:mHair[1], t:mTop[0], u:mTop[1], l:mTop[2], g:mSkin[0], G:mSkin[1] } };
  const dad = { rows:adultRows(pick(['short', 'part', 'buzz'])),
    pal:{ ...BASE, f:dSkin[0], s:dSkin[1], h:dHair[0], H:dHair[1], t:dTop[0], u:dTop[1], l:dTop[2], g:dLegs[0], G:dLegs[1] } };
  const kids = [0, 1].map(i => {
    const sk = r() < .5 ? mSkin : dSkin, hc = r() < .5 ? mHair : dHair;
    return { ...BASE, f:sk[0], s:sk[1], h:hc[0], H:hc[1], ...CLOTH[i], g:'#7E9CD6', G:'#6482BF' };
  });
  CAST = { mom, dad, kids }; CAST_SEED = seed;
  return CAST;
}
const babyPal = i => CAST.kids[i];

function stamp(L1, rows, x, y, pal, split = -1, bob = 0){
  // split 줄부터 아래(다리)는 제자리, 위는 bob 만큼 내려와요 (숨쉬기)
  for(let ry = rows.length - 1; ry >= 0; ry--){
    const row = rows[ry], dy = split >= 0 && ry < split ? bob : 0;
    for(let rx = 0; rx < row.length; rx++){
      const ch = row[rx];
      if(ch === '.' || !pal[ch]) continue;
      L1.px(x + rx, y + ry + dy, pal[ch]);
    }
  }
}
const blinkAt = (now, off) => now > 0 && (now + off) % 3700 < 160;

// ── 장면 ────────────────────────────────────
const L = { char:null, tmp:null };
function layers(){
  if(!L.char || L.char.c.width !== W){ L.char = new Layer(); L.tmp = new Layer(); }
  return L;
}
const norm = opts => opts && typeof opts === 'object' ? { twins:!!opts.twins, seed:opts.seed } : { twins:!!opts };

// main: 60×40 Layer, t: 시간 축, opts: { twins } (twins 불리언만 줘도 돼요), now: ms (움직임용)
export function drawScene(main, t, opts, now){
  const o = norm(opts);
  const i = Math.floor(t + 1e-6);
  W = main.c.width;
  castFor(o.seed ?? 'miri');
  main.clear();
  main.x.setTransform(1, 0, 0, 1, 0, TOP);     // 아래 40칸에 그려요. 위쪽 TOP 칸은 배경이 위로 이어져요
  if(i < BIRTH_T) couple(main, i + PREG_START, o, now);
  else room(main, i - BIRTH_T, o, now);
  main.x.setTransform(1, 0, 0, 1, 0, 0);
}

// 임신기: 왼쪽 엄마 곰, 오른쪽 아빠 곰, 가운데에 배 속을 크게 보여 주는 동그란 창
function couple(m, week, { twins }, now){
  const anim = now > 0;
  if(XMAS) xmasRoom(m, now);
  else {
    m.rect(0, -TOP, W, 33 + TOP, C.bgP);
    for(let y = 2; y < 33; y += 4) for(let x = (y / 4 % 2) * 2 + 1; x < W; x += 4) m.px(x, y, C.bgPd);
    m.rect(0, 33, W, 7, C.floor);
    m.rect(0, 36, W, 1, C.floorD);
  }

  const g = Math.min(1, Math.max(0, (week - 4) / 36));
  const GY = 38;                                  // 발 아래 줄
  const mid = Math.floor(W / 2);
  const wx = mid - 28, hx = mid + 12, sy = GY - ADULT_H; // 스프라이트 왼쪽 위 (양옆에 벽난로와 트리)
  const cx = mid, cy = 16, BR = 10, ir = BR - 2;
  const { char, tmp } = layers();
  m.rect(wx + 3, GY - 1, 11, 1, C.floorD); m.rect(hx + 3, GY - 1, 11, 1, C.floorD);

  // 엄마 배에서 창으로 이어지는 점선
  {
    const bx0 = wx + 15, by0 = sy + 17;
    const dx = bx0 - cx, dy = by0 - cy, d = Math.hypot(dx, dy);
    const ex = cx + dx / d * (BR + 2), ey = cy + dy / d * (BR + 2);
    const n = Math.max(1, Math.round(Math.hypot(bx0 - ex, by0 - ey)));
    const ph = anim ? Math.floor(now / 260) % 2 : 0;
    for(let s = 0; s <= n; s++) if((s + ph) % 2 === 0) m.px(bx0 + (ex - bx0) * s / n, by0 + (ey - by0) * s / n, C.wombD);
  }

  // ── 배 속 창
  m.disc(cx, cy, BR + 1, C.line);
  m.disc(cx, cy, BR, C.wombD);
  m.disc(cx, cy, ir, C.fluid);
  m.rect(cx - 6, cy - 6, 2, 1, C.fluidL); m.px(cx - 7, cy - 5, C.fluidL); m.px(cx - 7, cy - 4, C.fluidL);   // 반짝
  const inside = (x, y) => Math.hypot(x - cx, y - cy) < ir - .5;
  if(anim) for(let k = 0; k < 2; k++){                                              // 떠오르는 방울
    const rise = (now / 110 + k * 9) % 16;
    const bx = cx + [-5, 5][k], by = cy + 7 - rise;
    if(inside(bx, by)) m.px(bx, by, C.bubble);
  }
  const twinK = fitK(week, ir * .62);
  const fetuses = twins
    ? [[cx - ir * .36, cy + 1, now, twinK, 0, FETUS_PAL], [cx + ir * .36, cy - 1, now + 700, twinK, 1, FETUS_PAL]]
    : [[cx, cy, now, fitK(week, ir), 0, FETUS_PAL]];
  for(const [fx, fy, fnow, k, seed, pal] of fetuses){
    tmp.clear();
    babyInWomb(tmp, m, fx, fy, week, fnow, k, seed, inside, pal);
    tmp.outline(C.line);
    clipCircle(tmp, cx, cy, ir);
    m.x.drawImage(tmp.c, 0, 0);
  }
  if(week >= 6 && week < 12 && (now % 900) < 300){             // 콩닥콩닥 심장
    for(const [fx, fy] of fetuses) m.px(fx, fy, C.heart);
  }

  // ── 엄마 곰: 리본, 주수가 차면 배가 볼록
  const bw = anim ? Math.floor(now / 1100) % 2 : 0;
  let mom = CAST.mom.rows;
  if(blinkAt(now, 0)) mom = closeEyes(mom, EYE_Y);
  char.clear();
  stamp(char, mom, wx - PAD_L, sy, CAST.mom.pal, ADULT_LEGS, bw);
  if(week >= 14){
    // 볼록한 배: 배 속은 가운데 창에서 보여 주니, 몸에는 아랫배만 한 칸 살짝 (14주쯤부터 같은 크기)
    const y1 = sy + PAD_T + 17 + bw, y2 = sy + PAD_T + 18 + bw;
    char.rect(wx + 12, y1, 2, 1, CAST.mom.pal.t); char.px(wx + 14, y1, C.line);
    char.px(wx + 12, y2, CAST.mom.pal.u); char.px(wx + 13, y2, C.line);
  }
  m.x.drawImage(char.c, 0, 0);

  // ── 아빠 곰: 숨 쉬고 눈 깜빡이기만 해요
  const bh = anim ? Math.floor((now + 550) / 1100) % 2 : 0;
  let dad = mirror(CAST.dad.rows);                             // 창이 있는 왼쪽을 봐요
  if(blinkAt(now, 1800)) dad = closeEyes(dad, EYE_Y);
  char.clear();
  stamp(char, dad, hx, sy, CAST.dad.pal, ADULT_LEGS, bh);
  m.x.drawImage(char.c, 0, 0);

  // 창 위로 하트가 떠올라요
  const ph = (now % 3000) / 3000;
  if(ph < .5 && anim){
    const ty = Math.round(cy - BR - 4 - ph * 4), tx = cx - 2;
    if(ty >= 0){ m.px(tx, ty, C.heart); m.px(tx + 2, ty, C.heart); m.rect(tx, ty + 1, 3, 1, C.heart); m.px(tx + 1, ty + 2, C.heart); }
  }
}

// 동그란 창 밖으로 삐져나온 점은 지워요
function clipCircle(Ly, cx, cy, r){
  const { width:w, height:h } = Ly.c;
  const img = Ly.x.getImageData(0, 0, w, h), d = img.data;
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++) if(Math.hypot(x - cx, y - cy) > r + .2) d[(y * w + x) * 4 + 3] = 0;
  Ly.x.putImageData(img, 0, 0);
}

// 창 크기(반지름 r)에 맞게 태아 크기를 줄이는 배율
function fitK(week, r){
  return Math.min(1, (2 * r - 1) / 3.3 / 8.5);   // 만삭 크기에 맞춘 한 가지 배율 → 주수마다 점점 커져요
}

function babyInWomb(L1, cordL, cx, cy, week, now, k, seed, inside, pal){
  const bob = Math.floor(now / 650) % 2;
  if(week < 10){
    // 콩 모양 배아
    const s = .6 + (week - 4) * .2;
    L1.ell(cx, cy + bob, s * .75, s, pal.f);
    if(s > 1.5) L1.disc(cx - s * .2, cy - s * .7 + bob, s * .55, pal.f);
    return;
  }
  const g = Math.min(1, (week - 10) / 30);
  const hr = (2.5 + 6 * g) * k;
  const hx = cx - hr * .3, hy = cy - hr * .5 + bob;
  const bx = cx + hr * .5, by = cy + hr * .65 + bob;
  const kick = (Math.floor(now / 2600 + seed) % 3 === 0) && (now % 2600) < 400 ? 1 : 0;
  for(let s = 0; s <= 1; s += .06){                             // 탯줄
    const x = bx + hr * .2 + s * (hr * 1.6), y = by - (s * hr * 1.6) + Math.sin(s * 9 + now / 500);
    if(!inside || inside(x, y)) cordL.px(x, y, C.cord);
  }
  L1.ell(bx, by, hr * .75, hr * .85, pal.f);                           // 몸
  L1.ell(bx + hr * .35 + kick, by + hr * .75, hr * .55, hr * .32, pal.s);        // 다리
  L1.disc(hx, hy, hr, pal.f);                                          // 머리
  if(hr >= 3){
    L1.rect(hx + hr * .2, hy + hr * .1, Math.max(1, hr * .3), 1, C.eye);       // 감은 눈
    L1.px(hx + hr * .3, hy + hr * .5, C.cheek);
  }
}

// 아기방
function room(m, month, { twins }, now){
  if(XMAS) xmasRoom(m, now);
  else roomPlain(m, month, now);
  const { char } = layers();
  char.clear();
  const n = twins ? 2 : 1, mid = Math.floor(W / 2);
  const xs = n === 2 ? (month >= 3 && month < 12 ? [mid - 15, mid + 10] : [mid - 10, mid + 10]) : [mid];
  parents(m, now, twins);
  babies(m, char, month, twins, xs, now);
}
// 출산 뒤에도 엄마·아빠 곰이 아기 양옆에 서서 아기를 바라봐요
function parents(m, now, twins){
  const mid = Math.floor(W / 2), GY = 38, sy = GY - ADULT_H;
  const mx = mid - (twins ? 41 : 31), dx = mid + (twins ? 23 : 14);   // 아기 바로 옆에 붙어 서요
  m.rect(mx + 3, GY - 1, 11, 1, X.floorD); m.rect(dx + 3, GY - 1, 11, 1, X.floorD);
  const bm = now > 0 ? Math.floor(now / 1100) % 2 : 0, bd = now > 0 ? Math.floor((now + 550) / 1100) % 2 : 0;
  let mom = CAST.mom.rows;
  if(blinkAt(now, 0)) mom = closeEyes(mom, EYE_Y);
  let dad = mirror(CAST.dad.rows);
  if(blinkAt(now, 1800)) dad = closeEyes(dad, EYE_Y);
  const { tmp } = layers();
  tmp.clear();
  stamp(tmp, mom, mx - PAD_L, sy, CAST.mom.pal, ADULT_LEGS, bm);
  stamp(tmp, dad, dx, sy, CAST.dad.pal, ADULT_LEGS, bd);
  m.x.drawImage(tmp.c, 0, 0);
}
// ── 크리스마스 거실 ── 왼쪽 벽난로(불이 일렁여요), 위에 꼬마전구 가랜드, 오른쪽 트리와 선물
const X = {
  wall:'#F4E4D8', wallDot:'#EAD2C4', wain:'#E8CDBE', wainL:'#DDBBA9',
  floor:'#C99A6E', floorD:'#B5845A', floorL:'#D4A87D',
  brick:'#B4513F', mortar:'#94402F', mantel:'#7A5240', mantelL:'#93684F', hearth:'#3A2626', log:'#6B4532',
  fire:'#E8742E', fireL:'#F7C74A',
  leaf:'#4F7A3A', leafD:'#3D5A26', leafL:'#6B9A4A', trunk:'#7A5240',
  red:'#C9363E', gold:'#E9A93C', blue:'#5E93CC', cream:'#F6E4E1', green:'#5E8A3F',
};
function xmasRoom(m, now){
  const FY = 31, anim = now > 0, tick = anim ? Math.floor(now / 520) : 0;
  // 벽: 따뜻한 크림색 + 점무늬, 아래쪽 징두리 판
  m.rect(0, -TOP, W, FY + TOP, X.wall);
  m.rect(0, -TOP, W, 1, X.wainL);                                  // 천장 몰딩
  for(let y = 4 - TOP; y < FY - 7; y += 5) for(let x = (y / 5 % 2) * 3 + 1; x < W; x += 6) m.px(x, y, X.wallDot);
  m.rect(0, FY - 7, W, 7, X.wain); m.rect(0, FY - 7, W, 1, X.wainL);
  for(let x = 3; x < W; x += 8) m.rect(x, FY - 5, 1, 5, X.wainL);
  // 바닥: 나무 마루
  m.rect(0, FY, W, H - FY, X.floor);
  m.rect(0, FY, W, 1, X.floorD);
  for(const [y, o] of [[FY + 3, 0], [FY + 6, 5], [FY + 9, 2]]){ m.rect(0, y, W, 1, X.floorD); for(let x = o; x < W; x += 11) m.px(x, y - 1, X.floorD); }
  // 위쪽 가랜드 + 꼬마전구 (번갈아 반짝)
  const lights = [X.red, X.gold, X.blue, X.cream];
  for(let x = 0; x < W; x++){
    const k = x % 10, sag = Math.floor((k < 5 ? k : 10 - k) / 2);
    m.px(x, 1 + sag - TOP, X.leaf); m.px(x, 2 + sag - TOP, X.leafD);
    if(k === 5){
      const n = Math.floor(x / 10), on = (n + tick) % 2 === 0;
      m.px(x, 4 + sag - TOP, on ? lights[n % 4] : X.wainL);
    }
  }
  const mid = Math.floor(W / 2), F = Math.max(0, mid - 68), T = Math.min(W - 8, mid + 60);  // 벽난로 왼쪽 끝, 트리 가운데 (출산 뒤 아기 양옆에 선 엄마·아빠 자리를 비워 둬요)
  // 넓은 화면에서는 양옆 벽에 눈 내리는 창문을 더 달아요
  const wins = [];
  for(let x = F - 20; x >= 2; x -= 28) wins.push(x);
  for(let x = T + 14; x + 14 <= W - 2; x += 28) wins.push(x);
  for(const x of wins) snowWindow(m, x, 8, now);
  // 벽난로
  m.rect(F + 1, 14, 15, FY - 14, X.brick);
  for(let y = 16; y < FY; y += 3){ m.rect(F + 1, y, 15, 1, X.mortar); for(let x = (y % 2 ? 3 : 6); x < 16; x += 6) m.px(F + x, y - 1, X.mortar); }
  m.rect(F, 12, 17, 2, X.mantel); m.rect(F, 12, 17, 1, X.mantelL);
  m.rect(F + 4, 19, 9, FY - 19, X.hearth); m.px(F + 4, 19, X.brick); m.px(F + 12, 19, X.brick);
  m.rect(F + 5, FY - 2, 7, 2, X.log); m.px(F + 6, FY - 2, X.mantelL); m.px(F + 10, FY - 1, X.mantelL);
  const ft = anim ? Math.floor(now / 140) : 0;                 // 불꽃: 칸마다 높이가 바뀌어요
  for(let x = 5; x <= 11; x++){
    const h = 3 + ((x * 7 + ft * 3) % 4) - (x === 5 || x === 11 ? 2 : 0);
    if(h <= 0) continue;
    m.rect(F + x, FY - 2 - h, 1, h, X.fire);
    if(h > 2 && x > 5 && x < 11) m.rect(F + x, FY - 2 - h + 2, 1, h - 2, X.fireL);
  }
  // 벽난로 위 양말 두 짝
  for(const [x, c] of [[F + 3, X.red], [F + 11, X.green]]){
    m.rect(x, 14, 3, 1, X.cream); m.rect(x, 15, 3, 3, c); m.rect(x, 18, 4, 2, c); m.px(x + 3, 19, X.cream);
  }
  // 트리
  const tx = T;
  const tiers = [[6, 12, 1, 4], [11, 19, 2, 6], [18, 28, 3, 7]];
  for(const [y0, y1, w0, w1] of tiers) for(let y = y0; y <= y1; y++){
    const hw = Math.round(w0 + (w1 - w0) * (y - y0) / (y1 - y0));
    m.rect(tx - hw, y, hw * 2 + 1, 1, X.leaf);
    m.px(tx + hw, y, X.leafD); m.px(tx - hw, y, X.leafL);
    if(y === y1) m.rect(tx - hw, y, hw * 2 + 1, 1, X.leafD);
  }
  m.rect(tx - 1, 29, 3, 2, X.trunk);
  const tw = anim && Math.floor(now / 400) % 2;                // 별이 반짝
  m.px(tx, 3, X.gold); m.rect(tx - 1, 4, 3, 1, X.gold); m.px(tx, 5, X.gold);
  if(tw){ m.px(tx - 2, 4, X.gold); m.px(tx + 2, 4, X.gold); m.px(tx, 2, X.gold); }
  const balls = [[-1, 10, X.red], [2, 13, X.gold], [-3, 16, X.blue], [3, 18, X.red], [0, 21, X.gold], [-4, 24, X.red], [4, 25, X.blue], [-1, 27, X.cream]];
  balls.forEach(([x, y, c], k) => m.px(tx + x, y, (k + tick) % 3 === 0 && anim ? X.cream : c));
  // 선물
  const gifts = [[-8, 27, 6, 4, X.red, X.gold], [-2, 28, 5, 3, X.green, X.red], [3, 26, 5, 5, X.cream, X.red]];
  for(const [dx, y, w, h, c, rb] of gifts){
    const x = tx + dx;
    m.rect(x - 1, y - 1, w + 2, h + 1, C.line);
    m.rect(x, y, w, h, c);
    m.rect(x + Math.floor(w / 2), y, 1, h, rb); m.rect(x, y + 1, w, 1, rb);
    m.px(x + Math.floor(w / 2) - 1, y - 2, rb); m.px(x + Math.floor(w / 2) + 1, y - 2, rb);
  }
}
// 눈 내리는 창문 (14×12)
function snowWindow(m, x, y, now){
  m.rect(x - 1, y - 1, 16, 14, X.mantel);
  m.rect(x, y, 14, 12, '#2E3E66');
  m.rect(x, y + 9, 14, 3, '#E8EEF6');                           // 쌓인 눈
  m.rect(x + 6, y, 2, 12, X.mantel); m.rect(x, y + 5, 14, 1, X.mantel);
  const ph = now > 0 ? Math.floor(now / 300) : 0;
  for(let k = 0; k < 7; k++){
    const sx = x + (k * 5 + 1) % 14, sy = y + (k * 3 + ph) % 9;
    if(sx === x + 6 || sx === x + 7 || sy === y + 5) continue;
    m.px(sx, sy, '#FFFFFF');
  }
  m.rect(x - 2, y + 12, 18, 1, X.mantelL);                      // 창턱
}

// 예전 아기방 배경 (시즌이 아닐 때)
function roomPlain(m, month, now){
  m.rect(0, -TOP, W, 28 + TOP, C.wall);
  for(let x = 0; x < W; x += 6) m.rect(x, 0, 3, 28, C.wallD);
  m.rect(0, 28, W, 12, C.floor);
  for(let y = 31; y < H; y += 4) m.rect(0, y, W, 1, C.floorD);
  // 창문
  m.rect(4, 4, 13, 11, C.frame);
  m.rect(5, 5, 5, 4, C.win); m.rect(11, 5, 5, 4, C.win); m.rect(5, 10, 5, 4, C.win); m.rect(11, 10, 5, 4, C.win);
  m.px(6, 6, C.winL);
  // 모빌 / 별 장식
  if(month < 12){
    const sw = Math.round(Math.sin(now / 700));
    m.rect(45, 0, 1, 3, C.basS);
    m.rect(41 + sw, 3, 9, 1, C.basS);
    m.px(41 + sw, 4, C.basS); m.px(49 + sw, 4, C.basS);
    star(m, 41 + sw, 6); star(m, 49 + sw, 6);
  } else {
    star(m, 46, 5); star(m, 54, 10); star(m, 38, 11);
  }
}
// 시기별 아기 모습
function babies(m, char, month, twins, xs, now){
  if(month < 3){
    // 바구니 침대: 고개만 쏙, 새근새근
    const bw = twins ? 34 : 20, bx = Math.floor(W / 2) - bw / 2;
    m.rect(bx + 1, 32, 1, 5, C.basS); m.rect(bx + bw - 2, 32, 1, 5, C.basS);
    char.rect(bx, 24, bw, 8, C.bas);
    char.outline(C.line);
    xs.forEach((x, i) => {
      const p = babyPal(i);
      char.ell(x, 25, 5, 2, p.t);
      stamp(char, closeEyes1(i ? mirror(babyHeadRows(month)) : babyHeadRows(month), 4), x - 6, 16, p);
    });
    tmp2(char, t => { t.rect(bx, 26, bw, 6, C.bas); for(let x = bx + 2; x < bx + bw - 1; x += 3) t.rect(x, 28, 1, 3, C.basS); });
    xs.forEach(x => zzz(m, x + 5, 13, now));
  } else if(month < 6){
    // 엎드려 고개 들기
    m.ell(Math.floor(W / 2), 34, twins ? 26 : 16, 3, C.matS); m.ell(Math.floor(W / 2), 33, twins ? 25 : 15, 2, C.mat);
    xs.forEach((x, i) => {
      const p = babyPal(i), kick = Math.floor(now / 400 + i) % 2;
      tmp2(char, t => { t.ell(x + 4, 31, 6, 2, p.t); t.rect(x + 9, 28 - kick, 2, 2, p.f); });
      let h = mirror(babyHeadRows(month)); if(blinkAt(now, i * 1300)) h = closeEyes1(h, 4);
      stamp(char, h, x - 8, 23, p);
    });
  } else if(month < 9){
    // 매트에 혼자 앉아 있기: 동그란 몸에 짧은 팔다리, 두 손을 번갈아 흔들어요
    m.ell(Math.floor(W / 2), 34, twins ? 26 : 16, 3, C.matS); m.ell(Math.floor(W / 2), 33, twins ? 25 : 15, 2, C.mat);
    xs.forEach((x, i) => {
      const p = babyPal(i), wave = now > 0 ? Math.floor(now / 380 + i) % 2 : 0;
      tmp2(char, t => {
        t.rect(x - 5, 31 - wave, 2, 2, p.f); t.rect(x + 4, 31 - (1 - wave), 2, 2, p.f);   // 팔
        t.ell(x, 32, 3, 2, p.t);                                            // 작고 동그란 몸
        t.rect(x - 5, 34, 3, 1, p.f); t.rect(x + 3, 34, 3, 1, p.f);       // 양쪽으로 벌린 다리 (몸 위에 그려서 잘 보여요)
      });
      let h = i ? mirror(babyHeadRows(month)) : babyHeadRows(month); if(blinkAt(now, i * 1300)) h = closeEyes1(h, 4);
      stamp(char, h, x - 6, 22, p);
    });
  } else if(month < 12){
    // 기어 다니기
    xs.forEach((x, i) => {
      const p = babyPal(i), st = Math.floor(now / 300 + i) % 2;
      tmp2(char, t => {
        t.ell(x + 3, 32, 4, 2, p.t);                                   // 몸 (작게)
        t.rect(x - 1 + st, 33, 2, 2, p.f); t.rect(x + 1 - st, 33, 2, 2, p.f);
        t.rect(x + 5 - st, 33, 2, 2, p.f); t.rect(x + 7 + st, 33, 2, 2, p.f);
      });
      let h = mirror(babyHeadRows(month)); if(blinkAt(now, i * 1300)) h = closeEyes1(h, 4);
      stamp(char, h, x - 9, 23, p);
    });
  } else {
    // 걸음마 → 뛰어놀기 → 가방 멘 아이
    const big = month >= 30;
    xs.forEach((x, i) => {
      const p = babyPal(i);
      const ph = Math.floor(now / (month >= 18 ? 260 : 420) + i) % 2;
      const base = KID_BASE, sprite = i ? mirror(base) : base, w = sprite[0].length;   // 만 3세도 엄마·아빠보다 작게
      const sx = x - Math.floor(w / 2) + (month < 18 ? (ph ? 1 : 0) : 0), sy = 38 - sprite.length;
      if(big) tmp2(char, t => t.rect(i ? sx + w - 3 : sx - 1, sy + 11, 4, 4, C.bag));   // 가방은 등 쪽에
      let s = sprite; if(blinkAt(now, i * 1300)) s = closeEyes(s, 4);
      stamp(char, s, sx, sy, p, sprite.length - 2, now > 0 ? ph : 0);
    });
  }
  m.x.drawImage(char.c, 0, 0);
}
// 테두리 없는 모양을 따로 그려 테두리를 둘러서 얹어요
function tmp2(dst, draw){
  const { tmp } = layers();
  tmp.clear(); draw(tmp); tmp.outline(C.line);
  dst.x.drawImage(tmp.c, 0, 0);
}

function star(m, x, y){ m.px(x, y - 1, C.star); m.rect(x - 1, y, 3, 1, C.star); m.px(x, y + 1, C.star); }
function zzz(m, x, y, now){
  const p = Math.floor(now / 500) % 3;
  for(let k = 0; k <= p; k++){
    const zx = x + k * 3, zy = y - k * 4;
    m.rect(zx, zy, 3, 1, C.zz); m.px(zx + 1, zy + 1, C.zz); m.rect(zx, zy + 2, 3, 1, C.zz);
  }
}

// ── 캔버스에 붙이기 ──────────────────────────────
// canvas 하나에 장면을 계속 그려 주는 작은 플레이어. get() 이 { t, twins } 를 돌려줘요
export function mountScene(canvas, get){
  let main = null;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, last = 0;
  // 그림이 놓인 자리의 가로세로 비율로 가로 칸 수를 정해요 (높이 40칸은 그대로)
  const fitW = () => {
    const { width:cw, height:ch } = canvas.getBoundingClientRect();
    return cw > 0 && ch > 0 ? Math.max(MIN_W, Math.round(H * cw / ch)) : MIN_W;
  };
  function paint(now){
    const w = fitW();
    if(!main || main.c.width !== w){ main = new Layer(w, H); canvas.width = w; canvas.height = H; }
    const s = get();
    drawScene(main, s.t, s, reduce ? 0 : now);
    ctx.clearRect(0, 0, w, H);
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
export function sceneImage(t, opts){
  const main = new Layer(MIN_W, H);
  drawScene(main, t, opts, 0);
  return main.c.toDataURL();
}
