(async function(){
  // 파일 보관과 템플릿은 assets/store.js 가 맡습니다. 이 파일은 화면만 그립니다.
  const BS = window.BudgetStore;
  await BS.ready;
  // GA4 events. Silent when analytics is blocked or still loading.
  function track(name, params){
    try{ if(typeof gtag === "function") gtag("event", name, params || {}); }catch(e){}
  }
  // ExcelJS is ~950KB and only two buttons need it, so fetch it on first use
  const EXCELJS_URL = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
  let excelPromise = null;
  function loadExcel(){
    if(window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if(!excelPromise){
      excelPromise = new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = EXCELJS_URL;
        el.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error("no ExcelJS"));
        el.onerror = () => reject(new Error("load failed"));
        document.head.appendChild(el);
      }).catch(err => { excelPromise = null; throw err; });
    }
    return excelPromise;
  }
  const TEMPLATE_LIST = BS.templates;

  // Menu entries after 빈 목록, in the data's order
  document.getElementById("tplBlank").insertAdjacentHTML("afterend", TEMPLATE_LIST.map(t => {
    const e = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    return `<button type="button" data-tpl="${e(t.id)}" data-label="${e(t.label)}">${e(t.label)}<small>${e(t.desc)}</small></button>`;
  }).join(""));

  const { nid, fromTemplate, newPlan, safeLink, planLabel } = BS;

  // store = 모든 파일; state = 지금 열어 둔 파일
  const store = BS.data;
  BS.purgeExpired();
  if(!BS.live.length) BS.addPlan("blank");
  let state;
  // 실시간 반영은 같이 쓰는 예산표를 열어 둘 때만 연결합니다 (무료 플랜의 동시 연결 수를 아끼려고)
  let watching = null, stopWatch = null, sharedIds = new Set();
  function syncActive(){
    // 휴지통에 든 파일은 건너뜁니다
    state = BS.live.find(p => p.id === store.activeId) || BS.live[0] || store.plans[0];
    store.activeId = state.id;
    ensureWatch();
  }
  syncActive();
  function replaceActive(data){
    // 색은 파일의 것이라 그대로 둡니다
    const plan = newPlan(Object.assign(data, { id: state.id, accent: state.accent }));
    store.plans[store.plans.indexOf(state)] = plan;
    state = plan;
  }

  const Auth = window.BudgetAuth;
  const save = () => { BS.save(state); showSaved(); };
  const hhmm = t => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  function showSaved(){
    const el = document.getElementById("savedAt");
    el.textContent = state.updatedAt ? "자동 저장됨 · " + hhmm(state.updatedAt) : "";
  }
  const saveToAccount = () => BS.saveToAccount();

  // 로그인했을 때: 계정 보드로 바꿔 끼웁니다 (첫 로그인이면 로그인 전 파일을 옮겨요)
  async function mergeWithAccount(){
    if(!await BS.mergeWithAccount()) return;
    if(!BS.live.length) BS.addPlan("blank");
    syncActive();
    render();
    markUrl();
    const n = BS.offerImport();
    if(n) toast(`로그인 전에 만든 파일 ${n}개가 이 브라우저에 있어요`, null, { label: "가져오기", run: () => {
      BS.importGuest(); render(); toast("계정으로 가져왔어요");
    } });
  }

  // 로그아웃했을 때: 로그인 전 보드로 돌아갑니다
  function leaveAccount(){
    if(!BS.leaveAccount()) return;
    sharedIds = new Set();
    if(!BS.live.length) BS.addPlan("blank");
    syncActive();
    render();
    markUrl();
  }

  // ---- formatting ----
  const won = n => (n || 0).toLocaleString("ko-KR") + "원";
  const plain = n => n ? n.toLocaleString("ko-KR") : "";
  const parseMoney = s => {
    const d = String(s).replace(/[^\d]/g, "");
    return d ? Math.min(parseInt(d, 10), 999999999999) : 0;
  };
  function manwon(n){
    if(!n || n < 10000) return "\u00a0";
    const man = Math.round(n / 10000);
    if(man >= 10000){
      const eok = Math.floor(man / 10000), rest = man % 10000;
      return "약 " + eok + "억" + (rest ? " " + rest.toLocaleString("ko-KR") + "만" : "") + " 원";
    }
    return "약 " + man.toLocaleString("ko-KR") + "만 원";
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  // ---- render ----
  const catsEl = document.getElementById("cats");
  // 칸보다 긴 항목 이름과 메모는 커서를 올리면 툴팁으로 전체를 보여 줍니다
  catsEl.addEventListener("mouseover", e => {
    const t = e.target;
    if(!t.classList || !(t.classList.contains("name") || t.classList.contains("memo"))) return;
    if(t.scrollWidth > t.clientWidth) t.title = t.value;
    else t.removeAttribute("title");
  });
  const titleEl = document.getElementById("planTitle");

  const catSum = c => c.items.reduce((s, i) => s + (i.budget || 0), 0);

  // 지출: 체크하면 그 항목의 가격이 저절로 들어가고(actualAuto), 체크를 풀면 다시 비워요.
  // 직접 적은 값은 건드리지 않아요. 칸을 비우면 다시 저절로 채우는 쪽으로 돌아갑니다.
  function syncSpend(it){
    if(it.done){
      if(it.actualAuto || !it.actual){ it.actual = it.budget || 0; it.actualAuto = true; }
    } else if(it.actualAuto){
      it.actual = 0; delete it.actualAuto;
    }
  }
  const syncAllSpend = () => { if(!isGuest(state)) state.categories.forEach(c => c.items.forEach(syncSpend)); };

  const isGuest = p => p && p.kind === "guestbook";
  const guestCount = c => c.items.filter(i => i.name || i.budget).length;
  // 예산표는 빈 항목도 한 칸으로 셉니다 (방명록은 이름이나 금액이 있는 사람만)
  const itemCount = c => isGuest(state) ? guestCount(c) : c.items.length;

  function catSumHTML(c){
    const b = catSum(c);
    if(isGuest(state)) return `축의금 <b>${won(b)}</b>&nbsp;&nbsp;<b>${guestCount(c)}</b>명`;
    const done = c.items.filter(i => i.done).length;
    return `예산 <b>${won(b)}</b><span class="cat-done">완료 <b>${done}</b> / ${c.items.length}</span>`;
  }

  const chosenOf = it => (it.options || []).find(o => o.id === it.choiceId);
  const qtyOf = it => Math.max(1, parseInt(it.qty, 10) || 1);
  // 금액 is the item total; one unit = the chosen option's price, else 금액 ÷ 수량.
  // 금액을 직접 고쳤으면(priceManual) 고른 선택지 가격 대신 적은 값을 따라가요.
  const unitOf = it => { const o = chosenOf(it); return o && o.price && !it.priceManual ? o.price : (it.budget || 0) / qtyOf(it); };
  const unitTitle = it => qtyOf(it) > 1 && it.budget ? ` title="개당 ${won(Math.round(unitOf(it)))}"` : "";
  function pickHTML(it){
    const n = (it.options || []).length, chosen = chosenOf(it);
    // 선택지 모두 보기: 후보를 전부 늘어놓고 고른 것을 표시합니다. 칩을 누르면 바로 고르거나 풀어요.
    if(showAllOpts && n) return `<div class="picks" role="group" aria-label="선택지">
      <button type="button" class="pick-opt pick-none${chosen ? "" : " on"}" data-none="1" aria-pressed="${!chosen}" title="선택 안 함 · 금액 0원">
        <span class="pick-opt-name">선택 안 함</span>
      </button>
      ${it.options.map(o => {
        const on = o.id === it.choiceId;
        return `<button type="button" class="pick-opt${on ? " on" : ""}" data-oid="${esc(o.id)}" aria-pressed="${on}" title="${esc(o.name)}${o.price ? " · " + won(o.price) : ""}${on ? " · 다시 누르면 선택이 풀려요" : ""}">
          <span class="pick-opt-name">${esc(o.name)}</span>${o.price ? `<span class="pick-opt-price">${won(o.price)}</span>` : ""}
        </button>`;
      }).join("")}
      <button type="button" class="pick pick-edit" aria-haspopup="dialog">선택지 고치기</button>
    </div>`;
    const cls = chosen ? " chosen" : n ? " has-options" : "";
    const label = chosen ? esc(chosen.name) : n ? `선택지 ${n}개` : "+ 선택지";
    const count = chosen && n > 1 ? `<span class="pick-count">${n}</span>` : "";
    return `<button type="button" class="pick${cls}" aria-haspopup="dialog" aria-label="선택지: ${chosen ? esc(chosen.name) : n ? `${n}개, 선택 안 함` : "없음"}"><span class="pick-name">${label}</span>${count}</button>`;
  }

  function guestRowHTML(it){
    return `<div class="row guest" data-iid="${it.id}">
      <button type="button" class="item-grip" aria-label="순서 바꾸기 (드래그하거나 방향키)" title="드래그해서 순서 바꾸기"><svg viewBox="0 0 8 14" aria-hidden="true"><circle cx="2" cy="2" r="1.3" fill="currentColor"/><circle cx="6" cy="2" r="1.3" fill="currentColor"/><circle cx="2" cy="7" r="1.3" fill="currentColor"/><circle cx="6" cy="7" r="1.3" fill="currentColor"/><circle cx="2" cy="12" r="1.3" fill="currentColor"/><circle cx="6" cy="12" r="1.3" fill="currentColor"/></svg></button>
      <input type="text" class="name" value="${esc(it.name)}" placeholder="이름" aria-label="이름">
      <input type="text" class="money budget" inputmode="numeric" value="${plain(it.budget)}" placeholder="축의금" aria-label="축의금">
      <button type="button" class="del-item" aria-label="삭제">×</button>
    </div>`;
  }

  function rowHTML(it){
    return `<div class="row${it.done ? " done" : ""}" data-iid="${it.id}">
      <button type="button" class="item-grip" aria-label="순서 바꾸기 (드래그하거나 방향키)" title="드래그해서 순서 바꾸기"><svg viewBox="0 0 8 14" aria-hidden="true"><circle cx="2" cy="2" r="1.3" fill="currentColor"/><circle cx="6" cy="2" r="1.3" fill="currentColor"/><circle cx="2" cy="7" r="1.3" fill="currentColor"/><circle cx="6" cy="7" r="1.3" fill="currentColor"/><circle cx="2" cy="12" r="1.3" fill="currentColor"/><circle cx="6" cy="12" r="1.3" fill="currentColor"/></svg></button>
      <label class="check"><input type="checkbox" class="done-box" ${it.done ? "checked" : ""} aria-label="완료 표시"></label>
      <input type="text" class="name" value="${esc(it.name)}" placeholder="항목 이름" aria-label="항목 이름">
      <input type="text" class="memo" value="${esc(it.memo || "")}" placeholder="메모" aria-label="메모">
      ${pickHTML(it)}
      <label class="qty"><input type="text" class="qty-in" inputmode="numeric" value="${qtyOf(it)}" aria-label="수량"><span aria-hidden="true">개</span></label>
      <input type="text" class="money budget price" inputmode="numeric" value="${plain(it.budget)}" aria-label="금액" placeholder="금액"${unitTitle(it)}>
      <input type="text" class="money actual" inputmode="numeric" value="${plain(it.actual)}" aria-label="지출" placeholder="지출">
      <button type="button" class="del-item" aria-label="항목 삭제">×</button>
    </div>`;
  }

  // 파일 이름 줄. 이름을 누르면 다른 파일로 건너뜁니다.
  const fileSwitch = document.querySelector(".file-switch");
  const fileNameEl = document.getElementById("fileName");
  const fileListEl = document.getElementById("fileList");

  // 남은 날. 여기서도 정하고 고칠 수 있게 버튼으로 둡니다.
  const ddayChip = document.getElementById("ddayChip");
  function renderDday(){
    if(!ddayChip) return;
    const n = BS.daysLeft(state.dday);
    if(n === null){
      ddayChip.className = "dday-chip empty";
      ddayChip.textContent = "날짜 정하기";
      ddayChip.title = "결혼식이나 출산 예정일을 정해 두면 남은 날이 보여요";
      return;
    }
    const label = (state.ddayLabel || "").trim();
    const left = n === 0 ? "오늘이에요" : (n > 0 ? `D-${n}` : `D+${-n}`);
    ddayChip.className = "dday-chip" + (n < 0 ? " past" : (n <= 14 ? " soon" : ""));
    ddayChip.textContent = label ? `${label} ${left}` : left;
    ddayChip.title = `${label ? label + " · " : ""}${state.dday} · 눌러서 고치기`;
  }
  if(ddayChip) ddayChip.addEventListener("click", () => {
    window.BudgetShell.openDday(state, () => { renderDday(); renderFileBar(); updateMini(); });
  });

  function renderFileBar(){
    fileNameEl.textContent = planLabel(state);
    fileSwitch.dataset.accent = state.accent || "green";
    const others = BS.live.filter(p => p.id !== state.id);
    fileListEl.innerHTML =
      (others.length ? others.map(p =>
        `<button type="button" data-open="${esc(p.id)}" data-accent="${esc(p.accent || "green")}">
          <span class="file-dot" aria-hidden="true"></span>${esc(planLabel(p))}
        </button>`).join("") + "<hr>"
        : `<div class="menu-note">열어 둔 파일이 이것뿐이에요</div>`)
      + `<button type="button" data-open="__desk">버짓보드로</button>`;
  }

  const swatchEls = document.querySelectorAll(".swatch");
  const colorBtn = document.getElementById("colorBtn");
  function applyAccent(){
    const key = BS.accentKey(state.accent);
    document.body.dataset.accent = key;
    swatchEls.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.accent === key)));
    const on = [...swatchEls].find(b => b.dataset.accent === key);
    if(on){
      const name = "테마 색상: " + on.getAttribute("aria-label");
      colorBtn.setAttribute("aria-label", name);
      colorBtn.title = name;
    }
  }
  swatchEls.forEach(b => b.addEventListener("click", () => {
    closeMenus();
    state.accent = b.dataset.accent;
    applyAccent();
    fileSwitch.dataset.accent = state.accent;
    save();
  }));

  function foldLabel(c){
    const n = itemCount(c);
    return c.collapsed ? `항목 펼치기 (${n}${isGuest(state) ? "명" : "개"})` : "항목 접기";
  }
  // Icon only; the label (with the hidden item count) goes to the tooltip and screen readers
  const foldBtnHTML = c => `<button type="button" class="fold-btn" aria-expanded="${!c.collapsed}" aria-label="${foldLabel(c)}" title="${foldLabel(c)}"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 5.5L7 9l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;

  const EMOJI_PH = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><circle cx="15" cy="10" r="1.2" fill="currentColor"/><path d="M8.5 14.2c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

  function render(){
    const guest = isGuest(state);
    syncAllSpend();
    // 목록을 통째로 다시 그려도 보던 자리가 움직이지 않게 스크롤 위치를 붙잡아 둡니다
    const keepY = window.scrollY;
    document.body.classList.toggle("kind-guestbook", guest);
    applyAccent();
    renderFileBar();
    renderDday();
    titleEl.value = state.title || "";
    fitTitle();
    if(!state.categories.length){
      catsEl.innerHTML = `<div class="empty">카테고리가 없어요. 아래의 '카테고리 추가'를 누르거나 위의 템플릿을 불러오세요.</div>`;
    } else {
      catsEl.innerHTML = state.categories.map(c => `
        <section class="cat${c.collapsed ? " collapsed" : ""}" data-cid="${c.id}">
          <div class="cat-head">
            <button type="button" class="cat-emoji${c.icon ? " has" : ""}" aria-haspopup="dialog" aria-label="${c.icon ? "카테고리 이모지 바꾸기" : "카테고리 이모지 넣기"}" title="${c.icon ? "이모지 바꾸기" : "이모지 넣기"}">${c.icon ? esc(c.icon) : EMOJI_PH}</button>
            <input type="text" class="cat-name" value="${esc(c.name)}" placeholder="카테고리 이름" aria-label="카테고리 이름">
            <span class="cat-sum">${catSumHTML(c)}</span>
            ${foldBtnHTML(c)}
            <details class="menu cat-menu">
              <summary aria-label="카테고리 메뉴" title="카테고리 메뉴"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg></summary>
              <div class="menu-pop">
                <button type="button" class="clear-items">항목 모두 지우기<small>카테고리 이름은 남겨요</small></button>
                ${guest ? `<button type="button" class="clear-money">축의금만 지우기<small>이름은 남겨요</small></button>`
                        : `<button type="button" class="clear-money">금액·완료 표시만 지우기<small>항목 이름은 남겨요</small></button>`}
                <hr>
                <button type="button" class="del-cat danger">카테고리 삭제</button>
              </div>
            </details>
          </div>
          ${guest
            ? `<div class="cols guest" aria-hidden="true"><span></span><span>이름</span><span class="r">축의금</span><span></span></div>
          <div class="rows">${c.items.map(guestRowHTML).join("")}</div>
          <button type="button" class="add-item">+ 이름 추가</button>`
            : `<div class="cols" aria-hidden="true"><span></span><span></span><span>항목</span><span>메모</span><span>선택지</span><span class="r">수량</span><span class="r">금액</span><span class="r">지출</span><span></span></div>
          <div class="rows">${c.items.map(rowHTML).join("")}</div>
          <button type="button" class="add-item">+ 항목 추가</button>`}
        </section>`).join("");
    }
    if(Math.abs(window.scrollY - keepY) > 1) window.scrollTo(0, keepY);
    updateTotals();
    updateMini();
    renderCatNav();
    renderHello();
  }

  // ---- 설명 말풍선 ----
  // 템플릿에서 들어온 설명글(state.intro)을 제목 오른쪽의 캐릭터가 말풍선으로 보여 줘요 (닫으면 helloSeen)
  function renderHello(){
    const el = document.getElementById("hello");
    const msg = state.helloSeen ? "" : (state.intro || "").trim();
    el.hidden = !msg;
    if(msg) document.getElementById("helloText").textContent = msg;
  }
  document.getElementById("helloClose").addEventListener("click", () => {
    state.helloSeen = true;
    save();
    renderHello();
  });

  // ---- 카테고리 가로 목록과 위에 붙는 막대 ----
  // 목록은 요약 카드 안에 있다가, 스크롤해서 카드의 목록 자리가 화면 위로 지나가면
  // 화면 위에 나타나는 막대로 옮겨 가요 (한 줄 요약과 함께). 다시 올라오면 카드로 돌아옵니다.
  // 카테고리를 눌러 건너뛰고, 손잡이로 순서를 바꾸고, + 로 새 카테고리 이름을 적습니다.
  const planBar = document.getElementById("planBar");
  const cardCats = document.getElementById("cardCats");
  const pbCats = document.getElementById("pbCats");
  const catNavList = document.getElementById("catNavList");
  let naming = null; // 목록에서 이름을 적고 있는 새 카테고리
  let navDrag = null;
  let lastBarH = 0;
  // 막대 높이만큼 위를 비워 둡니다 (카테고리로 이동, 끌 때 위쪽 자동 스크롤). 아직 안 떴으면 짐작값으로.
  const barH = () => planBar.classList.contains("stuck") ? (lastBarH = planBar.offsetHeight) : (lastBarH || (window.innerWidth <= 640 ? 92 : 56));
  function setStuck(on){
    if(on === planBar.classList.contains("stuck")) return;
    const x = catNavList.scrollLeft;
    const focused = pbCats.contains(document.activeElement) ? document.activeElement : null;
    if(on){
      cardCats.style.height = cardCats.offsetHeight + "px"; // 빈자리가 줄어 화면이 튀지 않게
      planBar.appendChild(pbCats);
    } else {
      cardCats.appendChild(pbCats);
      cardCats.style.height = "";
    }
    planBar.classList.toggle("stuck", on);
    catNavList.scrollLeft = x;
    if(focused && document.activeElement !== focused) focused.focus({ preventScroll: true });
    if(on) lastBarH = planBar.offsetHeight;
  }
  if(window.IntersectionObserver){
    new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0)).observe(cardCats);
  }
  // 막대 바로 아래 선에 걸쳐 있는 카테고리를 '지금 보는 곳'으로 칩니다
  function currentCatId(){
    const line = barH() + 40;
    const cards = [...catsEl.querySelectorAll(".cat")];
    const hit = cards.find(el => el.getBoundingClientRect().bottom > line);
    return hit ? hit.dataset.cid : null;
  }
  const NAV_GRIP = `<svg viewBox="0 0 8 14" aria-hidden="true"><circle cx="2" cy="2" r="1.3" fill="currentColor"/><circle cx="6" cy="2" r="1.3" fill="currentColor"/><circle cx="2" cy="7" r="1.3" fill="currentColor"/><circle cx="6" cy="7" r="1.3" fill="currentColor"/><circle cx="2" cy="12" r="1.3" fill="currentColor"/><circle cx="6" cy="12" r="1.3" fill="currentColor"/></svg>`;
  function renderCatNav(){
    if(navDrag) return;
    const here = currentCatId();
    const guest = isGuest(state);
    // 이름을 적는 중에 다시 그려도 커서 자리를 지킵니다
    const typing = document.activeElement && document.activeElement.classList.contains("cat-nav-input") ? document.activeElement : null;
    const caret = typing ? [typing.selectionStart, typing.selectionEnd] : null;
    const keepX = catNavList.scrollLeft;
    catNavList.innerHTML = state.categories.length ? state.categories.map(c => {
      if(c.id === naming) return `<div class="cat-nav-item naming" role="listitem" data-cid="${esc(c.id)}">
        <input type="text" class="cat-nav-input" value="${esc(c.name)}" placeholder="새 카테고리 이름" aria-label="새 카테고리 이름" enterkeyhint="done">
      </div>`;
      const n = itemCount(c);
      return `<div class="cat-nav-item" role="listitem" data-cid="${esc(c.id)}">
        <button type="button" class="cat-nav-grip" aria-label="'${esc(catLabel(c))}' 순서 바꾸기 (드래그하거나 방향키)" title="드래그해서 순서 바꾸기">${NAV_GRIP}</button>
        <button type="button" class="cat-nav-go" data-go="${esc(c.id)}"${c.id === here ? ` aria-current="true"` : ""}>
          ${c.icon ? `<span class="cat-nav-emoji" aria-hidden="true">${esc(c.icon)}</span>` : ""}<span class="cat-nav-name">${esc(catLabel(c))}</span>
          <span class="cat-nav-meta">${n}</span>
        </button>
      </div>`;
    }).join("") : `<div class="cat-nav-empty">카테고리가 없어요. + 로 추가해 보세요</div>`;
    catNavList.scrollLeft = keepX;
    if(typing){
      const again = catNavList.querySelector(".cat-nav-input");
      if(again){ again.focus({ preventScroll: true }); try{ again.setSelectionRange(caret[0], caret[1]); }catch(_){} }
    }
  }
  // 지금 보는 카테고리를 표시하고, 가로 목록에서 보이도록 옆으로 밀어 둡니다
  function markCurrent(){
    const here = currentCatId();
    let on = null;
    catNavList.querySelectorAll(".cat-nav-go").forEach(b => {
      if(b.dataset.go === here){ b.setAttribute("aria-current", "true"); on = b; } else b.removeAttribute("aria-current");
    });
    if(on && !navDrag){
      const item = on.closest(".cat-nav-item");
      const l = item.offsetLeft, r = l + item.offsetWidth, vw = catNavList.clientWidth, x = catNavList.scrollLeft;
      if(l < x + 8) catNavList.scrollTo({ left: Math.max(0, l - 24), behavior: "smooth" });
      else if(r > x + vw - 8) catNavList.scrollTo({ left: r - vw + 24, behavior: "smooth" });
    }
  }
  let navRaf = 0;
  window.addEventListener("scroll", () => {
    if(navRaf) return;
    navRaf = requestAnimationFrame(() => { navRaf = 0; markCurrent(); });
  }, { passive: true });

  function flashCat(el){
    // 어디에 내렸는지 잠깐 테두리로 알려 줍니다
    el.classList.remove("cat-flash");
    void el.offsetWidth;
    el.classList.add("cat-flash");
    setTimeout(() => el.classList.remove("cat-flash"), 1400);
  }
  // 막대에 가리지 않게, 막대 높이만큼 위를 띄우고 내립니다
  const scrollToCat = el => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - barH() - 12, behavior: reduceMotion() ? "auto" : "smooth" });
  catNavList.addEventListener("click", e => {
    const btn = e.target.closest("[data-go]");
    if(!btn) return;
    const el = catsEl.querySelector(`.cat[data-cid="${CSS.escape(btn.dataset.go)}"]`);
    if(!el) return;
    scrollToCat(el);
    flashCat(el);
    track("category_jump", { count: state.categories.length });
  });
  // 세로 휠로도 가로 목록을 옆으로 넘길 수 있게
  catNavList.addEventListener("wheel", e => {
    if(Math.abs(e.deltaY) <= Math.abs(e.deltaX) || catNavList.scrollWidth <= catNavList.clientWidth) return;
    e.preventDefault();
    catNavList.scrollLeft += e.deltaY;
  }, { passive: false });

  // 새 카테고리: 맨 아래에 빈 카드를 만들고, 이름은 막대에서 적습니다
  function addCategory(){
    if(naming) finishNaming(false, true);
    const c = { id: nid(), name: "", items: [newItem()] };
    state.categories.push(c);
    naming = c.id;
    render(); save();
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduceMotion() ? "auto" : "smooth" });
    catNavList.scrollLeft = catNavList.scrollWidth;
    const input = catNavList.querySelector(".cat-nav-input");
    if(input) input.focus({ preventScroll: true });
  }
  document.getElementById("addCat").addEventListener("click", addCategory);
  document.getElementById("toTop").addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }));
  // 목록 맨 아래의 점선 단추: 카드에서 바로 이름을 적어요 (빈 목록에서 찾기 쉽게)
  document.getElementById("addCatBottom").addEventListener("click", () => {
    if(naming) finishNaming(false, true);
    const c = { id: nid(), name: "", items: [newItem()] };
    state.categories.push(c);
    render(); save();
    const input = catsEl.querySelector(`.cat[data-cid="${CSS.escape(c.id)}"] .cat-name`);
    if(input){ input.focus({ preventScroll: true }); input.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" }); }
  });

  // 이름 적기를 마칩니다. 이름도 항목도 비어 있으면 실수로 누른 것으로 보고 지워요 (keep 이면 남깁니다).
  function finishNaming(toItems, keep){
    if(!naming) return;
    const c = state.categories.find(x => x.id === naming);
    naming = null;
    if(c && !keep && !c.name.trim() && !c.items.some(hasContent)){
      state.categories = state.categories.filter(x => x !== c);
      render(); save();
      return;
    }
    renderCatNav();
    if(toItems && c){
      const input = catsEl.querySelector(`.cat[data-cid="${CSS.escape(c.id)}"] .row .name`);
      if(input) input.focus();
    }
  }
  catNavList.addEventListener("input", e => {
    if(!e.target.classList.contains("cat-nav-input")) return;
    const c = state.categories.find(x => x.id === naming);
    if(!c) return;
    c.name = e.target.value;
    const card = catsEl.querySelector(`.cat[data-cid="${CSS.escape(c.id)}"] .cat-name`);
    if(card) card.value = c.name;
    save();
  });
  catNavList.addEventListener("keydown", e => {
    if(!e.target.classList.contains("cat-nav-input") || e.isComposing) return;
    if(e.key === "Enter"){ e.preventDefault(); finishNaming(true, true); }
    if(e.key === "Escape"){ e.preventDefault(); finishNaming(false); }
  });
  catNavList.addEventListener("focusout", e => {
    if(!e.target.classList.contains("cat-nav-input") || !naming) return;
    // 같은 카드의 칸으로 옮겨 가면 거기서 이어서 적는 것이니 지우지 않아요
    const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".cat");
    finishNaming(false, !!(to && to.dataset.cid === naming));
  });

  // 순서 바꾸기: 칩의 손잡이를 끌거나, 손잡이에서 ←/→
  // 카드 안에서는 칩이 여러 줄이라 위아래로도 옮기고, 위 막대에서는 한 줄을 옆으로 옮겨요.
  // 끄는 칩은 제자리에서 translate 로 따라오고, 나머지 칩은 flip 으로 밀려납니다.
  function navMove(x, y){
    const d = navDrag;
    const oneRow = planBar.classList.contains("stuck");
    const rest = [...catNavList.querySelectorAll(".cat-nav-item")].filter(el => el !== d.item);
    const box = catNavList.getBoundingClientRect();
    const px = x - box.left + catNavList.scrollLeft, py = y - box.top;
    // 포인터 아래의 칩 (offset 으로 재서 밀려나는 애니메이션에 흔들리지 않아요). 한 줄일 때는 가로 위치만 봐요.
    const inX = el => px >= el.offsetLeft && px <= el.offsetLeft + el.offsetWidth;
    const hit = rest.find(el => inX(el) && (oneRow || (py >= el.offsetTop - 3 && py <= el.offsetTop + el.offsetHeight + 3)));
    if(hit){
      const after = px > hit.offsetLeft + hit.offsetWidth / 2;
      const already = after ? hit.nextElementSibling === d.item : d.item.nextElementSibling === hit;
      if(!already){
        flip(rest, () => { if(after) hit.after(d.item); else hit.before(d.item); });
        d.moved = true;
      }
    }
    const tx = px - d.gx - d.item.offsetLeft, ty = oneRow ? 0 : py - d.gy - d.item.offsetTop;
    d.item.style.transform = `translate(${tx}px, ${ty}px)`;
  }
  function navAutoScroll(){
    if(!navDrag) return;
    const b = catNavList.getBoundingClientRect(), x = navDrag.x;
    const speed = x < b.left + 40 ? -Math.min(14, (b.left + 40 - x) / 3 + 2)
                : x > b.right - 40 ? Math.min(14, (x - b.right + 40) / 3 + 2) : 0;
    if(speed && planBar.classList.contains("stuck")){ catNavList.scrollLeft += speed; navMove(x, navDrag.y); }
    navDrag.raf = requestAnimationFrame(navAutoScroll);
  }
  // 카드 순서를 막대 순서에 맞춥니다 (통째로 다시 그리지 않아서 보던 자리가 그대로예요)
  function applyCatOrder(order){
    state.categories.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    // 보고 있던 카드가 화면에서 같은 자리에 남도록 합니다
    const here = currentCatId();
    const anchor = here && catsEl.querySelector(`.cat[data-cid="${CSS.escape(here)}"]`);
    const move = () => state.categories.forEach(c => {
      const el = catsEl.querySelector(`.cat[data-cid="${CSS.escape(c.id)}"]`);
      if(el) catsEl.appendChild(el);
    });
    if(anchor) keepInView(anchor, move); else move();
    save();
  }
  function navEnd(cancel){
    if(!navDrag) return;
    const { item, raf, moved } = navDrag;
    cancelAnimationFrame(raf);
    navDrag = null;
    document.body.classList.remove("nav-sorting");
    item.classList.remove("dragging");
    if(cancel){ item.style.transform = ""; renderCatNav(); return; }
    const from = item.getBoundingClientRect();
    item.style.transform = "";
    const to = item.getBoundingClientRect(), dx = from.left - to.left, dy = from.top - to.top;
    if((dx || dy) && !reduceMotion()) item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 160, easing: EASE });
    if(moved){
      applyCatOrder([...catNavList.querySelectorAll(".cat-nav-item")].map(el => el.dataset.cid));
      track("category_reorder", { count: state.categories.length });
    }
  }
  catNavList.addEventListener("pointerdown", e => {
    const grip = e.target.closest(".cat-nav-grip");
    if(!grip || e.button !== 0) return;
    e.preventDefault();
    if(naming) finishNaming(false, true);
    const item = grip.closest(".cat-nav-item");
    const r = item.getBoundingClientRect();
    item.classList.add("dragging");
    document.body.classList.add("nav-sorting");
    try{ grip.setPointerCapture(e.pointerId); }catch(_){}
    navDrag = { item, gx: e.clientX - r.left, gy: e.clientY - r.top, x: e.clientX, y: e.clientY, moved: false, raf: 0 };
    navDrag.raf = requestAnimationFrame(navAutoScroll);
  });
  window.addEventListener("pointermove", e => {
    if(!navDrag) return;
    navDrag.x = e.clientX; navDrag.y = e.clientY;
    navMove(e.clientX, e.clientY);
  });
  window.addEventListener("pointerup", () => navEnd(false));
  window.addEventListener("pointercancel", () => navEnd(true));
  document.addEventListener("keydown", e => { if(navDrag && e.key === "Escape") navEnd(true); });
  catNavList.addEventListener("keydown", e => {
    const grip = e.target.closest(".cat-nav-grip");
    if(!grip) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[e.key];
    if(!step) return;
    e.preventDefault();
    const id = grip.closest(".cat-nav-item").dataset.cid;
    const order = state.categories.map(c => c.id);
    const i = order.indexOf(id), j = i + step;
    if(j < 0 || j >= order.length) return;
    order.splice(i, 1);
    order.splice(j, 0, id);
    applyCatOrder(order);
    renderCatNav();
    const again = catNavList.querySelector(`.cat-nav-item[data-cid="${CSS.escape(id)}"] .cat-nav-grip`);
    if(again){ again.focus({ preventScroll: true }); again.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  });

  // 예산 합계 = 모든 항목의 가격, 지출 합계 = 지출 칸의 합 (체크하면 가격이 저절로 들어가요)
  // 요약 카드와, 위에 붙었을 때의 한 줄 요약을 함께 채웁니다.
  function updateTotals(){
    let b = 0, spent = 0, done = 0, count = 0;
    state.categories.forEach(c => c.items.forEach(i => {
      b += i.budget || 0;
      spent += i.actual || 0;
      if(!isGuest(state) || i.name || i.budget){ count++; if(i.done) done++; }
    }));
    const guest = isGuest(state);
    document.getElementById("tBudgetLabel").textContent = guest ? "축의금 합계" : "예산 합계";
    document.getElementById("tBudget").textContent = won(b);
    document.getElementById("tBudgetMan").textContent = manwon(b);
    document.getElementById("tSpend").textContent = won(spent);
    document.getElementById("tSpendMan").innerHTML = manwon(spent) || "&nbsp;";
    document.getElementById("tPeople").textContent = `${count}명`;
    document.getElementById("titleDone").innerHTML = guest ? "" : `완료 <b>${done}</b> / ${count}`;
    document.getElementById("barBudget").innerHTML = `${guest ? "축의금" : "예산"} <b>${won(b)}</b>`;
    document.getElementById("barSpend").innerHTML = guest ? "" : `지출 <b>${won(spent)}</b>`;
    document.getElementById("barDone").innerHTML = guest ? `<b>${count}</b>명` : `완료 <b>${done}</b>/${count}`;
    showSaved();
  }
  // 한 줄 요약의 이름·남은 날
  function updateMini(){
    document.getElementById("barTitle").textContent = planLabel(state);
    const n = BS.daysLeft(state.dday), dd = document.getElementById("barDday");
    dd.textContent = n === null ? "" : (n === 0 ? "D-day" : n > 0 ? `D-${n}` : `D+${-n}`);
    dd.className = "pb-chip" + (n === null ? "" : n < 0 ? " past" : n <= 14 ? " soon" : "");
  }

  const findCat = el => state.categories.find(c => c.id === el.closest(".cat").dataset.cid);
  const findItem = (el, c) => c.items.find(i => i.id === el.closest(".row").dataset.iid);

  // ---- events ----
  // 제목 칸은 글자만큼만 넓어지고, 완료 개수가 바로 옆에 붙어요
  function fitTitle(){
    const probe = fitTitle.probe || (fitTitle.probe = Object.assign(document.createElement("span"), { className: "plan-title-probe" }));
    if(!probe.isConnected) titleEl.parentNode.appendChild(probe);
    probe.textContent = titleEl.value || titleEl.placeholder || " ";
    titleEl.style.width = Math.ceil(probe.getBoundingClientRect().width) + 4 + "px";
  }
  window.addEventListener("resize", () => fitTitle());

  // ---- 카테고리 이름 앞 이모지 ----
  // 따로 그림 파일 없이 기기의 기본 이모지를 씁니다. 카테고리마다 하나 (c.icon).
  const EMOJIS = ["💍","💒","👰","🤵","💐","🥂","💌","🎂","🎁","🎉","📸","💄",
                  "👶","🍼","🧸","🎀","🤰","🧷","🛁","🚼","🏠","🛋️","🧺","🍳",
                  "✈️","🏖️","🧳","🚗","💰","💳","🧾","📋","📅","✅","⭐","❤️",
                  "🌸","🌷","🌿","🍀","☀️","🌙","🐶","🐱","🐰","🐻","🍰","☕️"];
  const emojiPop = document.getElementById("catEmojiPop");
  const emojiGrid = document.getElementById("emojiGrid");
  emojiGrid.innerHTML = EMOJIS.map(e => `<button type="button" class="emoji-opt" data-emoji="${e}" aria-label="${e}">${e}</button>`).join("");
  let emojiFor = null; // { cid, btn }
  function openCatEmoji(c, btn){
    if(emojiFor && emojiFor.cid === c.id){ closeCatEmoji(); return; }
    closeMenus();
    emojiFor = { cid: c.id };
    emojiGrid.querySelectorAll(".emoji-opt").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.emoji === (c.icon || ""))));
    document.getElementById("emojiClear").hidden = !c.icon;
    emojiPop.hidden = false;
    // 누른 단추 바로 아래에, 화면 밖으로 나가지 않게 둡니다
    const r = btn.getBoundingClientRect(), w = emojiPop.offsetWidth;
    emojiPop.style.left = Math.max(8, Math.min(r.left, document.documentElement.clientWidth - w - 8)) + window.scrollX + "px";
    emojiPop.style.top = r.bottom + 6 + window.scrollY + "px";
    const first = emojiGrid.querySelector('[aria-pressed="true"]') || emojiGrid.querySelector(".emoji-opt");
    if(first) first.focus({ preventScroll: true });
  }
  function closeCatEmoji(back){
    if(!emojiFor) return;
    const cid = emojiFor.cid;
    emojiFor = null;
    emojiPop.hidden = true;
    if(back){ const b = catsEl.querySelector(`.cat[data-cid="${CSS.escape(cid)}"] .cat-emoji`); if(b) b.focus({ preventScroll: true }); }
  }
  function setCatEmoji(icon){
    const c = emojiFor && state.categories.find(x => x.id === emojiFor.cid);
    closeCatEmoji();
    if(!c) return;
    if(icon) c.icon = icon; else delete c.icon;
    render(); save();
  }
  emojiGrid.addEventListener("click", e => {
    const b = e.target.closest("[data-emoji]");
    if(b) setCatEmoji(b.dataset.emoji);
  });
  document.getElementById("emojiClear").addEventListener("click", () => setCatEmoji(""));
  document.addEventListener("pointerdown", e => {
    if(emojiFor && !emojiPop.contains(e.target) && !e.target.closest(".cat-emoji")) closeCatEmoji();
  });
  document.addEventListener("keydown", e => { if(emojiFor && e.key === "Escape") closeCatEmoji(true); });
  window.addEventListener("resize", () => closeCatEmoji());

  titleEl.addEventListener("input", () => {
    fitTitle();
    state.title = titleEl.value;
    fileNameEl.textContent = planLabel(state);
    updateMini();
    save();
  });

  // ---- 파일 바꾸기 ----
  // 주소에 어떤 파일인지 남겨 둡니다. 새로고침하거나 링크를 저장해도 같은 파일이 열려요.
  function markUrl(){
    try{ history.replaceState(null, "", location.pathname + "?id=" + encodeURIComponent(state.id) + location.hash); }catch(e){}
  }

  function switchTo(id){
    if(id === state.id) return;
    closeMenus();
    store.activeId = id;
    syncActive();
    render(); save();
    markUrl();
    window.scrollTo({ top: 0 });
  }

  fileListEl.addEventListener("click", e => {
    const btn = e.target.closest("[data-open]");
    if(!btn) return;
    if(btn.dataset.open === "__desk"){ location.href = "../"; return; }
    switchTo(btn.dataset.open);
  });

  catsEl.addEventListener("input", e => {
    const t = e.target;
    const c = findCat(t);
    if(!c) return;
    if(t.classList.contains("cat-name")){ c.name = t.value; save(); return; }
    const it = findItem(t, c);
    if(!it) return;
    if(t.classList.contains("name")) it.name = t.value;
    if(t.classList.contains("memo")) it.memo = t.value;
    if(t.classList.contains("qty-in")){
      t.value = t.value.replace(/[^\d]/g, "").slice(0, 4);
      const q = parseInt(t.value, 10);
      if(q) setQty(c, it, q, t);
      return; // empty while typing; fixed to 1 on change
    }
    if(t.classList.contains("money")){
      const v = parseMoney(t.value);
      const fromEnd = t.value.length - (t.selectionStart ?? t.value.length);
      t.value = plain(v);
      const pos = Math.max(0, t.value.length - fromEnd);
      try{ t.setSelectionRange(pos, pos); }catch(_){}
      if(t.classList.contains("actual")){ it.actual = v; delete it.actualAuto; } // 지출은 직접 고칠 수 있어요
      else {
        it.budget = v; // 축의금, 또는 예산표의 금액 (직접 고친 값)
        if(!isGuest(state)){
          const o = chosenOf(it);
          if(o && v === (o.price || 0) * qtyOf(it)) delete it.priceManual; else it.priceManual = true;
          syncSpend(it);
          const sp = t.closest(".row").querySelector(".actual");
          if(sp && sp !== document.activeElement) sp.value = plain(it.actual);
          if(qtyOf(it) > 1 && it.budget) t.title = `개당 ${won(Math.round(unitOf(it)))}`; else t.removeAttribute("title");
        }
      }
      t.closest(".cat").querySelector(".cat-sum").innerHTML = catSumHTML(c);
    }
    updateTotals(); save();
  });

  // Keep one unit price for the whole edit, so typing 1 → 12 doesn't compound rounding
  catsEl.addEventListener("focusin", e => {
    if(!e.target.classList.contains("qty-in")) return;
    const c = findCat(e.target), it = findItem(e.target, c);
    e.target.dataset.unit = unitOf(it);
  });

  function setQty(c, it, q, input){
    const unit = input && input.dataset.unit !== undefined ? Number(input.dataset.unit) : unitOf(it);
    it.qty = q;
    if(unit) it.budget = Math.round(unit * q);
    const rowEl = catsEl.querySelector(`[data-iid="${it.id}"]`);
    if(rowEl){
      const b = rowEl.querySelector(".budget");
      b.value = plain(it.budget);
      if(q > 1 && it.budget) b.title = `개당 ${won(Math.round(unit || unitOf(it)))}`; else b.removeAttribute("title");
      syncSpend(it);
      rowEl.querySelector(".actual").value = plain(it.actual);
      rowEl.closest(".cat").querySelector(".cat-sum").innerHTML = catSumHTML(c);
    }
    updateTotals(); save();
  }

  catsEl.addEventListener("change", e => {
    const t = e.target;
    if(t.classList.contains("qty-in")){
      if(!parseInt(t.value, 10)){ t.value = "1"; const c = findCat(t); setQty(c, findItem(t, c), 1, t); }
      return;
    }
    if(t.classList.contains("actual")){
      const c = findCat(t), it = findItem(t, c);
      if(!t.value){ delete it.actualAuto; it.actual = 0; syncSpend(it); t.value = plain(it.actual); updateTotals(); save(); }
      return;
    }
    if(!t.classList.contains("done-box")) return;
    const c = findCat(t), it = findItem(t, c);
    it.done = t.checked;
    syncSpend(it);
    const rowEl = t.closest(".row");
    rowEl.classList.toggle("done", it.done);
    const sp = rowEl.querySelector(".actual");
    sp.value = plain(it.actual);
    t.closest(".cat").querySelector(".cat-sum").innerHTML = catSumHTML(c);
    updateTotals(); save();
  });

  const newItem = () => ({ id: nid(), name: "", budget: 0, done: false });
  const hasContent = i => i.name || i.memo || i.budget || (i.options && i.options.length);
  const snapshot = () => JSON.stringify(store);
  const catLabel = c => c.name || "이름 없는 카테고리";

  function closeMenus(except){
    document.querySelectorAll("details.menu[open]").forEach(d => { if(d !== except) d.open = false; });
  }
  document.addEventListener("toggle", e => {
    if(e.target.classList && e.target.classList.contains("menu") && e.target.open) closeMenus(e.target);
  }, true);
  document.addEventListener("click", e => { if(!e.target.closest("details.menu")) closeMenus(); });
  document.addEventListener("keydown", e => {
    if(e.key !== "Escape") return;
    const open = document.querySelector("details.menu[open]");
    if(open){ open.open = false; open.querySelector("summary").focus(); }
  });

  catsEl.addEventListener("click", e => {
    const t = e.target.closest("button");
    if(!t || !t.closest(".cat")) return;
    const c = findCat(t);
    if(t.classList.contains("cat-emoji")){ openCatEmoji(c, t); return; }
    if(t.classList.contains("add-item")){
      const it = newItem();
      c.items.push(it);
      render(); save();
      const input = catsEl.querySelector(`[data-iid="${it.id}"] .name`);
      if(input) input.focus();
    }
    if(t.classList.contains("fold-btn")){
      c.collapsed = !c.collapsed;
      t.closest(".cat").classList.toggle("collapsed", !!c.collapsed);
      t.setAttribute("aria-expanded", String(!c.collapsed));
      t.setAttribute("aria-label", foldLabel(c));
      t.title = foldLabel(c);
      save();
      return;
    }
    if(t.classList.contains("pick-opt")){
      const it = findItem(t, c);
      if(t.dataset.none){
        clearChoice(it);
        const again = catsEl.querySelector(`[data-iid="${it.id}"] .pick-none`);
        if(again) again.focus();
        return;
      }
      const o = (it.options || []).find(x => x.id === t.dataset.oid);
      if(!o) return;
      chooseOption(it, o);
      // 다시 그리면 누른 칩이 새로 만들어지므로 같은 칩으로 초점을 돌려 둡니다
      const again = catsEl.querySelector(`[data-iid="${it.id}"] .pick-opt[data-oid="${CSS.escape(o.id)}"]`);
      if(again) again.focus();
      return;
    }
    if(t.classList.contains("pick")){
      openOptions(c, findItem(t, c));
      return;
    }
    if(t.classList.contains("del-item")){
      const it = findItem(t, c);
      c.items = c.items.filter(i => i !== it);
      render(); save();
    }
    if(t.classList.contains("clear-items")){
      const n = c.items.filter(hasContent).length;
      if(!n){ closeMenus(); toast("지울 항목이 없어요"); return; }
      const snap = snapshot();
      c.items = [newItem()];
      render(); save();
      toast(`'${catLabel(c)}'의 항목 ${n}개를 지웠어요`, snap);
      const input = catsEl.querySelector(`[data-cid="${c.id}"] .row .name`);
      if(input) input.focus();
    }
    if(t.classList.contains("clear-money")){
      const snap = snapshot();
      c.items.forEach(i => { i.budget = 0; i.done = false; i.choiceId = null; delete i.priceManual; });
      render(); save();
      toast(`'${catLabel(c)}'의 금액을 지웠어요`, snap);
    }
    if(t.classList.contains("del-cat")){
      const snap = snapshot();
      state.categories = state.categories.filter(x => x !== c);
      render(); save();
      toast(`'${catLabel(c)}' 카테고리를 삭제했어요`, snap);
    }
  });

  // Enter in an item name → add next item.
  // Guestbook: 이름 → 축의금 → next 이름, so a whole list can be typed without the mouse.
  catsEl.addEventListener("keydown", e => {
    if(e.key !== "Enter" || e.isComposing) return;
    if(isGuest(state) && e.target.classList.contains("name")){
      e.preventDefault();
      e.target.closest(".row").querySelector(".budget").focus();
      return;
    }
    if(e.target.classList.contains("name") || e.target.classList.contains("memo") || (isGuest(state) && e.target.classList.contains("budget"))){
      e.preventDefault();
      const c = findCat(e.target);
      const cur = findItem(e.target, c);
      const idx = c.items.indexOf(cur);
      const it = { id: nid(), name: "", budget: 0, done: false };
      c.items.splice(idx + 1, 0, it);
      render(); save();
      const input = catsEl.querySelector(`[data-iid="${it.id}"] .name`);
      if(input) input.focus();
    }
  });

  // ---- reorder items: drag a grip (mouse or touch), or arrow keys on it ----
  // (Categories are reordered from the category nav above.)
  // While dragging, the row floats under the pointer and a dashed slot marks where it will land;
  // the others slide (FLIP animation) whenever the slot moves. Items can also move to another category.
  let drag = null;
  const EASE = "cubic-bezier(.2,.8,.2,1)";
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Keep a card at the same spot on screen while the layout around it changes
  function keepInView(el, change){
    const before = el.getBoundingClientRect().top;
    change();
    window.scrollBy(0, el.getBoundingClientRect().top - before);
  }

  // Slide elements from where they were drawn to their new layout position
  function flip(els, change){
    const before = new Map(els.map(el => [el, el.getBoundingClientRect()]));
    els.forEach(el => el.getAnimations().forEach(a => a.cancel()));
    change();
    if(reduceMotion()) return;
    els.forEach(el => {
      const a = before.get(el), b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if(Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 220, easing: EASE });
    });
  }

  const inside = (el, x, y) => { const b = el.getBoundingClientRect(); return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom; };

  // Where a row sits in the layout, ignoring its slide animation (rows are positioned inside their card)
  function rowBox(row){
    const c = row.offsetParent.getBoundingClientRect();
    const top = c.top + row.offsetTop, left = c.left + row.offsetLeft;
    return { left, top, right: left + row.offsetWidth, bottom: top + row.offsetHeight, mid: top + row.offsetHeight / 2 };
  }

  function moveItemSlot(x, y){
    const { slot } = drag;
    const list = slot.parentElement;
    const rows = [...catsEl.querySelectorAll(".cat:not(.collapsed) .row:not(.dragging-row)")];
    const target = rows.find(r => { const b = rowBox(r); return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom; });
    if(target){
      const mid = rowBox(target).mid;
      const dest = target.parentElement;
      const touched = rows.filter(r => r.parentElement === list || r.parentElement === dest);
      if(dest === list){
        const seq = [...list.children].filter(el => el === slot || (el.matches(".row") && !el.classList.contains("dragging-row")));
        const from = seq.indexOf(slot), to = seq.indexOf(target);
        if(!(to > from ? y > mid : y < mid)) return; // past the middle only, so rows don't flip back and forth
        flip(touched, () => { if(to > from) target.after(slot); else target.before(slot); });
      } else {
        flip(touched, () => { if(y > mid) target.after(slot); else target.before(slot); }); // into another category
      }
      drag.moved = true;
      return;
    }
    // Over a category but not over a row (header, empty list, "+ 항목 추가"): go to the end of that list
    const card = [...catsEl.querySelectorAll(".cat:not(.collapsed)")].find(c => inside(c, x, y));
    const cardList = card && card.querySelector(".rows");
    if(cardList && cardList !== list && !cardList.querySelector(".row:not(.dragging-row)")){
      cardList.appendChild(slot);
      drag.moved = true;
    }
  }

  function moveDragTo(x, y){
    const { card, slot, gx, gy } = drag;
    card.style.left = `${x - gx}px`;
    card.style.top = `${y - gy}px`;
    moveItemSlot(x, y);
  }

  function autoScroll(){
    if(!drag) return;
    const top = barH() + 60, bottom = window.innerHeight - 60;
    const speed = drag.y < top ? -Math.min(24, (top - drag.y) / 3 + 4)
                : drag.y > bottom ? Math.min(24, (drag.y - bottom) / 3 + 4) : 0;
    if(speed){ window.scrollBy(0, speed); moveDragTo(drag.x, drag.y); }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function endDrag(cancel){
    if(!drag) return;
    const { card, slot, raf, moved } = drag;
    cancelAnimationFrame(raf);
    drag = null;
    document.body.classList.remove("is-sorting");
    if(cancel){ render(); return; } // back to the saved order

    const from = card.getBoundingClientRect();
    slot.replaceWith(card);
    card.classList.remove("dragging-row");
    card.removeAttribute("style");
    const to = card.getBoundingClientRect();
    if(!reduceMotion()) card.animate(
      [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: "none" }],
      { duration: 180, easing: EASE });
    if(moved){
      // Rebuild every category's item order from the page (an item may have changed category)
      const byId = new Map();
      state.categories.forEach(c => c.items.forEach(i => byId.set(i.id, i)));
      catsEl.querySelectorAll(".cat").forEach(cardEl => {
        const c = state.categories.find(x => x.id === cardEl.dataset.cid);
        c.items = [...cardEl.querySelectorAll(".row")].map(r => byId.get(r.dataset.iid)).filter(Boolean);
        cardEl.querySelector(".cat-sum").innerHTML = catSumHTML(c);
        const fold = cardEl.querySelector(".fold-btn");
        fold.setAttribute("aria-label", foldLabel(c)); fold.title = foldLabel(c);
      });
      save();
    }
  }

  catsEl.addEventListener("pointerdown", e => {
    const itemGrip = e.target.closest(".item-grip");
    if(itemGrip && e.button === 0){
      e.preventDefault();
      closeMenus();
      document.activeElement && document.activeElement.blur();
      const row = itemGrip.closest(".row");
      const r = row.getBoundingClientRect();
      const slot = document.createElement("div");
      slot.className = "row-slot";
      slot.style.height = `${r.height}px`;
      row.before(slot);
      Object.assign(row.style, { position: "fixed", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, margin: "0" });
      row.classList.add("dragging-row");
      document.body.classList.add("is-sorting");
      try{ itemGrip.setPointerCapture(e.pointerId); }catch(_){}
      drag = { card: row, slot, gx: e.clientX - r.left, gy: e.clientY - r.top, x: e.clientX, y: e.clientY, moved: false, raf: 0 };
      drag.raf = requestAnimationFrame(autoScroll);
    }
  });
  // On window, so the drag keeps working when the pointer leaves the grid
  window.addEventListener("pointermove", e => {
    if(!drag) return;
    drag.x = e.clientX; drag.y = e.clientY;
    moveDragTo(e.clientX, e.clientY);
  });
  window.addEventListener("pointerup", () => endDrag(false));
  window.addEventListener("pointercancel", () => endDrag(true));
  document.addEventListener("keydown", e => { if(drag && e.key === "Escape") endDrag(true); });

  catsEl.addEventListener("keydown", e => {
    const itemGrip = e.target.closest(".item-grip");
    if(itemGrip){
      const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
      if(!step) return;
      e.preventDefault();
      const c = findCat(itemGrip), it = findItem(itemGrip, c);
      const i = c.items.indexOf(it), j = i + step;
      if(j < 0 || j >= c.items.length) return;
      c.items.splice(i, 1);
      c.items.splice(j, 0, it);
      render(); save();
      const g = catsEl.querySelector(`[data-iid="${it.id}"] .item-grip`);
      if(g){ g.focus(); g.scrollIntoView({ block: "nearest" }); }
    }
  });

  document.querySelectorAll("[data-tpl]").forEach(btn => btn.addEventListener("click", () => {
    closeMenus();
    // No confirm(): some browsers/embeds block it silently, which made this do nothing. Undo is in the toast.
    const snap = snapshot();
    // Keep a name the user typed; only default names get the template's title
    const title = (state.title || "").trim();
    const isDefault = !title || /^새 예산표( \d+)?$/.test(title) || title === "우리 아기 출산 준비" || BS.templates.some(t => t.title === title);
    const plan = fromTemplate(btn.dataset.tpl);
    if(!isDefault) plan.title = state.title;
    replaceActive(plan);
    render(); save();
    track("template_load", { template: btn.dataset.tpl, source: "menu" });
    toast(`'${btn.dataset.label}' 템플릿을 불러왔어요`, snap);
  }));

  document.getElementById("clearAllItems").addEventListener("click", () => {
    const n = state.categories.reduce((s, c) => s + c.items.filter(hasContent).length, 0);
    if(!n){ toast("지울 항목이 없어요"); return; }
    const snap = snapshot();
    state.categories.forEach(c => { c.items = [newItem()]; });
    render(); save();
    toast(`항목 ${n}개를 지웠어요. 카테고리는 그대로예요`, snap);
  });

  document.getElementById("resetAll").addEventListener("click", () => {
    const snap = snapshot();
    replaceActive({ title: "새 예산표", categories: [] });
    render(); save();
    toast("모두 지웠어요", snap);
  });

  // ---- view: 1 / 2 / 4 columns ----
  const VIEW_KEY = "prep-budget-view";
  const viewBtns = document.querySelectorAll(".seg [data-cols]");
  function setCols(n){
    document.body.dataset.cols = n;
    viewBtns.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.cols === String(n))));
  }
  let cols = 1;
  try{ const v = parseInt(localStorage.getItem(VIEW_KEY), 10); if([1, 2, 4].includes(v)) cols = v; }catch(e){}
  setCols(cols);
  viewBtns.forEach(b => b.addEventListener("click", () => {
    setCols(b.dataset.cols);
    try{ localStorage.setItem(VIEW_KEY, b.dataset.cols); }catch(e){}
  }));

  // ---- view: 선택지 모두 보기 ----
  const ALLOPTS_KEY = "prep-budget-all-options";
  const allOptsToggle = document.getElementById("allOptsToggle");
  let showAllOpts = false;
  try{ showAllOpts = localStorage.getItem(ALLOPTS_KEY) === "on"; }catch(e){}
  allOptsToggle.checked = showAllOpts;
  document.body.classList.toggle("all-options", showAllOpts);
  allOptsToggle.addEventListener("change", () => {
    showAllOpts = allOptsToggle.checked;
    document.body.classList.toggle("all-options", showAllOpts);
    try{ localStorage.setItem(ALLOPTS_KEY, showAllOpts ? "on" : "off"); }catch(e){}
    render();
  });

  // ---- view: 지출 칸 보기 (기본은 꺼 둡니다. 꺼도 지출은 계속 계산되고 엑셀에도 들어가요) ----
  const SPEND_KEY = "prep-budget-show-spend";
  const spendToggle = document.getElementById("spendToggle");
  try{ spendToggle.checked = localStorage.getItem(SPEND_KEY) === "on"; }catch(e){}
  document.body.classList.toggle("show-spend", spendToggle.checked);
  spendToggle.addEventListener("change", () => {
    document.body.classList.toggle("show-spend", spendToggle.checked);
    try{ localStorage.setItem(SPEND_KEY, spendToggle.checked ? "on" : "off"); }catch(e){}
  });

  // ---- 선택지 (options per item: products, vendors, ...) ----
  const optDialog = document.getElementById("optDialog");
  const optList = document.getElementById("optList");
  const optForm = document.getElementById("optForm");
  let optCtx = null; // { cid, iid, scrollY }

  function optItem(){
    if(!optCtx) return null;
    const c = state.categories.find(x => x.id === optCtx.cid);
    return c ? c.items.find(i => i.id === optCtx.iid) || null : null;
  }
  const hostOf = link => { try{ return new URL(link).hostname.replace(/^www\./, ""); }catch(e){ return ""; } };
  const isCoupang = link => /(^|\.)(coupang\.com|coupa\.ng)$/.test(hostOf(link));
  const affNote = document.getElementById("affNote");

  const ICON_LINK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_DEL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

  // 선택지를 고르거나(항목 금액 = 선택지 가격 × 수량) 이미 고른 것을 다시 누르면 풉니다.
  // 고르면 금액이 선택지 가격으로 다시 맞춰져요. 금액 칸은 그 뒤에 직접 고칠 수 있어요.
  // 대화상자와 '선택지 모두 보기'의 칩이 함께 씁니다. 골랐으면 true.
  // '선택 안 함': 고른 선택지를 풀고 가격을 0원으로
  function clearChoice(it){
    if(!it.choiceId) return;
    const prev = chosenOf(it);
    it.choiceId = null;
    it.budget = 0;
    delete it.priceManual;
    render(); save();
    toast(prev ? `'${prev.name}' 선택을 풀었어요` : "선택을 풀었어요");
  }

  function chooseOption(it, o){
    if(it.choiceId === o.id){
      it.choiceId = null;
      it.budget = 0;
      delete it.priceManual;
      render(); save();
      if(!optDialog.open) toast(`'${o.name}' 선택을 풀었어요`);
      return false;
    }
    it.choiceId = o.id;
    it.budget = (o.price || 0) * qtyOf(it);
    delete it.priceManual;
    render(); save();
    toast(!o.price ? `'${o.name}' 선택 · 가격이 없어서 0원이에요` : qtyOf(it) > 1 ? `'${o.name}' 선택 · 금액 ${won(it.budget)} (${qtyOf(it)}개)` : `'${o.name}' 선택 · 금액 ${won(it.budget)}`);
    return true;
  }

  function renderOptions(){
    const it = optItem();
    if(!it) return;
    const opts = it.options || [];
    document.getElementById("optTitle").textContent = `${it.name || "이름 없는 항목"} 선택지`;
    document.getElementById("optSub").textContent = opts.length
      ? "하나를 고르면 이 항목의 금액(선택지 가격 × 수량)이 되고, 고른 선택지는 펼쳐져서 바로 고칠 수 있어요."
      : "비교할 제품이나 업체를 추가해 보세요.";
    // 쿠팡 파트너스 고지는 이 항목에 쿠팡 링크가 있을 때만 보여요
    affNote.hidden = !opts.some(o => o.link && isCoupang(o.link));
    const none = !opts.some(o => o.id === it.choiceId);
    const noneRow = `<div class="opt opt-none${none ? " selected" : ""}" data-none="1">
        <button type="button" class="opt-main" aria-pressed="${none}">
          <span class="opt-radio" aria-hidden="true"></span>
          <span class="opt-name">선택 안 함</span>
          <span class="opt-price none">0원</span>
        </button>
      </div>`;
    optList.innerHTML = opts.length ? noneRow + opts.map(o => {
      const sel = o.id === it.choiceId;
      const host = o.link ? hostOf(o.link) : "";
      // 고른 선택지는 펼쳐져서 그 자리에서 이름·가격·링크·비고를 고칩니다 (적는 대로 저장돼요)
      // 고른 것은 머리줄의 이름·가격이 바로 고치는 칸이 되고, 아래 한 줄에 링크·비고가 붙어요
      const head = sel
        ? `<div class="opt-head-edit">
            <span class="opt-radio" aria-hidden="true"></span>
            <input type="text" data-f="name" value="${esc(o.name)}" placeholder="이름 (제품, 업체 등)" aria-label="선택지 이름">
            <input type="text" data-f="price" inputmode="numeric" class="money" value="${plain(o.price)}" placeholder="가격" aria-label="가격">
          </div>`
        : `<button type="button" class="opt-main" aria-pressed="false">
            <span class="opt-radio" aria-hidden="true"></span>
            <span class="opt-name">${esc(o.name)}</span>
            <span class="opt-price${o.price ? "" : " none"}">${o.price ? won(o.price) : "가격 없음"}</span>
            ${o.note ? `<span class="opt-note">${esc(o.note)}</span>` : ""}
            ${host ? `<span class="opt-host">${esc(host)}</span>` : ""}
          </button>`;
      return `<div class="opt${sel ? " selected" : ""}" data-oid="${o.id}">
        <div class="opt-top">
          ${head}
          ${o.link ? `<a class="opt-tool" href="${esc(o.link)}" target="_blank" rel="noopener noreferrer sponsored nofollow" aria-label="'${esc(o.name)}' 링크 열기" title="링크 열기">${ICON_LINK}</a>` : ""}
          <button type="button" class="opt-tool opt-del danger" aria-label="'${esc(o.name)}' 삭제" title="삭제">${ICON_DEL}</button>
        </div>
        ${sel ? `<div class="opt-edit-form">
          <input type="text" data-f="link" inputmode="url" value="${esc(o.link || "")}" placeholder="참고 링크 (선택)" aria-label="참고 링크">
          <input type="text" data-f="note" value="${esc(o.note || "")}" placeholder="비고 (선택) · 예: 대여 포함" aria-label="비고">
        </div>` : ""}
      </div>`;
    }).join("") : `<div class="opt-empty">아직 선택지가 없어요</div>`;
  }

  function resetOptForm(){
    optForm.reset();
  }

  function openOptions(c, it){
    closeMenus();
    optCtx = { cid: c.id, iid: it.id, scrollY: window.scrollY };
    resetOptForm();
    renderOptions();
    optDialog.showModal();
    if(!(it.options || []).length) optForm.elements.name.focus();
  }

  optDialog.addEventListener("click", e => {
    if(e.target === optDialog || e.target.closest("[data-close]")){ optDialog.close(); return; } // backdrop or ×
    const row = e.target.closest(".opt");
    if(!row) return;
    const it = optItem();
    if(row.dataset.none){
      if(e.target.closest(".opt-main")){ clearChoice(it); renderOptions(); }
      return;
    }
    const o = (it.options || []).find(x => x.id === row.dataset.oid);
    if(!o) return;
    if(e.target.closest("a.opt-tool")){ // 참고·제휴 링크를 열었을 때
      let host = ""; try{ host = new URL(o.link).hostname.replace(/^www\./, ""); }catch(err){}
      track("affiliate_click", { item_name: it.name || "", option_name: o.name, link_domain: host });
      return;
    }
    if(e.target.closest(".opt-main")){
      // 고르면 창은 그대로 두고, 고른 것이 펼쳐져요. 이미 고른 것을 누르면 이름 칸으로 갑니다.
      const was = it.choiceId === o.id;
      if(!was) chooseOption(it, o);
      renderOptions();
      const f = optList.querySelector(`.opt[data-oid="${CSS.escape(o.id)}"] [data-f="name"]`);
      if(f){ f.closest(".opt").scrollIntoView({ block: "nearest" }); if(was) f.focus({ preventScroll: true }); }
      if(!was && f && e.detail === 0) f.focus({ preventScroll: true }); // 키보드로 골랐을 때만 (휴대폰에서 자판이 뜨지 않게)
    } else if(e.target.closest(".opt-del")){
      const snap = snapshot();
      it.options = it.options.filter(x => x !== o);
      if(it.choiceId === o.id){ it.choiceId = null; it.budget = 0; delete it.priceManual; }
      render(); save(); renderOptions();
      toast(`'${o.name}' 선택지를 지웠어요`, snap);
    }
  });

  optForm.elements.price.addEventListener("input", e => {
    const t = e.target, v = parseMoney(t.value);
    t.value = plain(v);
  });
  // 확인: 아래 칸에 적다 만 선택지가 있으면 추가하고 창을 닫아요
  document.getElementById("optDone").addEventListener("click", () => {
    if(optForm.elements.name.value.trim() && !addOptionFromForm()) return;
    optDialog.close();
  });

  // 펼친 선택지 고치기: 적는 대로 저장하고, 항목 줄과 머리글도 바로 맞춰요
  function updateOptHead(row, o){
    const nm = row.querySelector(".opt-name"), pr = row.querySelector(".opt-price");
    if(nm) nm.textContent = o.name || "이름 없는 선택지";
    if(pr){ pr.textContent = o.price ? won(o.price) : "가격 없음"; pr.classList.toggle("none", !o.price); }
  }
  optList.addEventListener("input", e => {
    const f = e.target.dataset && e.target.dataset.f;
    if(!f) return;
    const it = optItem(), row = e.target.closest(".opt");
    const o = it && (it.options || []).find(x => x.id === row.dataset.oid);
    if(!o) return;
    if(f === "price"){
      const v = parseMoney(e.target.value);
      e.target.value = plain(v);
      o.price = v;
      // 금액을 직접 고치지 않았다면 고른 선택지 가격을 따라가요
      if(it.choiceId === o.id && !it.priceManual) it.budget = v * qtyOf(it);
    } else if(f === "name"){
      o.name = e.target.value.trim() ? e.target.value : o.name;
    } else if(f === "note"){
      o.note = e.target.value.trim();
    } else if(f === "link"){
      return; // 링크는 다 적고 나서(change) 확인합니다
    }
    updateOptHead(row, o);
    render(); save();
  });
  optList.addEventListener("change", e => {
    if(!e.target.dataset || e.target.dataset.f !== "link") return;
    const it = optItem(), row = e.target.closest(".opt");
    const o = it && (it.options || []).find(x => x.id === row.dataset.oid);
    if(!o) return;
    const raw = e.target.value.trim(), link = safeLink(raw);
    if(raw && !link){ toast("링크는 http나 https 주소만 넣을 수 있어요"); e.target.value = o.link || ""; return; }
    o.link = link;
    save();
    renderOptions();
  });
  // 이름을 비운 채로 나가면 원래 이름으로 돌려 둡니다
  optList.addEventListener("focusout", e => {
    if(!e.target.dataset || e.target.dataset.f !== "name") return;
    const it = optItem(), row = e.target.closest(".opt");
    const o = it && (it.options || []).find(x => x.id === row.dataset.oid);
    if(o && !e.target.value.trim()) e.target.value = o.name;
  });

  // 아래 칸의 새 선택지를 추가합니다. 추가했으면 true.
  function addOptionFromForm(){
    const it = optItem();
    if(!it) return false;
    const name = optForm.elements.name.value.trim();
    if(!name){ optForm.elements.name.focus(); return false; }
    const rawLink = optForm.elements.link.value.trim();
    const link = safeLink(rawLink);
    if(rawLink && !link){ toast("링크는 http나 https 주소만 넣을 수 있어요"); optForm.elements.link.focus(); return false; }
    const price = parseMoney(optForm.elements.price.value);
    const note = optForm.elements.note.value.trim();
    it.options = it.options || [];
    const first = !it.options.length;
    const o = { id: nid(), name, link, price, note };
    it.options.push(o);
    // 첫 선택지는 바로 골라 둡니다. 이미 선택지가 있으면 지금 고른 것(또는 선택 안 함)을 그대로 둬요.
    if(first){ it.choiceId = o.id; it.budget = price * qtyOf(it); delete it.priceManual; }
    render(); save();
    resetOptForm(); renderOptions();
    return true;
  }
  optForm.addEventListener("submit", e => {
    e.preventDefault();
    if(!addOptionFromForm()) return;
    optList.scrollTop = optList.scrollHeight;
    optForm.elements.name.focus();
  });

  optDialog.addEventListener("close", () => {
    const toastEl = document.getElementById("toast");
    if(toastEl.parentNode === optDialog) document.body.appendChild(toastEl);
    // 창을 닫아도 보던 자리 그대로: 초점은 옮기되 화면은 움직이지 않게 합니다
    const pick = optCtx && catsEl.querySelector(`[data-iid="${optCtx.iid}"] .pick`);
    if(pick) pick.focus({ preventScroll: true });
    if(optCtx && optCtx.scrollY != null){
      const y = optCtx.scrollY;
      window.scrollTo(0, y);
      requestAnimationFrame(() => { if(Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y); });
    }
  });

  // ---- toast (with optional undo) ----
  let toastTimer;
  // action: { label, run } — 되돌리기 대신 다른 버튼을 붙일 때
  function toast(msg, undoSnapshot, action){
    const el = document.getElementById("toast");
    const host = optDialog.open ? optDialog : document.body;
    if(el.parentNode !== host) host.appendChild(el);
    el.textContent = msg;
    el.classList.toggle("has-action", !!undoSnapshot || !!action);
    if(action && !undoSnapshot){
      const b = document.createElement("button");
      b.type = "button"; b.textContent = action.label;
      b.addEventListener("click", () => { el.classList.remove("show", "has-action"); action.run(); });
      el.appendChild(b);
    }
    if(undoSnapshot){
      const b = document.createElement("button");
      b.type = "button"; b.textContent = "되돌리기";
      b.addEventListener("click", () => {
        // store 는 store.js 와 함께 쓰는 객체라 통째로 바꾸지 않고 안의 내용을 되돌립니다
        const prev = JSON.parse(undoSnapshot);
        Object.keys(store).forEach(k => { delete store[k]; });
        Object.assign(store, prev);
        syncActive();
        render(); save();
        if(Auth && Auth.enabled && Auth.user) Auth.savePlans(store.plans);
        if(optDialog.open){ if(optItem()) renderOptions(); else optDialog.close(); }
        toast("되돌렸어요");
      });
      el.appendChild(b);
    }
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show", "has-action"), (undoSnapshot || action) ? 6000 : 2600);
  }

  // ---- Excel export ----
  const downloadsPromise = (window.claude && typeof window.claude.use === "function")
    ? window.claude.use("downloads").catch(() => null)
    : Promise.resolve(null);

  // Tab theme colors in the workbook: fill (header, sheet tab), text on fill, soft tint, readable text color
  const ACCENT_XL = {
    orange: { fill: "FFFF5B23", on: "FFFFFFFF", soft: "FFFFE7DD", text: "FFC83A0A" },
    navy:   { fill: "FF3A39FF", on: "FFFFFFFF", soft: "FFE6E6FF", text: "FF3A39FF" },
    green:  { fill: "FF00DF82", on: "FF1B2230", soft: "FFD9F9EB", text: "FF00804A" },
    pink:   { fill: "FFFFB3CF", on: "FF1B2230", soft: "FFFFEAF2", text: "FFC2386B" },
    purple: { fill: "FFCF2C95", on: "FFFFFFFF", soft: "FFFBE3F2", text: "FFB01F7E" },
    teal:   { fill: "FF00B9B9", on: "FF1B2230", soft: "FFD9F5F5", text: "FF007A7A" }
  };
  const accentXL = key => ACCENT_XL[BS.accentKey(key)];

  const moneyFmt = '#,##0"원";[Red]-#,##0"원"';
  const solid = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const edge = (argb, style = "thin") => ({ style, color: { argb } });
  const LINE = "FFDDE2E8", INK = "FF1B2230", MUTED = "FF667085", SOFT_BG = "FFF2F4F6";

  // A cell on another sheet, e.g. '예산표'!C4
  const sheetRef = (sheet, cell) => `'${sheet.replace(/'/g, "''")}'!${cell}`;
  const XL2 = n => String.fromCharCode(64 + n); // column letter by index

  // Plan sheet columns, in the same order as the screen
  // 지출 = 화면의 지출 칸 (체크하면 가격이 저절로 들어가고, 직접 고칠 수도 있어요)
  const XC = { name: 1, memo: 2, pick: 3, qty: 4, budget: 5, spend: 6, done: 7, link: 8 };
  const XHEAD = ["항목", "메모", "선택지", "수량", "금액", "지출", "완료", "링크"];
  const XL = key => String.fromCharCode(64 + XC[key]); // column letter
  const isMoneyCol = n => n === XC.budget || n === XC.spend;

  // One budget → one sheet. Grand total sits in row 4.
  // links (optional): { sheet, ranges: Map(item → { first, last }), itemRows: Map(item → row) }
  // Items with options get a 선택지 dropdown and a 가격 formula (price of the picked option × 수량).
  function addPlanSheet(wb, plan, sheetName, links){
    const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
    const NC = XHEAD.length;
    ws.columns = [{ width: 24 }, { width: 28 }, { width: 22 }, { width: 8 }, { width: 16 }, { width: 16 }, { width: 8 }, { width: 26 }];
    ws.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    const eachCol = (row, fn) => { for(let n = 1; n <= NC; n++) fn(row.getCell(n), n); };
    const theme = accentXL(plan.accent);
    ws.properties.tabColor = { argb: theme.fill };

    const cats = plan.categories.map(c => ({ name: c.name || "카테고리", items: c.items.filter(hasContent) }));
    const itemCount = cats.reduce((s, c) => s + c.items.length, 0);

    // Title + meta
    ws.mergeCells(1, 1, 1, NC);
    ws.getCell("A1").value = planLabel(plan);
    ws.getCell("A1").font = { size: 18, bold: true, color: { argb: INK } };
    ws.getCell("A1").alignment = { vertical: "middle" };
    ws.getRow(1).height = 32;
    ws.mergeCells(2, 1, 2, NC);
    ws.getCell("A2").value = `${new Date().toLocaleDateString("ko-KR")} 기준 · 카테고리 ${cats.length}개 · 항목 ${itemCount}개`;
    ws.getCell("A2").font = { size: 10, color: { argb: MUTED } };
    ws.getRow(2).height = 20;

    // Column header (frozen)
    const head = ws.getRow(3);
    head.values = XHEAD;
    head.height = 24;
    eachCol(head, cell => {
      cell.font = { bold: true, color: { argb: theme.on } };
      cell.fill = solid(theme.fill);
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Category blocks start at row 6 (row 4 = grand total, row 5 = spacer)
    let r = 6;
    const subRows = [];
    cats.forEach((c, ci) => {
      // Every category uses the tab's color; the bands and spacing separate them
      const { fill: strong, soft, on, text } = theme;

      // Colored band with the category name
      const band = ws.getRow(r);
      eachCol(band, cell => { cell.fill = solid(strong); });
      ws.mergeCells(r, 1, r, NC);
      band.getCell(1).value = `${ci + 1}. ${c.name}`;
      band.getCell(1).font = { bold: true, size: 12, color: { argb: on } };
      band.getCell(1).alignment = { vertical: "middle", indent: 1 };
      band.height = 26;
      r++;

      const start = r;
      c.items.forEach(it => {
        const row = ws.getRow(r);
        const chosen = chosenOf(it);
        row.getCell(XC.name).value = it.name;
        if(it.memo) row.getCell(XC.memo).value = it.memo;
        if(chosen) row.getCell(XC.pick).value = chosen.name;
        row.getCell(XC.qty).value = qtyOf(it);
        row.getCell(XC.budget).value = it.budget || 0;
        row.getCell(XC.spend).value = it.actual || 0;
        row.getCell(XC.done).value = it.done ? "✓" : "";
        if(chosen && chosen.link) row.getCell(XC.link).value = { text: hostOf(chosen.link) || chosen.link, hyperlink: chosen.link };
        const range = links && links.ranges.get(it);
        if(range){
          links.itemRows.set(it, r);
          const names = sheetRef(links.sheet, `$${XL2(OPT_C.name)}$${range.first}:$${XL2(OPT_C.name)}$${range.last}`);
          const prices = sheetRef(links.sheet, `$${XL2(OPT_C.price)}$${range.first}:$${XL2(OPT_C.price)}$${range.last}`);
          const P = `${XL("pick")}${r}`, Q = `${XL("qty")}${r}`;
          row.getCell(XC.pick).dataValidation = {
            type: "list", allowBlank: true, formulae: [names],
            showErrorMessage: true, errorStyle: "warning", errorTitle: "선택지", error: "선택지 시트의 이 항목 칸에 있는 이름을 골라 주세요. 새로 적으면 목록에 바로 나타나요."
          };
          // A price that isn't price × 수량 (older files) stays as it is; otherwise it follows the dropdown.
          const followsPick = !chosen || !chosen.price || it.budget === chosen.price * qtyOf(it);
          if(followsPick){
            const keep = it.budget || 0; // used when the dropdown is emptied or the name isn't found
            row.getCell(XC.budget).value = {
              formula: `IF(${P}="",${keep},IFERROR(INDEX(${prices},MATCH(${P},${names},0))*${Q},${keep}))`,
              result: it.budget || 0
            };
          }
        }
        row.height = 20;
        eachCol(row, (cell, n) => {
          cell.border = { bottom: edge(LINE) };
          cell.alignment = { vertical: "middle" };
          if(isMoneyCol(n)) cell.numFmt = moneyFmt;
        });
        row.getCell(XC.name).border = { left: edge(strong, "thick"), bottom: edge(LINE) };
        row.getCell(XC.name).alignment = { vertical: "middle", indent: 1 };
        row.getCell(XC.qty).numFmt = '#,##0"개"';
        row.getCell(XC.qty).alignment = { vertical: "middle", horizontal: "center" };
        row.getCell(XC.done).alignment = { vertical: "middle", horizontal: "center" };
        row.getCell(XC.done).font = { bold: true, color: { argb: text } };
        row.getCell(XC.link).font = { color: { argb: text }, underline: true };
        r++;
      });
      const end = r - 1;

      // Subtotal in the category's tint
      const sub = ws.getRow(r);
      sub.getCell(1).value = `${c.name} 소계`;
      if(end >= start){
        sub.getCell(XC.budget).value = { formula: `SUM(${XL("budget")}${start}:${XL("budget")}${end})` };
        sub.getCell(XC.spend).value = { formula: `SUM(${XL("spend")}${start}:${XL("spend")}${end})` };
      } else {
        sub.getCell(XC.budget).value = 0; sub.getCell(XC.spend).value = 0;
      }
      sub.height = 22;
      eachCol(sub, (cell, n) => {
        cell.fill = solid(soft);
        cell.font = { bold: true, color: { argb: n === 1 ? text : INK } };
        cell.border = { top: edge(strong), bottom: edge(strong) };
        cell.alignment = { vertical: "middle" };
        if(isMoneyCol(n)) cell.numFmt = moneyFmt;
      });
      sub.getCell(1).border = { left: edge(strong, "thick"), top: edge(strong), bottom: edge(strong) };
      sub.getCell(1).alignment = { vertical: "middle", indent: 1 };

      subRows.push({ name: c.name, row: r, strong, soft, text, count: c.items.length });
      r += 2; // blank spacer row between categories
    });

    // Grand total at the top, right under the header, so it stays visible while scrolling
    const total = ws.getRow(4);
    total.getCell(1).value = "전체 합계";
    const sumOf = col => subRows.length ? { formula: subRows.map(s => `${col}${s.row}`).join("+") } : 0;
    total.getCell(XC.budget).value = sumOf(XL("budget"));
    total.getCell(XC.spend).value = sumOf(XL("spend"));
    total.height = 26;
    eachCol(total, (cell, n) => {
      cell.fill = solid(theme.soft);
      cell.font = { bold: true, size: 12, color: { argb: INK } };
      cell.border = { bottom: edge(theme.fill, "medium") };
      cell.alignment = { vertical: "middle", indent: n === 1 ? 1 : 0 };
      if(isMoneyCol(n)) cell.numFmt = moneyFmt;
    });

    return { subRows, itemCount };
  }

  // Summary table: one colored line per entry, amounts live-linked to other sheets
  // rows: [{ name, count, budgetRef, spendRef, strong, soft, text? }]
  const addSummarySheet = (wb, sheetName) => wb.addWorksheet(sheetName, { views: [{ showGridLines: false }] });
  function fillSummarySheet(ss, firstCol, rows, theme){
    if(theme) ss.properties.tabColor = { argb: theme.fill };
    ss.columns = [{ width: 26 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 10 }];
    const sh = ss.getRow(1);
    sh.values = [firstCol, "항목 수", "금액", "지출", "남은 금액", "지출 비율"];
    sh.height = 24;
    sh.eachCell(cell => {
      cell.font = { bold: true, color: { argb: theme ? theme.on : "FFFFFFFF" } };
      cell.fill = solid(theme ? theme.fill : INK);
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    rows.forEach((s, i) => {
      const n = i + 2;
      const row = ss.getRow(n);
      row.getCell(1).value = s.name;
      row.getCell(2).value = s.count;
      row.getCell(3).value = { formula: s.budgetRef };
      row.getCell(4).value = { formula: s.spendRef };
      row.getCell(5).value = { formula: `C${n}-D${n}` };
      row.getCell(6).value = { formula: `IF(C${n}=0,"",D${n}/C${n})` };
      row.height = 22;
      for(let k = 1; k <= 6; k++){
        const cell = row.getCell(k);
        cell.border = { bottom: edge(LINE) };
        cell.alignment = k === 2 || k === 6 ? { vertical: "middle", horizontal: "center" } : { vertical: "middle" };
        if(k >= 3 && k <= 5) cell.numFmt = moneyFmt;
      }
      row.getCell(6).numFmt = "0%";
      row.getCell(1).fill = solid(s.soft);
      row.getCell(1).font = { bold: true, color: { argb: s.text || s.strong } };
      row.getCell(1).border = { left: edge(s.strong, "thick"), bottom: edge(LINE) };
      row.getCell(1).alignment = { vertical: "middle", indent: 1 };
    });
    const sr = rows.length + 2;
    const st = ss.getRow(sr);
    st.getCell(1).value = "합계";
    if(rows.length){
      st.getCell(2).value = { formula: `SUM(B2:B${sr - 1})` };
      st.getCell(3).value = { formula: `SUM(C2:C${sr - 1})` };
      st.getCell(4).value = { formula: `SUM(D2:D${sr - 1})` };
      st.getCell(5).value = { formula: `C${sr}-D${sr}` };
      st.getCell(6).value = { formula: `IF(C${sr}=0,"",D${sr}/C${sr})` };
    }
    st.height = 24;
    for(let k = 1; k <= 6; k++){
      const cell = st.getCell(k);
      cell.font = { bold: true };
      cell.fill = solid(SOFT_BG);
      cell.border = { top: edge(INK, "medium") };
      cell.alignment = k === 2 || k === 6 ? { vertical: "middle", horizontal: "center" } : { vertical: "middle", indent: k === 1 ? 1 : 0 };
      if(k >= 3 && k <= 5) cell.numFmt = moneyFmt;
    }
    st.getCell(6).numFmt = "0%";
  }

  // Guestbook sheet: 이름 · 축의금 only, same band / subtotal / top-total layout as a budget sheet
  function addGuestSheet(wb, plan, sheetName){
    const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
    const NC = 2;
    ws.columns = [{ width: 26 }, { width: 18 }];
    ws.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    const t = accentXL(plan.accent);
    ws.properties.tabColor = { argb: t.fill };
    const eachCol = (row, fn) => { for(let n = 1; n <= NC; n++) fn(row.getCell(n), n); };
    const cats = plan.categories.map(c => ({ name: c.name || "카테고리", items: c.items.filter(i => i.name || i.budget) }));
    const people = cats.reduce((s, c) => s + c.items.length, 0);

    ws.mergeCells(1, 1, 1, NC);
    ws.getCell("A1").value = planLabel(plan);
    ws.getCell("A1").font = { size: 18, bold: true, color: { argb: INK } };
    ws.getCell("A1").alignment = { vertical: "middle" };
    ws.getRow(1).height = 32;
    ws.mergeCells(2, 1, 2, NC);
    ws.getCell("A2").value = `${new Date().toLocaleDateString("ko-KR")} 기준 · ${people}명`;
    ws.getCell("A2").font = { size: 10, color: { argb: MUTED } };

    const head = ws.getRow(3);
    head.values = ["이름", "축의금"];
    head.height = 24;
    eachCol(head, cell => {
      cell.font = { bold: true, color: { argb: t.on } };
      cell.fill = solid(t.fill);
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    let r = 6;
    const subRows = [];
    cats.forEach((c, ci) => {
      const band = ws.getRow(r);
      eachCol(band, cell => { cell.fill = solid(t.fill); });
      ws.mergeCells(r, 1, r, NC);
      band.getCell(1).value = `${ci + 1}. ${c.name}`;
      band.getCell(1).font = { bold: true, size: 12, color: { argb: t.on } };
      band.getCell(1).alignment = { vertical: "middle", indent: 1 };
      band.height = 26;
      r++;
      const start = r;
      c.items.forEach(it => {
        const row = ws.getRow(r);
        row.getCell(1).value = it.name;
        row.getCell(2).value = it.budget || 0;
        row.height = 20;
        eachCol(row, cell => { cell.border = { bottom: edge(LINE) }; cell.alignment = { vertical: "middle" }; });
        row.getCell(1).border = { left: edge(t.fill, "thick"), bottom: edge(LINE) };
        row.getCell(1).alignment = { vertical: "middle", indent: 1 };
        row.getCell(2).numFmt = moneyFmt;
        r++;
      });
      const end = r - 1;
      const sub = ws.getRow(r);
      sub.getCell(1).value = `${c.name} 소계`;
      sub.getCell(2).value = end >= start ? { formula: `SUM(B${start}:B${end})` } : 0;
      sub.height = 22;
      eachCol(sub, (cell, n) => {
        cell.fill = solid(t.soft);
        cell.font = { bold: true, color: { argb: n === 1 ? t.text : INK } };
        cell.border = { top: edge(t.fill), bottom: edge(t.fill) };
        cell.alignment = { vertical: "middle" };
      });
      sub.getCell(1).border = { left: edge(t.fill, "thick"), top: edge(t.fill), bottom: edge(t.fill) };
      sub.getCell(1).alignment = { vertical: "middle", indent: 1 };
      sub.getCell(2).numFmt = moneyFmt;
      subRows.push({ name: c.name, row: r, count: c.items.length, start, end });
      r += 2;
    });

    const total = ws.getRow(4);
    total.getCell(1).value = "전체 합계";
    total.getCell(2).value = subRows.length ? { formula: subRows.map(x => `B${x.row}`).join("+") } : 0;
    total.height = 26;
    eachCol(total, (cell, n) => {
      cell.fill = solid(t.soft);
      cell.font = { bold: true, size: 12, color: { argb: INK } };
      cell.border = { bottom: edge(t.fill, "medium") };
      cell.alignment = { vertical: "middle", indent: n === 1 ? 1 : 0 };
    });
    total.getCell(2).numFmt = moneyFmt;
    return { subRows, people };
  }

  // Guestbook summary: 카테고리 · 인원 · 축의금, linked to the guestbook sheet
  const guestAlign = k => k === 2 ? { vertical: "middle", horizontal: "center" } : { vertical: "middle", indent: k === 1 ? 1 : 0 };
  function fillGuestSummary(ss, sheet, subRows, t){
    ss.properties.tabColor = { argb: t.fill };
    ss.columns = [{ width: 24 }, { width: 10 }, { width: 18 }];
    const head = ss.getRow(1);
    head.values = ["카테고리", "인원", "축의금"];
    head.height = 24;
    head.eachCell(cell => {
      cell.font = { bold: true, color: { argb: t.on } };
      cell.fill = solid(t.fill);
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    subRows.forEach((x, i) => {
      const n = i + 2, row = ss.getRow(n);
      row.getCell(1).value = x.name;
      row.getCell(2).value = x.end >= x.start
        ? { formula: `COUNTA(${sheetRef(sheet, `A${x.start}:A${x.end}`)})`, result: x.count } : 0;
      row.getCell(3).value = { formula: sheetRef(sheet, `B${x.row}`) };
      row.height = 22;
      [1, 2, 3].forEach(k => { row.getCell(k).border = { bottom: edge(LINE) }; row.getCell(k).alignment = guestAlign(k); });
      row.getCell(1).fill = solid(t.soft);
      row.getCell(1).font = { bold: true, color: { argb: t.text } };
      row.getCell(1).border = { left: edge(t.fill, "thick"), bottom: edge(LINE) };
      row.getCell(2).numFmt = '#,##0"명"';
      row.getCell(3).numFmt = moneyFmt;
    });
    const sr = subRows.length + 2, st = ss.getRow(sr);
    st.getCell(1).value = "합계";
    if(subRows.length){
      st.getCell(2).value = { formula: `SUM(B2:B${sr - 1})` };
      st.getCell(3).value = { formula: `SUM(C2:C${sr - 1})` };
    }
    st.height = 24;
    [1, 2, 3].forEach(k => {
      const cell = st.getCell(k);
      cell.font = { bold: true };
      cell.fill = solid(SOFT_BG);
      cell.border = { top: edge(INK, "medium") };
      cell.alignment = guestAlign(k);
    });
    st.getCell(2).numFmt = '#,##0"명"';
    st.getCell(3).numFmt = moneyFmt;
  }

  // 선택지 sheet: every option of every item, chosen or not, so nothing is lost on export.
  // plans: [{ plan, sheet }] — "시트" names the budget sheet the item lives on (used when importing).
  const OPT_HEAD = ["선택", "선택지", "가격", "비고", "링크"];
  // One block per item: a title row, its 선택지, then two empty lines to type into.
  // Row numbers are worked out here because the plan sheet's dropdowns point at them.
  const OPT_SPARE = 2;
  const OPT_C = { mark: 1, name: 2, price: 3, note: 4, link: 5 }; // 선택지 sheet columns
  function layoutOptions(plans){
    const blocks = [], ranges = new Map();
    const multi = plans.length > 1;
    let r = 2; // row 1 is the header
    plans.forEach(({ plan, sheet }) => plan.categories.forEach(c => c.items.forEach(it => {
      if(!hasContent(it)) return;
      const opts = it.options || [];
      const band = r, first = r + 1, last = first + opts.length + OPT_SPARE - 1;
      blocks.push({ sheet, cat: c.name || "카테고리", item: it, opts, t: accentXL(plan.accent), band, first, last, multi });
      ranges.set(it, { band, first, last });
      r = last + 2; // one empty line between blocks
    })));
    return { blocks, ranges };
  }

  function addOptionSheet(wb, sheetName, layout, itemRows, theme){
    const { blocks } = layout;
    if(!blocks.length) return;
    const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
    if(theme) ws.properties.tabColor = { argb: theme.fill };
    ws.columns = [{ width: 7 }, { width: 34 }, { width: 14 }, { width: 30 }, { width: 30 }];
    const NC = OPT_HEAD.length;

    const head = ws.getRow(1);
    head.values = OPT_HEAD;
    head.height = 24;
    for(let n = 1; n <= NC; n++){
      const cell = head.getCell(n);
      cell.font = { bold: true, color: { argb: theme ? theme.on : "FFFFFFFF" } };
      cell.fill = solid(theme ? theme.fill : INK);
      cell.alignment = { vertical: "middle", horizontal: n === OPT_C.mark ? "center" : "left" };
    }

    blocks.forEach(b => {
      // Title row: 카테고리 › 항목 (시트 사이 링크는 구글 시트에서 제대로 안 움직여서 두지 않아요)
      const band = ws.getRow(b.band);
      ws.mergeCells(b.band, 1, b.band, NC);
      band.getCell(1).value = (b.multi ? `${b.sheet} › ` : "") + `${b.cat} › ${b.item.name}`;
      band.getCell(1).font = { bold: true, size: 12, color: { argb: b.t.text } };
      band.getCell(1).alignment = { vertical: "middle", indent: 1 };
      const itemRow = itemRows.get(b.item);
      band.height = 24;
      for(let n = 1; n <= NC; n++){
        band.getCell(n).fill = solid(b.t.soft);
        band.getCell(n).border = { top: edge(b.t.fill), bottom: edge(b.t.fill) };
      }

      // 선택지 lines, then the spare ones — both inside the dropdown's range
      const picked = itemRow ? sheetRef(b.sheet, `${XL("pick")}${itemRow}`) : "";
      for(let i = 0; i < b.opts.length + OPT_SPARE; i++){
        const r = b.first + i, o = b.opts[i] || null;
        const row = ws.getRow(r);
        row.height = 20;
        if(picked) row.getCell(OPT_C.mark).value = { formula: `IF(AND(${picked}<>"",${picked}=${XL2(OPT_C.name)}${r}),"✓","")`, result: o && o.id === b.item.choiceId ? "✓" : "" };
        if(o){
          row.getCell(OPT_C.name).value = o.name;
          row.getCell(OPT_C.price).value = o.price || 0;
          row.getCell(OPT_C.note).value = o.note || "";
          if(o.link) row.getCell(OPT_C.link).value = { text: hostOf(o.link) || o.link, hyperlink: o.link };
        } else if(i === b.opts.length){
          row.getCell(OPT_C.note).value = "↑ 이 줄에 이름과 가격을 적으면 예산표 드롭다운에 바로 나와요";
          row.getCell(OPT_C.note).font = { size: 10, italic: true, color: { argb: MUTED } };
        }
        for(let n = 1; n <= NC; n++){
          const cell = row.getCell(n);
          cell.border = { bottom: edge(LINE) };
          if(!cell.alignment) cell.alignment = { vertical: "middle" };
        }
        row.getCell(OPT_C.mark).alignment = { vertical: "middle", horizontal: "center" };
        row.getCell(OPT_C.mark).font = { bold: true, color: { argb: b.t.text } };
        row.getCell(OPT_C.name).alignment = { vertical: "middle", indent: 1 };
        row.getCell(OPT_C.price).numFmt = moneyFmt;
        if(o && o.link) row.getCell(OPT_C.link).font = { color: { argb: b.t.text }, underline: true };
      }

      // The picked line stays highlighted, wherever it moves to
      ws.addConditionalFormatting({
        ref: `A${b.first}:${XL2(NC)}${b.last}`,
        rules: [{ type: "expression", formulae: [`$${XL2(OPT_C.mark)}${b.first}="✓"`], priority: 1,
                  style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: b.t.soft } }, font: { bold: true } } }]
      });
    });
  }

  // The open file only: 예산표 (or 방명록) + 요약 (+ 선택지)
  async function buildWorkbook(){
    const wb = new ExcelJS.Workbook();
    if(isGuest(state)){
      const sheet = "방명록";
      const { subRows } = addGuestSheet(wb, state, sheet);
      fillGuestSummary(addSummarySheet(wb, "요약"), sheet, subRows, accentXL(state.accent));
    } else {
      const sheet = "예산표";
      const layout = layoutOptions([{ plan: state, sheet }]);
      const links = { sheet: "선택지", ranges: layout.ranges, itemRows: new Map() };
      const { subRows } = addPlanSheet(wb, state, sheet, links);
      fillSummarySheet(addSummarySheet(wb, "요약"), "카테고리", subRows.map(s => ({
        name: s.name, count: s.count, strong: s.strong, soft: s.soft, text: s.text,
        budgetRef: sheetRef(sheet, `${XL("budget")}${s.row}`), spendRef: sheetRef(sheet, `${XL("spend")}${s.row}`)
      })), accentXL(state.accent));
      addOptionSheet(wb, "선택지", layout, links.itemRows, accentXL(state.accent));
    }
    return wb;
  }

  const fileSafe = s => String(s).replace(/[\\/:*?"<>|]/g, "").trim();
  const exportBtn = document.getElementById("exportBtn");
  let exporting = false;

  // 늘 지금 열어 둔 파일만 내보냅니다
  exportBtn.addEventListener("click", () => { if(!exporting) runExport(); });

  async function runExport(){
    track("excel_export", { scope: "current", tabs: store.plans.length });
    try{ await loadExcel(); }catch(e){ toast("엑셀 도구를 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요."); return; }
    exporting = true;
    exportBtn.setAttribute("aria-disabled", "true");
    try{
      const wb = await buildWorkbook();
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const filename = (fileSafe(planLabel(state)) || "예산표") + ".xlsx";

      const downloads = window.claude ? await downloadsPromise : null;
      if(downloads){
        try{
          await downloads.save({ filename, data: blob });
          toast("엑셀 파일을 저장했어요. 구글 드라이브에 올리면 시트로 열려요.");
        }catch(err){
          if(err && err.code === "declined") return;
          if(err && err.code === "rate_limited"){ toast("저장 창이 이미 열려 있어요."); return; }
          toast("이 화면에서는 파일을 저장할 수 없어요.");
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast("엑셀 파일을 내려받았어요. 구글 드라이브에 올리면 시트로 열려요.");
      }
    }catch(err){
      toast("엑셀 파일을 만들지 못했어요. 다시 시도해 주세요.");
    }finally{
      exporting = false;
      exportBtn.removeAttribute("aria-disabled");
    }
  }

  // ---- Excel import: files exported here, also after editing in Google Sheets ----
  function cellText(v){
    if(v == null) return "";
    if(typeof v === "object"){
      if(v.richText) return v.richText.map(t => t.text).join("").trim();
      if("result" in v) return cellText(v.result);
      if(v.text != null) return String(v.text).trim();
      return "";
    }
    return String(v).trim();
  }
  function cellMoney(v){
    if(v && typeof v === "object" && "result" in v) v = v.result;
    if(typeof v === "number") return Math.max(0, Math.round(v));
    return parseMoney(cellText(v));
  }
  const cellDone = v => v === true || ["✓", "✔", "v", "o", "true", "y", "yes", "완료"].includes(cellText(v).toLowerCase());
  const isSumFormula = v => !!(v && typeof v === "object" && /^\s*SUM\(/i.test(v.formula || v.sharedFormula || ""));

  // Columns are found by header name, so every export version (with or without 선택지/수량) reads the same way.
  // "old" = first version, where 카테고리 had its own column instead of band rows.
  const HEAD_KEYS = { "이름": "name", "축의금": "budget", "카테고리": "cat", "항목": "name", "메모": "memo", "선택지": "pick", "수량": "qty", "예산": "budget", "가격": "budget", "금액": "budget", "실제 지출": "actual", "지출": "actual", "완료": "done", "링크": "link" };

  function parsePlanSheet(ws){
    for(let h = 1; h <= 10; h++){
      const row = ws.getRow(h);
      const col = {};
      for(let n = 1; n <= Math.max(row.cellCount, 12); n++){
        const key = HEAD_KEYS[cellText(row.getCell(n).value)];
        if(key && !col[key]) col[key] = n;
      }
      const guestHead = cellText(row.getCell(1).value) === "이름" && cellText(row.getCell(2).value) === "축의금";
      if(guestHead) return Object.assign(readRows(ws, h, "now", { name: 1, budget: 2 }), { kind: "guestbook" });
      if(!(col.name && col.budget && (col.actual || col.spend || col.done))) continue;
      if(col.cat === 1 && col.name === 2) return readRows(ws, h, "old", col);
      if(col.name === 1) return readRows(ws, h, "now", col);
    }
    return null; // summary sheets and anything else
  }

  // colors used by earlier exports (older palettes; keys go through BS.accentKey)
  const OLD_FILLS = [
    { yellow: "A01937", green: "225266", lime: "B7E255", purple: "831EFE", orange: "FB3F33", navy: "2254D7" },
    { green: "0ACE82", navy: "3E5CEA", lime: "79DD3D", yellow: "FFD133", purple: "A259FF", orange: "F3512A" },
    { green: "2E6F6B", navy: "3A5A94", pink: "B83D6E", yellow: "F2C230", purple: "6B4FA0", orange: "C2571A" },
    { green: "26A392", navy: "4176E0", pink: "E0508A", yellow: "FFC933", purple: "8E63E6", orange: "E2661C" }
  ];
  function accentFromSheet(ws, headRow){
    const rgb = a => a ? String(a).slice(-6).toUpperCase() : "";
    const candidates = [ws.properties && ws.properties.tabColor && ws.properties.tabColor.argb,
                        (ws.getRow(headRow).getCell(1).fill || {}).fgColor && ws.getRow(headRow).getCell(1).fill.fgColor.argb].map(rgb);
    for(const c of candidates){
      const key = c && (Object.keys(ACCENT_XL).find(k => rgb(ACCENT_XL[k].fill) === c) || OLD_FILLS.map(f => Object.keys(f).find(k => f[k] === c)).find(Boolean));
      if(key) return BS.accentKey(key);
    }
    return undefined;
  }

  function readRows(ws, headRow, format, col){
    const categories = [];
    let cur = null;
    const openCat = name => { cur = { id: nid(), name, items: [] }; categories.push(cur); };

    for(let r = headRow + 1; r <= ws.rowCount; r++){
      const row = ws.getRow(r);
      const v = n => n ? row.getCell(n).value : null;
      const name = cellText(v(col.name));
      const budget = cellMoney(v(col.budget)), actual = col.actual ? cellMoney(v(col.actual)) : 0;

      if(format === "now"){
        if(name === "전체 합계") continue;
        // Category band: merged across the row, or "N. 이름" with no amounts
        const blankAmounts = !cellText(v(col.budget)) && !cellText(v(col.actual));
        if(name && (row.getCell(1).isMerged || (blankAmounts && /^\d+\.\s/.test(name)))){
          openCat(name.replace(/^\d+\.\s*/, ""));
          continue;
        }
        if(cur && (name === `${cur.name} 소계` || isSumFormula(v(col.budget)))) continue;
      } else {
        const cat = cellText(v(col.cat));
        if(name === "소계" || name === "전체 합계"){ cur = null; continue; }
        if(cat && (!cur || cat !== cur.name)) openCat(cat);
      }

      const memo = col.memo ? cellText(v(col.memo)) : "";
      if(!name && !memo && !budget && !actual) continue;
      if(!cur) openCat("기타");
      const item = { id: nid(), name, budget, done: col.done ? cellDone(v(col.done)) : false };
      if(memo) item.memo = memo;
      if(actual) item.actual = actual; // 불러온 지출은 직접 적은 값으로 둡니다
      const qty = col.qty ? parseInt(cellText(v(col.qty)).replace(/[^\d]/g, ""), 10) : 0;
      if(qty > 1) item.qty = Math.min(qty, 9999);
      const pickName = col.pick ? cellText(v(col.pick)) : "";
      if(pickName){
        const lv = col.link ? v(col.link) : null;
        const opt = { id: nid(), name: pickName, link: col.link ? safeLink((lv && lv.hyperlink) || cellText(lv)) : "", price: Math.round(budget / (item.qty || 1)) };
        item.options = [opt];
        item.choiceId = opt.id;
      }
      cur.items.push(item);
    }
    categories.forEach(c => { if(!c.items.length) c.items.push(newItem()); });
    // Title sits in A1 above the header; if the header was moved to the top, fall back to the sheet name
    const title = headRow > 1 ? cellText(ws.getCell("A1").value) : "";
    return { title: title || ws.name, categories, accent: accentFromSheet(ws, headRow), sheet: ws.name };
  }

  // Reads a 선택지 sheet: a title row per item ("카테고리 › 항목", or "시트 › 카테고리 › 항목"
  // when several tabs were exported), then that item's lines underneath.
  function attachOptionSheet(ws, plans){
    const head = ws.getRow(1);
    if(cellText(head.getCell(OPT_C.name).value) !== "선택지") return;

    const lists = new Map();   // item object → [{ option, chosen }]
    const seen = new Map();    // "sheet|cat|item" → how many blocks with that title so far
    let item = null;

    for(let r = 2; r <= ws.rowCount; r++){
      const row = ws.getRow(r);
      const title = cellText(row.getCell(1).value);
      const name = cellText(row.getCell(OPT_C.name).value);

      if(title.includes("›")){ // title row
        const parts = title.split("›").map(t => t.trim());
        const itemName = parts.pop(), catName = parts.pop() || "", sheet = parts.pop() || "";
        const key = `${sheet}|${catName}|${itemName}`;
        seen.set(key, (seen.get(key) || 0) + 1);
        const plan = (sheet && plans.find(p => p.sheet === sheet)) || (plans.length === 1 ? plans[0] : null);
        const matches = [];
        if(plan) plan.categories.forEach(c => { if(!catName || c.name === catName) c.items.forEach(it => { if(it.name === itemName) matches.push(it); }); });
        item = matches[seen.get(key) - 1] || matches[0] || null;
        if(item && !lists.has(item)) lists.set(item, []);
        continue;
      }
      if(!item || !name) continue; // spare lines and the gap between blocks

      const lv = row.getCell(OPT_C.link).value;
      lists.get(item).push({
        option: { id: nid(), name, price: cellMoney(row.getCell(OPT_C.price).value),
                  note: cellText(row.getCell(OPT_C.note).value),
                  link: safeLink((lv && lv.hyperlink) || cellText(lv)) },
        chosen: cellDone(row.getCell(OPT_C.mark).value)
      });
    }

    lists.forEach((list, it) => {
      const prevChosen = chosenOf(it); // from the 예산표 sheet's 선택지 column
      it.options = list.map(x => x.option);
      const pick = list.find(x => x.chosen) || (prevChosen && list.find(x => x.option.name === prevChosen.name));
      it.choiceId = pick ? pick.option.id : null;
    });
  }

  const importInput = document.getElementById("importFile");
  document.getElementById("importBtn").addEventListener("click", () => { closeMenus(); importInput.click(); });
  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    importInput.value = "";
    if(!file) return;
    try{ await loadExcel(); }catch(e){ toast("엑셀 도구를 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요."); return; }

    let found;
    try{
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      found = wb.worksheets.map(parsePlanSheet).filter(Boolean);
      wb.worksheets.forEach(ws => attachOptionSheet(ws, found));
      found.forEach(p => { delete p.sheet; });
    }catch(err){
      toast("파일을 읽지 못했어요. 엑셀(.xlsx) 파일인지 확인해 주세요.");
      return;
    }
    if(!found.length){ toast("이 사이트에서 내보낸 형식의 예산표 시트를 찾지 못했어요."); return; }

    // 새 파일을 만들지 않고 지금 파일의 내용을 바꿉니다. 색·날짜·책상 위 자리·함께 쓰기는 그대로 둡니다.
    // 예전의 '모든 파일' 엑셀처럼 시트가 여럿이면 첫 번째 것만 씁니다.
    const snap = snapshot();
    const [p] = found;
    const next = Object.assign({}, state, { title: p.title || state.title, categories: p.categories });
    if(p.kind) next.kind = p.kind; else delete next.kind;
    replaceActive(next);
    render(); save();
    track("excel_import", { sheets: found.length, kind: p.kind || "budget" });
    toast(found.length > 1
      ? `예산표 시트 ${found.length}개 중 첫 번째('${planLabel(state)}')로 바꿨어요`
      : `엑셀 내용으로 바꿨어요 · ${planLabel(state)}`, snap);
  });

  // ---- 초대 링크(?join=)는 주소가 ?id= 로 바뀌기 전에 받아 둡니다 ----
  // 로그인하러 구글에 다녀와도 같은 탭이면 sessionStorage 에 남아 있어요.
  const JOIN_KEY = "prep-budget-join";
  try{
    const t = new URLSearchParams(location.search).get("join");
    if(t) sessionStorage.setItem(JOIN_KEY, t);
  }catch(e){}

  // ---- ?tpl=wedding 처럼 주소로 템플릿 열기 (소개 페이지에서 넘어올 때) ----
  (function openFromUrl(){
    let key = "", id = "";
    try{
      const q = new URLSearchParams(location.search);
      key = q.get("tpl") || "";
      id = q.get("id") || "";
    }catch(e){}
    // ?id= : 책상에서 그 파일을 눌러 들어온 경우
    if(id && store.plans.some(p => p.id === id)){
      store.activeId = id;
      syncActive();
      save();
      return;
    }
    if(key && BS.templates.some(t => t.id === key)){
      const plan = newPlan(fromTemplate(key));
      // 아무도 손대지 않은 빈 파일이면 새로 만들지 않고 그 자리에 채웁니다
      const pristine = store.plans.length === 1
        && !store.plans[0].categories.some(c => c.items.some(hasContent))
        && store.plans[0].categories.every(c => !c.name || c.name === "첫 번째 카테고리");
      if(pristine) store.plans = [];
      store.plans.push(plan);
      store.activeId = plan.id;
      syncActive();
      save();
      track("template_load", { template: key, source: "link" });
    }
    // 주소에는 늘 지금 파일의 id 만 남깁니다.
    // 새로고침해도 같은 파일이 열리고, ?tpl= 이 남아 템플릿이 또 들어오지도 않아요.
    markUrl();
  })();

  render();

  // ---- 같이 쓰기 (초대 링크) ----
  const shareBtn = document.getElementById("shareBtn");

  function showShare(){ if(shareBtn) shareBtn.hidden = !(Auth && Auth.enabled && Auth.user); }

  if(shareBtn) shareBtn.addEventListener("click", async () => {
    if(!(Auth && Auth.user)){ toast("먼저 로그인해 주세요"); return; }
    if(state.owner && state.owner !== Auth.user.id){
      toast("공유받은 예산표는 만든 사람만 초대할 수 있어요");
      return;
    }
    shareBtn.disabled = true;
    toast("초대 링크를 만드는 중…");
    try{
      const saved = await Auth.savePlans(store.plans); // 계정에 아직 없을 수 있으니 먼저 저장
      if(saved && saved.error) throw new Error("저장 단계: " + saved.error);
      const res = await Auth.createInvite(state.id);
      if(!res || res.error) throw new Error("초대 단계: " + ((res && res.error) || "알 수 없는 오류"));
      state.shared = true; save(); ensureWatch();
      showShareLink(`${location.origin}${location.pathname}?join=${res.token}`);
    }catch(err){
      showShareLink(null, err && err.message ? err.message : String(err));
    }finally{
      shareBtn.disabled = false;
    }
  });

  // 링크를 창으로 보여 줍니다 (복사 버튼은 창 안에서 눌러야 브라우저가 허용해요)
  function showShareLink(link, errorMessage){
    let dlg = document.getElementById("shareDialog");
    if(!dlg){
      dlg = document.createElement("dialog");
      dlg.id = "shareDialog";
      dlg.className = "share-dialog";
      dlg.innerHTML = `<div class="share-inner">
        <h2>같이 쓰기</h2>
        <p>이 링크를 받은 사람이 로그인하면 이 예산표를 함께 고칠 수 있어요. 링크는 14일 뒤에 만료돼요.</p>
        <input id="shareLink" type="text" readonly>
        <div class="share-actions">
          <button type="button" class="btn-primary" data-copy>링크 복사</button>
          <button type="button" class="btn-ghost" data-close>닫기</button>
        </div>
      </div>`;
      document.body.appendChild(dlg);
      dlg.addEventListener("click", async e => {
        if(e.target === dlg || e.target.closest("[data-close]")){ dlg.close(); return; }
        if(e.target.closest("[data-copy]")){
          const input = dlg.querySelector("#shareLink");
          input.select();
          try{ await navigator.clipboard.writeText(input.value); }catch(err){ document.execCommand("copy"); }
          e.target.textContent = "복사했어요";
          setTimeout(() => { e.target.textContent = "링크 복사"; }, 1500);
        }
      });
    }
    const input = dlg.querySelector("#shareLink"), copyBtn = dlg.querySelector("[data-copy]");
    dlg.querySelector("h2").textContent = errorMessage ? "링크를 만들지 못했어요" : "같이 쓰기";
    dlg.querySelector("p").textContent = errorMessage
      ? "아래 내용을 알려 주시면 원인을 찾을 수 있어요."
      : "이 링크를 받은 사람이 로그인하면 이 예산표를 함께 고칠 수 있어요. 링크는 14일 뒤에 만료돼요.";
    input.value = errorMessage || link;
    copyBtn.hidden = !!errorMessage;
    dlg.showModal();
    input.select();
  }

  // 초대 링크로 들어왔을 때
  async function handleJoin(){
    let token = "";
    try{ token = sessionStorage.getItem(JOIN_KEY) || ""; }catch(e){}
    if(!token) return;
    if(!(Auth && Auth.enabled)) return;
    if(!Auth.user){
      const login = window.BudgetShell && window.BudgetShell.openLogin;
      const invite = { title: "초대받은 예산표가 있어요", text: "로그인하면 함께 쓰자고 보낸 예산표가 바로 열려요. 같이 고치려면 계정이 있어야 해요." };
      // 로그인 창은 초대마다 한 번만 저절로 열어요. 닫은 뒤로는 아래 알림의 버튼으로 열 수 있어요.
      let asked = false;
      try{ asked = sessionStorage.getItem(JOIN_KEY + "-asked") === token; sessionStorage.setItem(JOIN_KEY + "-asked", token); }catch(e){}
      if(login && !asked) login(invite);
      toast("초대받은 예산표를 보려면 먼저 로그인해 주세요", null, login ? { label: "로그인", run: () => login(invite) } : undefined);
      return; // 로그인하면 아래 onChange에서 다시 처리합니다
    }
    try{ sessionStorage.removeItem(JOIN_KEY); }catch(e){}
    // 초대를 받으러 오면서 저절로 생긴 빈 파일은 초대받은 예산표로 바꿉니다
    const blank = store.plans.length === 1 && !BS.isTouched(store.plans[0]) ? store.plans[0] : null;
    const res = await Auth.acceptInvite(token);
    if(!res || res.error){ toast("초대가 만료됐거나 잘못된 링크예요"); return; }
    await mergeWithAccount();
    const joined = store.plans.find(p => p.id === res.planId);
    if(!joined){ toast("초대받은 예산표를 불러오지 못했어요. 새로고침해 주세요"); return; }
    if(blank && blank.id !== joined.id){
      store.plans = store.plans.filter(p => p !== blank);
      if(Auth.removePlans) Auth.removePlans([blank.id]);
    }
    store.activeId = joined.id; syncActive(); render(); save(); markUrl();
    toast("예산표를 함께 쓰게 됐어요");
  }


  // ---- 상대가 고쳤을 때 ----
  let lastTyped = 0;
  document.addEventListener("input", () => { lastTyped = Date.now(); }, true);

  async function pullRemote(){
    const mine = await Auth.listPlans();
    if(!mine) return;
    const activeId = store.activeId;
    store.plans = mine;
    if(!store.plans.some(p => p.id === activeId)) store.activeId = store.plans[0] && store.plans[0].id;
    syncActive();
    render();
    BS.saveLocalNow();
  }

  function onRemote(payload){
    const row = payload.new || payload.old;
    if(!row) return;
    const mine = store.plans.find(p => p.id === row.id);
    const editing = Date.now() - lastTyped < 8000;
    // 내가 방금 저장한 것과 같은 내용이면 무시
    if(payload.eventType !== "DELETE" && mine && JSON.stringify(row.data) === JSON.stringify(mine)) return;
    if(editing){
      toast("같이 쓰는 사람이 이 예산표를 고쳤어요", null, { label: "불러오기", run: pullRemote });
    } else {
      pullRemote();
    }
  }

  // 공유받은 것(주인이 따로 있음)이거나 내가 초대 링크를 만든 것
  function isShared(p){
    const A = window.BudgetAuth, me = A && A.user && A.user.id;
    return !!(p && me && ((p.owner && p.owner !== me) || p.shared || sharedIds.has(p.id)));
  }

  // 지금 연 파일에 맞춰 실시간 연결을 켜고 끕니다. 파일을 바꿀 때마다 불러요.
  async function ensureWatch(){
    const A = window.BudgetAuth;
    const want = A && A.enabled && BS.signedInBoard && isShared(state) ? state.id : null;
    if(want === watching) return;
    if(stopWatch){ stopWatch(); stopWatch = null; }
    watching = want;
    if(!want) return;
    const stop = await A.watchPlans(onRemote, want);
    if(watching !== want){ stop(); return; }   // 연결하는 사이 다른 파일로 옮겨 갔으면
    stopWatch = stop;
  }

  if(Auth && Auth.enabled){
    Auth.onChange(async user => {
      showShare();
      if(user){
        await mergeWithAccount(); handleJoin();
        Auth.sharedPlanIds().then(ids => { sharedIds = new Set(ids); ensureWatch(); });
      }
      else leaveAccount();
    });
    Auth.init().then(() => { showShare(); handleJoin(); });
  }
})();
