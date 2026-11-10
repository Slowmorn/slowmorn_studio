// 시뮬레이션 타임라인 데이터
// ─────────────────────────────────────────────────────────────
// 시간 축(t): 임신 4주 = 0, 임신 40주(출산) = 36, 생후 N개월 = 36 + N, 만 36개월 = 72.
// at: 'w12' 는 임신 12주, 'm6' 는 생후 6개월.
//
// 이벤트 종류(type)
//   todo      지나가며 쌓이는 할 일. cost 가 있으면 그 시점에 지출로 잡아요
//   milestone 출산·돌처럼 큰 장면
//   buy       살 것: 새것 / 당근 / 물려받기·선물 중에서 골라요 (시간이 멈춰요)
//   choice    부부가 정해야 하는 큰 선택 (시간이 멈춰요)
//   edu       교육·양육 방향. 정답 없는 원칙 고르기 (시간이 멈춰요)
//
// 선택지(options) 금액
//   once     한 번에 드는 돈 (원). 이벤트에 payAt 이 있으면 그 시점에 나가요
//   monthly  매달 드는 돈 (원), span: [시작 개월, 끝 개월] (생후 기준, 끝 포함)
//   mode     new 새것 · used 당근(중고) · gift 물려받기·선물 · none 사지 않음
//   after    만 3세 이후 예상 월 비용 (36개월 합계에는 넣지 않고 정리 화면에만 보여요)
//
// 금액과 지원 제도는 2026년 기준 참고용 추정치예요. 지역·병원·브랜드에 따라 크게 달라요.
// 출처 메모: 지원금은 보건복지부 '부모급여·아동수당·첫만남이용권' 안내, 국민행복카드 안내 기준.
// 물건 값은 주요 쇼핑몰과 당근 시세의 대략적인 중간값이에요.

export const PREG_START = 4;   // 임신 4주부터 시작
export const BIRTH_T = 36;     // 40주 - 4
export const END_T = 72;       // 생후 36개월

export function atToT(at){
  const n = Number(at.slice(1));
  return at[0] === 'w' ? n - PREG_START : BIRTH_T + n;
}

