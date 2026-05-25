# Slowmorn Studio — 홈페이지

느린 아침처럼, 천천히 깊게 만드는 앱 스튜디오의 공식 홈페이지입니다.

## 폴더 구조

```
slowmorn-site/
├── index.html        ← 메인 페이지
├── benedi.html       ← Benedi 앱 상세페이지
├── errorspace.html   ← ErrorSpace 앱 상세페이지 (다크 톤)
├── style.css         ← 세 페이지가 공유하는 공통 스타일
├── script.js         ← 스크롤 등장 효과
├── .nojekyll         ← GitHub Pages가 assets 폴더를 그대로 서빙하게 함
├── README.md
└── assets/
    ├── benedi.png        ← Benedi 앱 아이콘
    └── errorspace.png    ← ErrorSpace 앱 아이콘
```

메인 페이지의 앱 카드를 누르면 각 상세페이지로 이동합니다.

## GitHub Pages로 배포하는 법

1. GitHub에서 새 저장소(repository)를 만듭니다.
   - 개인/조직 메인 사이트로 쓰려면 이름을 `<사용자명>.github.io` 로 만들면 됩니다.
   - 프로젝트 페이지로 쓰려면 아무 이름이나 괜찮습니다 (예: `slowmorn-site`).
2. 이 폴더 안의 파일 전부를 저장소에 업로드합니다. (`assets` 폴더 포함)
3. 저장소 → **Settings → Pages** 로 이동합니다.
4. **Source** 를 `Deploy from a branch` 로 두고, 브랜치를 `main` / 폴더를 `/ (root)` 로 선택 후 저장합니다.
5. 1~2분 뒤 안내되는 주소로 사이트가 열립니다.

## 수정하면 좋은 곳

세 HTML 파일 모두에 이메일이 들어 있습니다.

- 이메일: `hello@slowmorn.studio` → 실제 이메일 주소로 일괄 변경
- Benedi 출시 후: `benedi.html` 의 상태 배지(`status live`)와 출시 안내 문구 갱신,
  앱스토어 링크가 생기면 연락처 영역에 버튼 추가
- ErrorSpace 출시 후: `errorspace.html` 과 `index.html` 의 배지를
  `status soon` → `status live` 로 변경

## 디자인 메모

- 메인 / Benedi 페이지: 라이트 톤 (아침 햇살, 미색 배경)
- ErrorSpace 페이지: 다크 톤 — `<body class="night">` 한 줄로 전환되며,
  앱 아이콘의 다크한 정체성과 맞췄습니다.
- 폰트: 제목 Fraunces, 본문 Newsreader (Google Fonts에서 자동 로드)

## 커스텀 도메인 (선택)

`slowmorn.studio` 같은 도메인을 연결하려면 저장소 루트에 `CNAME` 파일을
만들고 그 안에 도메인 주소만 한 줄 적은 뒤, 도메인 등록처의 DNS 설정을
GitHub Pages 안내대로 맞추면 됩니다.