export const EVENTS = [
  // ── 임신 초기 ──────────────────────────────
  { at:'w4', type:'todo', title:'임신 확인, 첫 산부인과 진료',
    body:'임신 테스트기에 두 줄이 보였다면 산부인과에서 임신을 확인해요. 아기집과 심장 소리는 보통 6~8주에 확인할 수 있어요.',
    cost:50000 },
  { at:'w5', type:'todo', title:'국민행복카드 신청',
    body:'임신이 확인되면 병원에서 임신확인서를 받아 국민행복카드를 신청해요. 임신·출산 진료비로 100만 원(다태아 140만 원)을 쓸 수 있어요.',
    support:{ amount:1000000, label:'국민행복카드 진료비 바우처' } },
  { at:'w6', type:'choice', id:'hospital', title:'분만 병원과 입원실',
    body:'검진을 다닐 병원이 곧 아기를 낳을 병원이 되는 경우가 많아요. 자연분만은 건강보험으로 본인 부담이 적지만, 입원실 종류와 병원 규모에 따라 비용이 달라져요.',
    payAt:'m0',
    options:[
      { id:'local-multi', label:'집 가까운 산부인과 · 다인실', once:300000, note:'다니기 편하고 비용 부담이 가장 적어요.' },
      { id:'local-single', label:'집 가까운 산부인과 · 1인실', once:900000, note:'1인실은 하루 15~25만 원 정도 더 들어요.' },
      { id:'univ', label:'대학병원', once:800000, note:'고위험 임신이거나 지병이 있으면 처음부터 대학병원이 안심이에요. 대기가 길어요.' },
    ] },
  { at:'w8', type:'todo', title:'회사에 알리고 제도 확인하기',
    body:'임신 초기와 후기에는 하루 2시간 근로시간 단축을 신청할 수 있어요. 출산휴가·육아휴직 일정을 회사와 미리 이야기해 두면 좋아요.' },
  { at:'w10', type:'choice', id:'insurance', title:'태아보험',
    body:'태아보험은 보통 22주 전에 가입해야 선천이상 보장이 붙어요. 꼭 필요한지, 실손 위주로 가볍게 할지 둘이 정해요.',
    options:[
      { id:'full', label:'종합 태아보험 가입', once:250000, monthly:50000, span:[0,35], note:'보장이 넓은 대신 매달 나가는 돈이 커요. 보험은 성인까지 이어져요.' },
      { id:'light', label:'실손 위주로 가볍게', once:120000, monthly:20000, span:[0,35], note:'꼭 필요한 보장만 넣어 부담을 줄여요.' },
      { id:'none', label:'가입하지 않기', mode:'none', note:'그만큼 아이 통장에 따로 모아 두는 집도 있어요.' },
    ] },
  { at:'w12', type:'todo', title:'1차 기형아 검사 (11~13주)',
    body:'목덜미 투명대(NT) 초음파와 피검사를 해요. 결과가 애매하면 니프티 같은 추가 검사를 권하기도 해요.',
    cost:100000 },

  // ── 임신 중기 ──────────────────────────────
  { at:'w16', type:'choice', id:'postpartum', title:'산후조리 방법',
    body:'인기 있는 산후조리원은 이 무렵에 예약이 마감되기도 해요. 출산 뒤 누가 어디서 산모와 아기를 돌볼지 정해요.',
    payAt:'m0',
    options:[
      { id:'center2', label:'산후조리원 2주', once:3800000, note:'전국 평균 2주 일반실 기준이에요. 서울은 더 비싸요.' },
      { id:'center1-helper', label:'조리원 1주 + 산후도우미', once:2600000, note:'조리원에서 회복한 뒤 집에서 도우미와 아기 리듬을 만들어요.' },
      { id:'helper', label:'정부지원 산후도우미만', once:700000, note:'산모·신생아 건강관리 바우처로 본인 부담이 줄어요. 소득·지역에 따라 달라요.' },
      { id:'family', label:'가족 도움', once:500000, note:'돈은 덜 들지만 서로의 기대를 미리 맞춰 두는 게 중요해요. (감사 비용만 잡았어요)' },
    ] },
  { at:'w20', type:'todo', title:'정밀 초음파 (20~24주)',
    body:'아기의 장기와 손발을 꼼꼼히 보는 검사예요. 같이 가서 화면을 보는 부부가 많아요.',
    cost:150000 },
  { at:'w20', type:'edu', id:'parent-style', title:'우리는 어떤 부모가 되고 싶나요?',
    body:'정답은 없어요. 둘이 생각하는 부모의 모습이 같은지 먼저 맞춰 보면, 앞으로의 선택이 쉬워져요.',
    options:[
      { id:'friend', label:'친구 같은 부모', note:'아이와 많이 놀고, 이야기를 잘 들어 주는 부모.' },
      { id:'fence', label:'든든한 울타리', note:'규칙과 안정감을 주고, 기댈 수 있는 부모.' },
      { id:'watch', label:'한 발 뒤에서 지켜보는 부모', note:'아이가 스스로 해 보도록 기다려 주는 부모.' },
      { id:'learn', label:'함께 배우는 부모', note:'완벽하지 않아도 아이와 같이 크는 부모.' },
    ] },
  { at:'w22', type:'choice', id:'leave', title:'육아휴직 계획',
    body:'누가, 언제, 얼마나 쉴지에 따라 돌봄 방식과 수입이 달라져요. 부부가 같은 자녀로 함께 쓰면 첫 6개월 급여가 늘어나는 제도(6+6)도 있어요.',
    options:[
      { id:'mom1y', label:'아내가 1년 쉬기', note:'가장 흔한 방식이에요. 복직 뒤 돌봄 계획을 함께 세워 둬요.' },
      { id:'both', label:'아내 1년 + 남편 6개월 이어서', note:'아이가 기관에 가기 전까지 집에서 돌볼 수 있어요.' },
      { id:'together', label:'둘이 같이 쉬기 (6+6)', note:'신생아 시기를 둘이 함께 보내요. 휴직 급여 특례를 확인해요.' },
      { id:'grand', label:'짧게 쉬고 조부모 도움', monthly:500000, span:[4,35], note:'조부모 감사 비용으로 매달 50만 원을 잡았어요.' },
    ] },
  { at:'w24', type:'todo', title:'임신성 당뇨 검사 (24~28주)',
    body:'단 음료를 마시고 혈당을 재요. 결과가 높으면 식단 관리를 시작해요.',
    cost:30000 },
  { at:'w26', type:'buy', id:'stroller', title:'유모차',
    body:'신생아 때부터 쓸 디럭스형, 가볍고 접기 쉬운 절충형이 있어요. 첫째라면 당근 디럭스도 많이 써요.',
    options:[
      { id:'new-deluxe', label:'새 디럭스 유모차', once:1200000, mode:'new', note:'승차감이 좋지만 무겁고 커요.' },
      { id:'new-mid', label:'새 절충형 유모차', once:600000, mode:'new', note:'신생아부터 쓰고 차에 싣기 편해요.' },
      { id:'used', label:'당근 디럭스', once:350000, mode:'used', note:'바퀴와 브레이크 상태를 꼭 확인해요.' },
      { id:'gift', label:'물려받기 · 선물', once:0, mode:'gift', note:'' },
    ] },
  { at:'w27', type:'buy', id:'carseat', title:'카시트',
    body:'병원에서 집에 올 때부터 필요해요. 사고 이력은 겉으로 알 수 없어서 카시트만큼은 새것을 권하는 경우가 많아요.',
    options:[
      { id:'new-rotate', label:'새 회전형 카시트', once:600000, mode:'new', note:'아기를 태우고 내리기 편해요.' },
      { id:'new-basic', label:'새 일반 카시트', once:300000, mode:'new', note:'안전 인증만 확인하면 충분해요.' },
      { id:'used', label:'당근 카시트', once:150000, mode:'used', note:'사고 이력과 제조일(보통 6~10년 수명)을 꼭 확인해요.' },
      { id:'gift', label:'물려받기 · 선물', once:0, mode:'gift', note:'' },
    ] },
  { at:'w28', type:'buy', id:'bed', title:'아기 잠자리',
    body:'아기 침대는 쓰는 기간이 짧아서 당근 거래가 가장 활발한 물건 중 하나예요.',
    options:[
      { id:'new-wood', label:'새 원목 아기 침대', once:400000, mode:'new', note:'' },
      { id:'new-bumper', label:'새 범퍼 침대', once:300000, mode:'new', note:'뒤집기 시작하면 바닥형이 편하다는 집도 많아요.' },
      { id:'used', label:'당근 아기 침대', once:100000, mode:'used', note:'매트리스는 새것으로 바꾸기도 해요.' },
      { id:'floor', label:'바닥 매트와 이불만', once:80000, mode:'new', note:'' },
    ] },

  // ── 임신 후기 ──────────────────────────────
  { at:'w29', type:'buy', id:'clothes0', title:'배냇저고리 · 속싸개 · 아기옷',
    body:'신생아 옷은 금방 작아져요. 너무 많이 사 두지 않는 게 요령이에요.',
    options:[
      { id:'new', label:'새것으로 넉넉히', once:300000, mode:'new', note:'' },
      { id:'used', label:'당근 묶음 + 꼭 필요한 것만 새것', once:100000, mode:'used', note:'' },
      { id:'gift', label:'물려받기 · 선물', once:0, mode:'gift', note:'' },
    ] },
  { at:'w31', type:'choice', id:'feeding', title:'수유 계획',
    body:'계획대로 안 될 수도 있어요. 그래도 미리 이야기해 두면 밤 수유를 누가 어떻게 나눌지 정하기 쉬워요.',
    options:[
      { id:'breast', label:'모유 위주', once:200000, monthly:20000, span:[0,11], note:'유축기와 수유용품 정도만 들어요.' },
      { id:'mixed', label:'혼합 수유', once:150000, monthly:80000, span:[0,11], note:'밤에는 분유로 교대하는 집이 많아요.' },
      { id:'formula', label:'분유 위주', once:100000, monthly:150000, span:[0,11], note:'둘이 똑같이 밤 수유를 나눌 수 있어요.' },
    ] },
  { at:'w32', type:'buy', id:'bottle', title:'젖병 · 소독기',
    body:'젖병 소독기는 편하지만 없어도 열탕 소독으로 할 수 있어요.',
    options:[
      { id:'new', label:'새 젖병 + UV 소독기', once:300000, mode:'new', note:'' },
      { id:'used', label:'젖병은 새것, 소독기는 당근', once:120000, mode:'used', note:'' },
      { id:'boil', label:'젖병만 사고 열탕 소독', once:60000, mode:'new', note:'' },
    ] },
  { at:'w33', type:'todo', title:'출산 가방 싸기',
    body:'산모 패드, 수유 브라, 세면도구, 아기 퇴원복, 손수건을 챙겨요. 32~36주쯤 미리 현관에 두면 마음이 편해요.',
    cost:150000 },
  { at:'w34', type:'buy', id:'diaper', title:'기저귀',
    body:'두 돌 무렵까지 매달 나가는 돈이에요. 브랜드를 정하기보다 아기 피부에 맞는 걸 찾는 게 먼저예요.',
    options:[
      { id:'premium', label:'프리미엄 브랜드', monthly:100000, span:[0,23], mode:'new', note:'' },
      { id:'basic', label:'가성비 브랜드', monthly:60000, span:[0,23], mode:'new', note:'' },
      { id:'cloth', label:'천기저귀 섞어 쓰기', once:150000, monthly:40000, span:[0,23], mode:'new', note:'빨래가 늘어나요.' },
    ] },
  { at:'w36', type:'todo', title:'진통이 오면 누가 무엇을 할지',
    body:'병원까지 가는 길, 연락할 사람 순서, 첫째 반려동물 돌봄을 정해 두세요. 남편 출산휴가(배우자 출산휴가 20일)도 확인해요.' },
  { at:'w38', type:'todo', title:'아기 이름 후보 정하기',
    body:'출생신고는 태어난 지 한 달 안에 해야 해요. 이름 후보를 두세 개로 좁혀 두면 좋아요.' },

  // ── 출산 ──────────────────────────────────
  { at:'w40', type:'milestone', title:'아기가 태어났어요',
    body:'긴 기다림 끝에 셋이 되었어요. 이제부터는 주가 아니라 달로 시간이 흘러요.' },
  { at:'m0', type:'todo', title:'출생신고 · 지원금 한 번에 신청',
    body:'주민센터나 정부24에서 출생신고를 하면서 첫만남이용권, 부모급여, 아동수당을 한 번에 신청할 수 있어요.',
    support:{ amount:2000000, label:'첫만남이용권 (첫째)' } },
  { at:'m0', type:'todo', title:'신생아 검사와 첫 예방접종',
    body:'선천성 대사이상·청각 선별 검사, B형간염과 BCG 접종을 해요. 예방접종 도우미 앱으로 일정을 받아 두세요.' },
  { at:'m1', type:'todo', title:'영유아 건강검진 1차 (생후 14~35일)',
    body:'키와 몸무게, 발달을 확인해요. 검진은 만 6세까지 여러 번 있고 비용은 무료예요.' },
  { at:'m2', type:'buy', id:'carrier', title:'아기띠 · 힙시트',
    body:'안고 다니는 시간이 늘어나요. 목을 가누는 시기에 맞춰 고르면 돼요.',
    options:[
      { id:'new', label:'새 아기띠', once:250000, mode:'new', note:'' },
      { id:'used', label:'당근 아기띠', once:80000, mode:'used', note:'버클과 허리 벨트를 확인해요.' },
      { id:'gift', label:'물려받기 · 선물', once:0, mode:'gift', note:'' },
    ] },
  { at:'m3', type:'buy', id:'play0', title:'바운서 · 모빌 · 놀이매트',
    body:'잠깐씩 쓰고 마는 물건이 많은 시기예요. 다 사기보다 꼭 필요한 것만 골라도 돼요.',
    options:[
      { id:'new', label:'새것으로 갖추기', once:400000, mode:'new', note:'' },
      { id:'used', label:'당근으로 갖추기', once:150000, mode:'used', note:'' },
      { id:'min', label:'놀이매트만', once:50000, mode:'new', note:'' },
    ] },
  { at:'m4', type:'edu', id:'sleep', title:'잠은 어떻게 재울까요?',
    body:'밤잠이 길어지기 시작하는 시기예요. 어떤 방식이든 둘이 같은 방법으로 재우는 게 가장 중요해요.',
    options:[
      { id:'separate', label:'따로 재우고 수면 교육', note:'스스로 잠드는 연습을 해요.' },
      { id:'same-room', label:'같은 방, 따로 침대', note:'가까이 있되 잠자리는 나눠요.' },
      { id:'co', label:'함께 자며 아이 속도대로', note:'아이가 준비될 때까지 기다려요.' },
    ] },
  { at:'m5', type:'todo', title:'어린이집 입소 대기 신청',
    body:'임신육아종합포털 아이사랑에서 여러 곳을 대기 신청할 수 있어요. 국공립은 대기가 길어서 일찍 걸어 두는 게 좋아요.' },
  { at:'m6', type:'choice', id:'babyfood', title:'이유식',
    body:'6개월 무렵 이유식을 시작해요. 만들지, 사 먹일지에 따라 시간과 돈이 달라져요.',
    options:[
      { id:'home', label:'직접 만들기', once:150000, monthly:50000, span:[6,11], note:'도구를 사고 재료비가 들어요. 시간이 많이 들어요.' },
      { id:'buy', label:'시판 이유식', monthly:200000, span:[6,11], note:'시간을 아끼는 대신 비용이 커요.' },
      { id:'mix', label:'섞어서', once:80000, monthly:120000, span:[6,11], note:'주말엔 만들고 주중엔 사 먹여요.' },
    ] },
  { at:'m8', type:'edu', id:'screen', title:'영상은 언제부터, 얼마나?',
    body:'식당에서, 차 안에서 영상을 틀어 주고 싶은 순간이 와요. 미리 정해 두면 그 순간 덜 흔들려요.',
    options:[
      { id:'none', label:'만 2세까지 보여 주지 않기', note:'세계보건기구 권고에 가까워요.' },
      { id:'limited', label:'정해진 때, 짧게만', note:'영상 통화나 노래 영상처럼 함께 보는 것만.' },
      { id:'flex', label:'상황에 따라 유연하게', note:'대신 식사와 잠자리 전에는 끄기로.' },
    ] },
  { at:'m10', type:'buy', id:'chair', title:'아기 식탁 의자',
    body:'이유식을 앉아서 먹기 시작해요. 오래 쓰는 성장형과 가볍게 쓰는 부스터가 있어요.',
    options:[
      { id:'new', label:'새 성장형 의자', once:300000, mode:'new', note:'' },
      { id:'used', label:'당근 의자', once:80000, mode:'used', note:'' },
      { id:'booster', label:'접이식 부스터', once:40000, mode:'new', note:'' },
    ] },

  // ── 첫돌 ─────────────────────────────────
  { at:'m12', type:'milestone', title:'첫돌이에요',
    body:'부모급여가 월 100만 원에서 50만 원으로 줄어요. 아이는 걷기 시작하고, 집 안의 모든 것이 궁금해져요.' },
  { at:'m12', type:'choice', id:'dol', title:'돌잔치',
    body:'요즘은 가족끼리 조용히 보내는 집이 늘었어요. 누구를 부를지가 곧 예산이에요.',
    options:[
      { id:'party', label:'돌잔치', once:3000000, note:'장소·식사·스냅 기준이에요. 축하금은 넣지 않았어요.' },
      { id:'family', label:'가족 식사 + 돌상 대여', once:700000, note:'' },
      { id:'photo', label:'스냅 촬영만', once:300000, note:'' },
    ] },
  { at:'m12', type:'buy', id:'clothes1', title:'자라는 만큼 옷과 신발',
    body:'돌 이후로는 계절마다 옷을 새로 마련해야 해요. 매달 들어가는 돈으로 잡았어요.',
    options:[
      { id:'new', label:'새 옷 위주', monthly:100000, span:[12,35], mode:'new', note:'' },
      { id:'used', label:'당근 · 물려받기 위주', monthly:30000, span:[12,35], mode:'used', note:'' },
    ] },
  { at:'m13', type:'choice', id:'care', title:'낮 시간 돌봄',
    body:'복직이 다가오면 낮에 누가 아이를 돌볼지 정해야 해요. 어린이집을 다니면 부모급여 대신 보육료가 바우처로 나가요.',
    options:[
      { id:'daycare', label:'어린이집', monthly:100000, span:[13,35], note:'보육료는 지원돼요. 특별활동비·준비물 정도만 들어요.' },
      { id:'home', label:'가정 보육', note:'부모 중 한 명이 돌봐요. 부모급여를 현금으로 받아요.' },
      { id:'sitter', label:'시터', monthly:1500000, span:[13,35], note:'하루 8시간 기준이에요.' },
      { id:'grand', label:'조부모', monthly:500000, span:[13,35], note:'감사 비용으로 잡았어요.' },
    ] },
  { at:'m15', type:'edu', id:'books', title:'책과 장난감',
    body:'전집, 교구, 장난감 광고가 쏟아지는 시기예요. 무엇을 기준으로 들일지 정해요.',
    options:[
      { id:'set', label:'전집과 교구 들이기', once:1000000, note:'' },
      { id:'library', label:'도서관 · 당근 중심', monthly:20000, span:[15,35], note:'' },
      { id:'few', label:'좋아하는 몇 가지만 깊게', once:200000, note:'' },
    ] },
  { at:'m18', type:'edu', id:'class', title:'문화센터 · 놀이 수업',
    body:'또래와 어울리고 부모도 숨 돌릴 수 있는 시간이에요. 꼭 필요한지, 얼마나 할지 정해요.',
    options:[
      { id:'culture', label:'주 1회 문화센터', monthly:100000, span:[18,35], note:'' },
      { id:'academy', label:'오감 · 놀이 학원', monthly:250000, span:[18,35], note:'' },
      { id:'outside', label:'집과 놀이터, 공원에서', note:'' },
    ] },
  { at:'m20', type:'edu', id:'english', title:'영어는 언제부터?',
    body:'주변에서 영어 이야기가 들려오기 시작해요. 우리 집의 기준을 정해요.',
    options:[
      { id:'early', label:'영어 노래 · 그림책으로 일찍', monthly:30000, span:[20,35], note:'' },
      { id:'class', label:'영어 놀이 수업', monthly:200000, span:[20,35], note:'' },
      { id:'later', label:'모국어 먼저, 영어는 나중에', note:'' },
    ] },

  // ── 두 돌 ────────────────────────────────
  { at:'m24', type:'milestone', title:'두 돌이에요',
    body:'부모급여가 끝나고 아동수당만 남아요. 말이 트이고 "내가 할래"가 늘어나요.' },
  { at:'m24', type:'edu', id:'potty', title:'기저귀 떼기',
    body:'주변 아이들과 비교하기 쉬운 시기예요. 언제, 어떻게 할지 정해 두면 서로 덜 조급해져요.',
    options:[
      { id:'signal', label:'아이가 신호를 보낼 때까지 기다리기', note:'' },
      { id:'plan', label:'여름에 날을 정해 시작하기', note:'' },
      { id:'daycare', label:'어린이집 선생님과 맞춰서', note:'' },
    ] },
  { at:'m26', type:'edu', id:'discipline', title:'훈육은 어떻게?',
    body:'떼쓰기가 시작돼요. 누가 혼내고 누가 달래는 역할로 굳지 않게 원칙을 같이 정해요.',
    options:[
      { id:'firm', label:'다정하지만 단호하게, 같은 규칙', note:'안 되는 건 둘 다 똑같이 안 된다고 말해요.' },
      { id:'explain', label:'이유를 설명하고 기다리기', note:'감정을 먼저 읽어 주고 이야기해요.' },
      { id:'flex', label:'상황에 따라 유연하게', note:'대신 위험한 것만은 단호하게.' },
    ] },
  { at:'m30', type:'choice', id:'kinder', title:'만 3세 이후에는 어디로?',
    body:'유치원 입학 원서는 보통 만 3세가 되는 해 11월에 접수해요. 어디를 보낼지가 앞으로 몇 년의 교육 방향이 돼요.',
    options:[
      { id:'public', label:'국공립 유치원', after:50000, note:'추첨 경쟁이 있어요. 방과후 과정 비용 정도만 들어요.' },
      { id:'private', label:'사립 유치원', after:250000, note:'지원금을 받고 남는 본인 부담 기준이에요.' },
      { id:'daycare', label:'어린이집 계속 다니기', after:50000, note:'익숙한 곳에서 계속 다녀요.' },
      { id:'english', label:'놀이학교 · 영어유치원', after:1500000, note:'' },
    ] },
  { at:'m33', type:'todo', title:'유치원 입학 신청',
    body:'처음학교로 사이트에서 유치원 입학을 신청해요. 국공립은 추첨이에요.' },
  { at:'m35', type:'todo', title:'영유아 건강검진 · 만 3세 검진',
    body:'시력과 언어 발달도 같이 봐요.' },
];

// 이벤트마다 t 와 id 를 붙여 둬요 (선택이 없는 이벤트는 순번으로 id)
EVENTS.forEach((ev, i) => {
  ev.t = atToT(ev.at);
  if(!ev.id) ev.id = 'e' + i;
});
EVENTS.sort((a, b) => a.t - b.t);

export const isDecision = ev => ev.type === 'buy' || ev.type === 'choice' || ev.type === 'edu';
export const DECISIONS = EVENTS.filter(isDecision);
export const byId = Object.fromEntries(EVENTS.map(e => [e.id, e]));

// 구간 (진행 막대와 예산 나누기에 같이 써요)
export const PHASES = [
  { id:'preg', label:'임신기', from:0, to:BIRTH_T },
  { id:'y0', label:'0세', from:BIRTH_T, to:BIRTH_T + 12 },
  { id:'y1', label:'1세', from:BIRTH_T + 12, to:BIRTH_T + 24 },
  { id:'y2', label:'2세', from:BIRTH_T + 24, to:END_T },
];
export function phaseOf(t){
  return PHASES.find(p => t >= p.from && t < p.to) || PHASES[PHASES.length - 1];
}

export const TYPE_LABEL = { todo:'할 일', milestone:'', buy:'살 것', choice:'정할 것', edu:'키우는 방향' };
export const MODE_LABEL = { new:'새것', used:'당근', gift:'물려받기·선물', none:'안 함' };
