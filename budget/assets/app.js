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
  function syncActive(){
    // 휴지통에 든 파일은 건너뜁니다
    state = BS.live.find(p => p.id === store.activeId) || BS.live[0] || store.plans[0];
    store.activeId = state.id;
  }
  syncActive();
  function replaceActive(data){
    const plan = newPlan(Object.assign(data, { id: state.id, accent: state.accent }));
    store.plans[store.plans.indexOf(state)] = plan;
    state = plan;
  }

  const Auth = window.BudgetAuth;
  const save = () => BS.save(state);
  const saveToAccount = () => BS.saveToAccount();

  // 로그인 직후: 계정의 파일과 이 브라우저의 것을 합칩니다
  async function mergeWithAccount(){
    if(!await BS.mergeWithAccount()) return;
    syncActive();
    render();
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
  const titleEl = document.getElementById("planTitle");
  const introEl = document.getElementById("planIntro");
  // The description box grows with its text instead of scrolling
  function fitIntro(){
    introEl.style.height = "auto";
    // scrollHeight excludes the borders, so add whatever they take up
    introEl.style.height = introEl.scrollHeight + (introEl.offsetHeight - introEl.clientHeight) + "px";
  }

  function catSums(c){
    let b = 0, a = 0;
    c.items.forEach(i => { b += i.budget || 0; a += i.actual || 0; });
    return { b, a };
  }

  const isGuest = p => p && p.kind === "guestbook";
  const guestCount = c => c.items.filter(i => i.name || i.budget).length;

  function catSumHTML(c){
    const { b, a } = catSums(c);
    if(isGuest(state)) return `축의금 <b>${won(b)}</b>&nbsp;&nbsp;<b>${guestCount(c)}</b>명`;
    if(!showActual) return `예산 <b>${won(b)}</b>`;
    return `예산 <b>${won(b)}</b>&nbsp;&nbsp;지출 <b class="${a > b && b > 0 ? "over" : ""}">${won(a)}</b>`;
  }

  const chosenOf = it => (it.options || []).find(o => o.id === it.choiceId);
  const qtyOf = it => Math.max(1, parseInt(it.qty, 10) || 1);
  // 예산 is the item total; one unit = the chosen option's price, else 예산 ÷ 수량
  const unitOf = it => { const o = chosenOf(it); return o && o.price ? o.price : (it.budget || 0) / qtyOf(it); };
  const unitTitle = it => qtyOf(it) > 1 && it.budget ? ` title="개당 ${won(Math.round(unitOf(it)))}"` : "";
  function pickHTML(it){
    const n = (it.options || []).length, chosen = chosenOf(it);
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
    const over = it.budget > 0 && it.actual > it.budget;
    return `<div class="row${it.done ? " done" : ""}" data-iid="${it.id}">
      <button type="button" class="item-grip" aria-label="순서 바꾸기 (드래그하거나 방향키)" title="드래그해서 순서 바꾸기"><svg viewBox="0 0 8 14" aria-hidden="true"><circle cx="2" cy="2" r="1.3" fill="currentColor"/><circle cx="6" cy="2" r="1.3" fill="currentColor"/><circle cx="2" cy="7" r="1.3" fill="currentColor"/><circle cx="6" cy="7" r="1.3" fill="currentColor"/><circle cx="2" cy="12" r="1.3" fill="currentColor"/><circle cx="6" cy="12" r="1.3" fill="currentColor"/></svg></button>
      <label class="check"><input type="checkbox" class="done-box" ${it.done ? "checked" : ""} aria-label="완료 표시"></label>
      <input type="text" class="name" value="${esc(it.name)}" placeholder="항목 이름" aria-label="항목 이름">
      ${pickHTML(it)}
      <label class="qty"><input type="text" class="qty-in" inputmode="numeric" value="${qtyOf(it)}" aria-label="수량"><span aria-hidden="true">개</span></label>
      <input type="text" class="money budget" inputmode="numeric" value="${plain(it.budget)}" aria-label="예산"${unitTitle(it)}>
      <input type="text" class="money actual${over ? " over" : ""}" inputmode="numeric" value="${plain(it.actual)}" aria-label="실제 지출">
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
    window.BudgetShell.openDday(state, () => { renderDday(); renderFileBar(); });
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
      + `<button type="button" data-open="__desk">내 책상으로</button>`;
  }

  const swatchEls = document.querySelectorAll(".swatch");
  const colorNameEl = document.getElementById("colorName");
  function applyAccent(){
    const key = state.accent || "green";
    document.body.dataset.accent = key;
    swatchEls.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.accent === key)));
    const on = [...swatchEls].find(b => b.dataset.accent === key);
    if(on) colorNameEl.textContent = on.textContent.trim();
  }
  swatchEls.forEach(b => b.addEventListener("click", () => {
    closeMenus();
    state.accent = b.dataset.accent;
    applyAccent();
    fileSwitch.dataset.accent = state.accent;
    save();
  }));

  function foldLabel(c){
    const n = c.items.filter(i => i.name || i.budget || i.actual).length;
    return c.collapsed ? `항목 펼치기 (${n}${isGuest(state) ? "명" : "개"})` : "항목 접기";
  }
  // Icon only; the label (with the hidden item count) goes to the tooltip and screen readers
  const foldBtnHTML = c => `<button type="button" class="fold-btn" aria-expanded="${!c.collapsed}" aria-label="${foldLabel(c)}" title="${foldLabel(c)}"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 5.5L7 9l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;

  function render(){
    const guest = isGuest(state);
    document.body.classList.toggle("kind-guestbook", guest);
    applyAccent();
    renderFileBar();
    renderDday();
    titleEl.value = state.title || "";
    introEl.value = state.intro || "";
    fitIntro();
    if(!state.categories.length){
      catsEl.innerHTML = `<div class="empty">카테고리가 없어요. 아래에서 카테고리를 추가하거나 위의 템플릿을 불러오세요.</div>`;
    } else {
      catsEl.innerHTML = state.categories.map(c => `
        <section class="cat${c.collapsed ? " collapsed" : ""}" data-cid="${c.id}">
          <div class="cat-head">
            <button type="button" class="cat-grip" aria-label="'${esc(catLabel(c))}' 순서 바꾸기 (드래그하거나 방향키)" title="드래그해서 순서 바꾸기"><svg viewBox="0 0 8 16" aria-hidden="true"><circle cx="2" cy="2.5" r="1.3" fill="currentColor"/><circle cx="6" cy="2.5" r="1.3" fill="currentColor"/><circle cx="2" cy="8" r="1.3" fill="currentColor"/><circle cx="6" cy="8" r="1.3" fill="currentColor"/><circle cx="2" cy="13.5" r="1.3" fill="currentColor"/><circle cx="6" cy="13.5" r="1.3" fill="currentColor"/></svg></button>
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
            : `<div class="cols" aria-hidden="true"><span></span><span></span><span>항목</span><span>선택지</span><span class="r">수량</span><span class="r">예산</span><span class="r">실제 지출</span><span></span></div>
          <div class="rows">${c.items.map(rowHTML).join("")}</div>
          <button type="button" class="add-item">+ 항목 추가</button>`}
        </section>`).join("");
    }
    updateTotals();
    catNav.hidden = state.categories.length < 2;
  }

  // ---- 카테고리로 건너뛰기 ----
  // 목록은 열 때마다 새로 그립니다. 이름을 고치거나 순서를 바꿔도 따로 챙길 게 없어요.
  const catNav = document.getElementById("catNav");
  const catNavList = document.getElementById("catNavList");
  const totalsEl = document.querySelector(".totals");
  // 합계 바 높이는 화면 폭에 따라 달라서, 그 위에 뜨도록 재어서 넘깁니다
  if(totalsEl && window.ResizeObserver){
    new ResizeObserver(() => document.body.style.setProperty("--totals-h", totalsEl.offsetHeight + "px")).observe(totalsEl);
  }
  // 화면 위쪽 1/3 선에 걸쳐 있는 카테고리를 '지금 보는 곳'으로 칩니다
  function currentCatId(){
    const line = window.innerHeight / 3;
    const cards = [...catsEl.querySelectorAll(".cat")];
    const hit = cards.find(el => el.getBoundingClientRect().bottom > line);
    return hit ? hit.dataset.cid : null;
  }
  function renderCatNav(){
    const here = currentCatId();
    const guest = isGuest(state);
    catNavList.innerHTML = state.categories.map(c => {
      const n = c.items.filter(i => i.name || i.budget || i.actual).length;
      return `<button type="button" data-go="${esc(c.id)}"${c.id === here ? ` aria-current="true"` : ""}>
        <span class="cat-nav-name">${esc(catLabel(c))}</span>
        <span class="cat-nav-meta">${n}${guest ? "명" : "개"}</span>
      </button>`;
    }).join("");
  }
  catNav.addEventListener("toggle", () => { if(catNav.open) renderCatNav(); });
  catNavList.addEventListener("click", e => {
    const btn = e.target.closest("[data-go]");
    if(!btn) return;
    const el = catsEl.querySelector(`.cat[data-cid="${CSS.escape(btn.dataset.go)}"]`);
    catNav.open = false;
    if(!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 16, behavior: still ? "auto" : "smooth" });
    // 어디에 내렸는지 잠깐 테두리로 알려 줍니다
    el.classList.remove("cat-flash");
    void el.offsetWidth;
    el.classList.add("cat-flash");
    setTimeout(() => el.classList.remove("cat-flash"), 1400);
    track("category_jump", { count: state.categories.length });
  });

  function updateTotals(){
    let b = 0, a = 0, done = 0, count = 0;
    state.categories.forEach(c => c.items.forEach(i => {
      b += i.budget || 0; a += i.actual || 0;
      if(i.name || i.budget || i.actual){ count++; if(i.done) done++; }
    }));
    const guest = isGuest(state);
    document.getElementById("tBudgetLabel").textContent = guest ? "축의금 합계" : "예산 합계";
    document.getElementById("tDoneLabel").textContent = guest ? "인원" : "완료";
    document.getElementById("tBudget").textContent = won(b);
    document.getElementById("tBudgetMan").textContent = manwon(b);
    document.getElementById("tActual").textContent = won(a);
    const diff = b - a;
    const diffEl = document.getElementById("tDiff");
    document.getElementById("tDiffLabel").textContent = diff < 0 ? "예산 초과" : "남은 예산";
    diffEl.textContent = won(Math.abs(diff));
    diffEl.classList.toggle("over", diff < 0);
    document.getElementById("tDone").textContent = guest ? `${count}명` : `${done} / ${count}`;
  }

  const findCat = el => state.categories.find(c => c.id === el.closest(".cat").dataset.cid);
  const findItem = (el, c) => c.items.find(i => i.id === el.closest(".row").dataset.iid);

  // ---- events ----
  titleEl.addEventListener("input", () => {
    state.title = titleEl.value;
    fileNameEl.textContent = planLabel(state);
    save();
  });
  introEl.addEventListener("input", () => {
    state.intro = introEl.value;
    fitIntro();
    save();
  });
  window.addEventListener("resize", fitIntro);
  // The webfont lands after the first render and rewraps the text, so measure again
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(fitIntro);

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
      if(t.classList.contains("budget")) it.budget = v; else it.actual = v;
      const actualEl = t.closest(".row").querySelector(".actual");
      if(actualEl) actualEl.classList.toggle("over", it.budget > 0 && it.actual > it.budget);
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
      rowEl.querySelector(".actual").classList.toggle("over", it.budget > 0 && it.actual > it.budget);
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
    if(!t.classList.contains("done-box")) return;
    const c = findCat(t), it = findItem(t, c);
    it.done = t.checked;
    t.closest(".row").classList.toggle("done", it.done);
    updateTotals(); save();
  });

  const newItem = () => ({ id: nid(), name: "", budget: 0, actual: 0, done: false });
  const hasContent = i => i.name || i.budget || i.actual || (i.options && i.options.length);
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
      c.items.forEach(i => { i.budget = 0; i.actual = 0; i.done = false; i.choiceId = null; });
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
    if(e.target.classList.contains("name") || (isGuest(state) && e.target.classList.contains("budget"))){
      e.preventDefault();
      const c = findCat(e.target);
      const cur = findItem(e.target, c);
      const idx = c.items.indexOf(cur);
      const it = { id: nid(), name: "", budget: 0, actual: 0, done: false };
      c.items.splice(idx + 1, 0, it);
      render(); save();
      const input = catsEl.querySelector(`[data-iid="${it.id}"] .name`);
      if(input) input.focus();
    }
  });

  // ---- reorder categories and items: drag a grip (mouse or touch), or arrow keys on it ----
  // While dragging, the card/row floats under the pointer and a dashed slot marks where it will land;
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

  // Layout boxes relative to the grid (offsets ignore running animations, so hit-testing stays stable)
  const box = el => ({ l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
  const others = () => [...catsEl.querySelectorAll(".cat:not(.dragging)")];

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
    if(drag.kind === "item"){ moveItemSlot(x, y); return; }

    const g = catsEl.getBoundingClientRect();
    const px = x - g.left, py = y - g.top;
    const target = others().find(el => { const b = box(el); return px >= b.l && px <= b.l + b.w && py >= b.t && py <= b.t + b.h; });
    if(!target) return;
    const seq = [...catsEl.children].filter(el => el === slot || el.matches(".cat:not(.dragging)"));
    const from = seq.indexOf(slot), to = seq.indexOf(target);
    const b = box(target), sameRow = Math.abs(b.t - slot.offsetTop) < 8;
    // Only move once the pointer is past the target's middle, so cards don't flip back and forth
    const past = sameRow
      ? (to > from ? px > b.l + b.w / 2 : px < b.l + b.w / 2)
      : (to > from ? py > b.t + b.h / 2 : py < b.t + b.h / 2);
    if(!past) return;
    flip(others(), () => { if(to > from) target.after(slot); else target.before(slot); });
    drag.moved = true;
  }

  function autoScroll(){
    if(!drag) return;
    const bar = document.querySelector(".totals").getBoundingClientRect().height;
    const top = 80, bottom = window.innerHeight - bar - 60;
    const speed = drag.y < top ? -Math.min(24, (top - drag.y) / 3 + 4)
                : drag.y > bottom ? Math.min(24, (drag.y - bottom) / 3 + 4) : 0;
    if(speed){ window.scrollBy(0, speed); moveDragTo(drag.x, drag.y); }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function endDrag(cancel){
    if(!drag) return;
    const { kind, card, slot, raf, moved } = drag;
    cancelAnimationFrame(raf);
    drag = null;
    document.body.classList.remove("is-sorting");
    if(cancel){ catsEl.classList.remove("sorting"); render(); return; } // back to the saved order

    if(kind === "item"){
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
      return;
    }

    // Drop: put the card where the slot is, unfold the cards, then glide it in from where it was let go
    const from = card.getBoundingClientRect();
    slot.replaceWith(card);
    card.classList.remove("dragging");
    card.removeAttribute("style");
    keepInView(card, () => catsEl.classList.remove("sorting"));
    const to = card.getBoundingClientRect();
    if(!reduceMotion()) card.animate(
      [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: "none" }],
      { duration: 200, easing: EASE });
    if(moved){
      const order = [...catsEl.querySelectorAll(".cat")].map(el => el.dataset.cid);
      state.categories.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
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
      drag = { kind: "item", card: row, slot, gx: e.clientX - r.left, gy: e.clientY - r.top, x: e.clientX, y: e.clientY, moved: false, raf: 0 };
      drag.raf = requestAnimationFrame(autoScroll);
      return;
    }
    const grip = e.target.closest(".cat-grip");
    if(!grip || e.button !== 0) return;
    e.preventDefault();
    closeMenus();
    const card = grip.closest(".cat");
    keepInView(card, () => catsEl.classList.add("sorting"));
    document.body.classList.add("is-sorting");

    // Lift the card out of the grid; a slot of the same size keeps its place
    const r = card.getBoundingClientRect();
    const slot = document.createElement("div");
    slot.className = "cat-slot";
    slot.style.height = `${r.height}px`;
    card.before(slot);
    Object.assign(card.style, { position: "fixed", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, margin: "0" });
    card.classList.add("dragging");
    try{ grip.setPointerCapture(e.pointerId); }catch(_){}
    drag = { kind: "cat", card, slot, gx: e.clientX - r.left, gy: e.clientY - r.top, x: e.clientX, y: e.clientY, moved: false, raf: 0 };
    drag.raf = requestAnimationFrame(autoScroll);
  });
  // On window, so the drag keeps working when the pointer leaves the grid (e.g. over the totals bar)
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
      return;
    }
    const grip = e.target.closest(".cat-grip");
    if(!grip) return;
    const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
    if(!step) return;
    e.preventDefault();
    const c = findCat(grip);
    const i = state.categories.indexOf(c), j = i + step;
    if(j < 0 || j >= state.categories.length) return;
    state.categories.splice(i, 1);
    state.categories.splice(j, 0, c);
    render(); save();
    const moved = catsEl.querySelector(`[data-cid="${c.id}"] .cat-grip`);
    if(moved){ moved.focus(); moved.scrollIntoView({ block: "nearest" }); }
  });

  document.getElementById("addCat").addEventListener("click", () => {
    const c = { id: nid(), name: "", items: [{ id: nid(), name: "", budget: 0, actual: 0, done: false }] };
    state.categories.push(c);
    render(); save();
    const input = catsEl.querySelector(`[data-cid="${c.id}"] .cat-name`);
    if(input){ input.focus(); input.scrollIntoView({ block: "center", behavior: "smooth" }); }
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

  // ---- view: 실제 지출 칸 켜기/끄기 ----
  const ACTUAL_KEY = "prep-budget-actual";
  const actualToggle = document.getElementById("actualToggle");
  let showActual = true;
  function setActual(on){
    showActual = on;
    document.body.classList.toggle("no-actual", !on);
    actualToggle.checked = on;
  }
  let startActual = true;
  try{ startActual = localStorage.getItem(ACTUAL_KEY) !== "off"; }catch(e){}
  setActual(startActual);
  actualToggle.addEventListener("change", () => {
    setActual(actualToggle.checked);
    try{ localStorage.setItem(ACTUAL_KEY, showActual ? "on" : "off"); }catch(e){}
    render();
  });

  // ---- 선택지 (options per item: products, vendors, ...) ----
  const optDialog = document.getElementById("optDialog");
  const optList = document.getElementById("optList");
  const optForm = document.getElementById("optForm");
  let optCtx = null; // { cid, iid, editId }

  function optItem(){
    if(!optCtx) return null;
    const c = state.categories.find(x => x.id === optCtx.cid);
    return c ? c.items.find(i => i.id === optCtx.iid) || null : null;
  }
  const hostOf = link => { try{ return new URL(link).hostname.replace(/^www\./, ""); }catch(e){ return ""; } };

  const ICON_LINK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_EDIT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 3l2.5 2.5L6 12.5H3.5V10z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const ICON_DEL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

  function renderOptions(){
    const it = optItem();
    if(!it) return;
    const opts = it.options || [];
    document.getElementById("optTitle").textContent = `${it.name || "이름 없는 항목"} 선택지`;
    document.getElementById("optSub").textContent = opts.length
      ? "하나를 고르면 이 항목의 선택지와 예산(가격 × 수량)에 들어가요. 다시 누르면 선택이 풀려요."
      : "비교할 제품이나 업체를 추가해 보세요.";
    optList.innerHTML = opts.length ? opts.map(o => {
      const sel = o.id === it.choiceId;
      const host = o.link ? hostOf(o.link) : "";
      return `<div class="opt${sel ? " selected" : ""}" data-oid="${o.id}">
        <button type="button" class="opt-main" aria-pressed="${sel}">
          <span class="opt-radio" aria-hidden="true"></span>
          <span class="opt-name">${esc(o.name)}</span>
          <span class="opt-price${o.price ? "" : " none"}">${o.price ? won(o.price) : "가격 없음"}</span>
          ${o.note ? `<span class="opt-note">${esc(o.note)}</span>` : ""}
          ${host ? `<span class="opt-host">${esc(host)}</span>` : ""}
        </button>
        ${o.link ? `<a class="opt-tool" href="${esc(o.link)}" target="_blank" rel="noopener noreferrer sponsored nofollow" aria-label="'${esc(o.name)}' 링크 열기" title="링크 열기">${ICON_LINK}</a>` : ""}
        <button type="button" class="opt-tool opt-edit" aria-label="'${esc(o.name)}' 고치기" title="고치기">${ICON_EDIT}</button>
        <button type="button" class="opt-tool opt-del danger" aria-label="'${esc(o.name)}' 삭제" title="삭제">${ICON_DEL}</button>
      </div>`;
    }).join("") : `<div class="opt-empty">아직 선택지가 없어요</div>`;
  }

  function resetOptForm(){
    optForm.reset();
    optCtx.editId = null;
    document.getElementById("optFormTitle").textContent = "선택지 추가";
    document.getElementById("optSubmit").textContent = "추가";
    document.getElementById("optCancel").hidden = true;
  }

  function openOptions(c, it){
    closeMenus();
    optCtx = { cid: c.id, iid: it.id, editId: null };
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
    const o = (it.options || []).find(x => x.id === row.dataset.oid);
    if(!o) return;
    if(e.target.closest("a.opt-tool")){ // 참고·제휴 링크를 열었을 때
      let host = ""; try{ host = new URL(o.link).hostname.replace(/^www\./, ""); }catch(err){}
      track("affiliate_click", { item_name: it.name || "", option_name: o.name, link_domain: host });
      return;
    }
    if(e.target.closest(".opt-main")){
      if(it.choiceId === o.id){
        it.choiceId = null; // keep the budget as it is
        render(); save(); renderOptions();
        return;
      }
      it.choiceId = o.id;
      if(o.price) it.budget = o.price * qtyOf(it);
      render(); save();
      optDialog.close();
      toast(!o.price ? `'${o.name}' 선택` : qtyOf(it) > 1 ? `'${o.name}' 선택 · 예산 ${won(it.budget)} (${qtyOf(it)}개)` : `'${o.name}' 선택 · 예산 ${won(it.budget)}`);
    } else if(e.target.closest(".opt-edit")){
      optCtx.editId = o.id;
      optForm.elements.name.value = o.name;
      optForm.elements.link.value = o.link || "";
      optForm.elements.price.value = plain(o.price);
      optForm.elements.note.value = o.note || "";
      document.getElementById("optFormTitle").textContent = "선택지 고치기";
      document.getElementById("optSubmit").textContent = "저장";
      document.getElementById("optCancel").hidden = false;
      optForm.elements.name.focus();
    } else if(e.target.closest(".opt-del")){
      const snap = snapshot();
      it.options = it.options.filter(x => x !== o);
      if(it.choiceId === o.id) it.choiceId = null;
      if(optCtx.editId === o.id) resetOptForm();
      render(); save(); renderOptions();
      toast(`'${o.name}' 선택지를 지웠어요`, snap);
    }
  });

  optForm.elements.price.addEventListener("input", e => {
    const t = e.target, v = parseMoney(t.value);
    t.value = plain(v);
  });
  document.getElementById("optCancel").addEventListener("click", () => { resetOptForm(); optForm.elements.name.focus(); });

  optForm.addEventListener("submit", e => {
    e.preventDefault();
    const it = optItem();
    if(!it) return;
    const name = optForm.elements.name.value.trim();
    if(!name){ optForm.elements.name.focus(); return; }
    const rawLink = optForm.elements.link.value.trim();
    const link = safeLink(rawLink);
    if(rawLink && !link){ toast("링크는 http나 https 주소만 넣을 수 있어요"); optForm.elements.link.focus(); return; }
    const price = parseMoney(optForm.elements.price.value);
    const note = optForm.elements.note.value.trim();
    it.options = it.options || [];
    const editing = optCtx.editId && it.options.find(x => x.id === optCtx.editId);
    if(editing){
      Object.assign(editing, { name, link, price, note });
      if(it.choiceId === editing.id && price) it.budget = price * qtyOf(it); // keep the chosen price and budget in sync
    } else {
      it.options.push({ id: nid(), name, link, price, note });
    }
    render(); save();
    resetOptForm(); renderOptions();
    optList.scrollTop = optList.scrollHeight;
    optForm.elements.name.focus();
  });

  optDialog.addEventListener("close", () => {
    const toastEl = document.getElementById("toast");
    if(toastEl.parentNode === optDialog) document.body.appendChild(toastEl);
    const pick = optCtx && catsEl.querySelector(`[data-iid="${optCtx.iid}"] .pick`);
    if(pick) pick.focus();
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
        store = JSON.parse(undoSnapshot);
        syncActive();
        render(); save();
        if(Auth && Auth.enabled && Auth.user) Auth.savePlans(store.plans);
        if(optDialog.open){ if(optItem()) renderOptions(); else optDialog.close(); }
        el.classList.remove("show", "has-action");
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
    green:  { fill: "FF26A392", on: "FFFFFFFF", soft: "FFDDF3EF", text: "FF1A766B" },
    navy:   { fill: "FF4176E0", on: "FFFFFFFF", soft: "FFE3ECFB", text: "FF3264C8" },
    pink:   { fill: "FFE0508A", on: "FFFFFFFF", soft: "FFFCE6EF", text: "FFC9336F" },
    yellow: { fill: "FFFFC933", on: "FF1B2230", soft: "FFFFF4D1", text: "FF8F6A00" },
    purple: { fill: "FF8E63E6", on: "FFFFFFFF", soft: "FFF0E9FC", text: "FF7A4FD0" },
    orange: { fill: "FFE2661C", on: "FFFFFFFF", soft: "FFFDEBDD", text: "FFB24A0B" }
  };
  const accentXL = key => ACCENT_XL[key] || ACCENT_XL.green;

  const moneyFmt = '#,##0"원";[Red]-#,##0"원"';
  const solid = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const edge = (argb, style = "thin") => ({ style, color: { argb } });
  const LINE = "FFDDE2E8", INK = "FF1B2230", MUTED = "FF667085", SOFT_BG = "FFF2F4F6";

  // Excel sheet names: max 31 chars, no [ ] : * ? / \, no leading/trailing ', unique ignoring case
  function sheetNamer(){
    const used = new Set();
    return raw => {
      const base = (String(raw || "").replace(/[\[\]:*?\/\\]/g, " ").replace(/^'+|'+$/g, "").replace(/\s+/g, " ").trim() || "예산표").slice(0, 31);
      let name = base, n = 2;
      while(used.has(name.toLowerCase())){
        const suffix = ` (${n++})`;
        name = base.slice(0, 31 - suffix.length) + suffix;
      }
      used.add(name.toLowerCase());
      return name;
    };
  }
  const sheetRef = (sheet, cell) => `'${sheet.replace(/'/g, "''")}'!${cell}`;
  const XL2 = n => String.fromCharCode(64 + n); // column letter by index

  // Plan sheet columns, in the same order as the screen
  const XC = { name: 1, pick: 2, qty: 3, budget: 4, actual: 5, diff: 6, done: 7, link: 8 };
  const XHEAD = ["항목", "선택지", "수량", "예산", "실제 지출", "차액", "완료", "링크"];
  const XL = key => String.fromCharCode(64 + XC[key]); // column letter
  const isMoneyCol = n => n === XC.budget || n === XC.actual || n === XC.diff;

  // One budget → one sheet. Grand total sits in row 4.
  // links (optional): { sheet, ranges: Map(item → { first, last }), itemRows: Map(item → row) }
  // Items with options get a 선택지 dropdown and a 예산 formula (price of the picked option × 수량).
  function addPlanSheet(wb, plan, sheetName, links){
    const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
    const NC = XHEAD.length;
    ws.columns = [{ width: 28 }, { width: 22 }, { width: 8 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 8 }, { width: 26 }];
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
        if(chosen) row.getCell(XC.pick).value = chosen.name;
        row.getCell(XC.qty).value = qtyOf(it);
        row.getCell(XC.budget).value = it.budget || 0;
        row.getCell(XC.actual).value = it.actual || 0;
        row.getCell(XC.diff).value = { formula: `${XL("budget")}${r}-${XL("actual")}${r}` };
        row.getCell(XC.done).value = it.done ? "✓" : "";
        if(chosen && chosen.link) row.getCell(XC.link).value = { text: hostOf(chosen.link) || chosen.link, hyperlink: chosen.link };
        const range = links && links.ranges.get(it);
        if(range){
          links.itemRows.set(it, r);
          // The item name jumps to its 선택지 block; the text still reads as the plain name on import
          row.getCell(XC.name).value = {
            formula: `HYPERLINK("#'${links.sheet.replace(/'/g, "''")}'!A${range.band}","${String(it.name).replace(/"/g, '""')}")`,
            result: it.name
          };
          const names = sheetRef(links.sheet, `$${XL2(OPT_C.name)}$${range.first}:$${XL2(OPT_C.name)}$${range.last}`);
          const prices = sheetRef(links.sheet, `$${XL2(OPT_C.price)}$${range.first}:$${XL2(OPT_C.price)}$${range.last}`);
          const P = `${XL("pick")}${r}`, Q = `${XL("qty")}${r}`;
          row.getCell(XC.pick).dataValidation = {
            type: "list", allowBlank: true, formulae: [names],
            showErrorMessage: true, errorStyle: "warning", errorTitle: "선택지", error: "선택지 시트의 이 항목 칸에 있는 이름을 골라 주세요. 새로 적으면 목록에 바로 나타나요."
          };
          // A budget typed by hand (not price × 수량) stays as typed; otherwise it follows the dropdown.
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
        sub.getCell(XC.actual).value = { formula: `SUM(${XL("actual")}${start}:${XL("actual")}${end})` };
      } else {
        sub.getCell(XC.budget).value = 0; sub.getCell(XC.actual).value = 0;
      }
      sub.getCell(XC.diff).value = { formula: `${XL("budget")}${r}-${XL("actual")}${r}` };
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
    total.getCell(XC.actual).value = sumOf(XL("actual"));
    total.getCell(XC.diff).value = { formula: `${XL("budget")}4-${XL("actual")}4` };
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
  // rows: [{ name, count, budgetRef, actualRef, strong, soft, text? }]
  const addSummarySheet = (wb, sheetName) => wb.addWorksheet(sheetName, { views: [{ showGridLines: false }] });
  function fillSummarySheet(ss, firstCol, rows, theme){
    if(theme) ss.properties.tabColor = { argb: theme.fill };
    ss.columns = [{ width: 26 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 10 }];
    const sh = ss.getRow(1);
    sh.values = [firstCol, "항목 수", "예산", "실제 지출", "차액", "사용률"];
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
      row.getCell(4).value = { formula: s.actualRef };
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
      // Title row: 카테고리 › 항목, with a jump back to the item on the plan sheet
      const band = ws.getRow(b.band);
      ws.mergeCells(b.band, 1, b.band, NC - 1);
      band.getCell(1).value = (b.multi ? `${b.sheet} › ` : "") + `${b.cat} › ${b.item.name}`;
      band.getCell(1).font = { bold: true, size: 12, color: { argb: b.t.text } };
      band.getCell(1).alignment = { vertical: "middle", indent: 1 };
      const itemRow = itemRows.get(b.item);
      if(itemRow){
        band.getCell(NC).value = { formula: `HYPERLINK("#'${b.sheet.replace(/'/g, "''")}'!A${itemRow}","예산표로 ↗")`, result: "예산표로 ↗" };
        band.getCell(NC).font = { size: 11, color: { argb: b.t.text }, underline: true };
        band.getCell(NC).alignment = { vertical: "middle", horizontal: "right" };
      }
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

  // scope "current": 예산표 + 요약 (+ 선택지) for the active tab
  // scope "all": 전체 요약 first, then one sheet per tab (+ one 선택지 sheet for all tabs)
  async function buildWorkbook(scope){
    const wb = new ExcelJS.Workbook();
    if(scope === "all"){
      const nameOf = sheetNamer();
      const overview = addSummarySheet(wb, nameOf("전체 요약")); // created first so it is the first tab
      const sheets = BS.live.map(p => ({ plan: p, sheet: nameOf(planLabel(p)) }));
      const optName = nameOf("선택지");
      const layout = layoutOptions(sheets);
      const links = { sheet: optName, ranges: layout.ranges, itemRows: new Map() };
      const entries = sheets.map(({ plan: p, sheet }) => {
        if(isGuest(p)){ addGuestSheet(wb, p, sheet); return null; } // not a budget: kept out of 전체 요약
        const { itemCount } = addPlanSheet(wb, p, sheet, links);
        const t = accentXL(p.accent);
        return { name: sheet, count: itemCount, // sheet name, so duplicate titles stay distinguishable
                 budgetRef: sheetRef(sheet, `${XL("budget")}4`), actualRef: sheetRef(sheet, `${XL("actual")}4`),
                 strong: t.fill, soft: t.soft, text: t.text };
      });
      fillSummarySheet(overview, "예산표", entries.filter(Boolean));
      addOptionSheet(wb, optName, layout, links.itemRows, null);
    } else if(isGuest(state)){
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
        budgetRef: sheetRef(sheet, `${XL("budget")}${s.row}`), actualRef: sheetRef(sheet, `${XL("actual")}${s.row}`)
      })), accentXL(state.accent));
      addOptionSheet(wb, "선택지", layout, links.itemRows, accentXL(state.accent));
    }
    return wb;
  }

  const fileSafe = s => String(s).replace(/[\\/:*?"<>|]/g, "").trim();
  const exportMenu = document.getElementById("exportMenu");
  const exportBtn = document.getElementById("exportBtn");
  let exporting = false;

  function updateExportNotes(){
    document.getElementById("exportCurrentNote").textContent = `'${planLabel(state)}' · ${isGuest(state) ? "방명록" : "예산표"}와 요약 시트`;
    document.getElementById("exportAllNote").textContent = `파일 ${BS.live.length}개를 시트 하나씩 + 전체 요약`;
  }
  exportMenu.addEventListener("toggle", () => { if(exportMenu.open) updateExportNotes(); });

  exportBtn.addEventListener("click", e => {
    if(exporting){ e.preventDefault(); return; }
    // Only one tab → nothing to choose, export right away
    if(store.plans.length === 1){ e.preventDefault(); runExport("current"); }
  });
  exportMenu.querySelectorAll("[data-export]").forEach(b => b.addEventListener("click", () => {
    exportMenu.open = false;
    runExport(b.dataset.export);
  }));

  async function runExport(scope){
    track("excel_export", { scope: scope, tabs: store.plans.length });
    try{ await loadExcel(); }catch(e){ toast("엑셀 도구를 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요."); return; }
    exporting = true;
    exportBtn.setAttribute("aria-disabled", "true");
    try{
      const wb = await buildWorkbook(scope);
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const filename = (scope === "all"
        ? `예산표 모음 (${store.plans.length}개)`
        : (fileSafe(planLabel(state)) || "예산표")) + ".xlsx";

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
  const HEAD_KEYS = { "이름": "name", "축의금": "budget", "카테고리": "cat", "항목": "name", "선택지": "pick", "수량": "qty", "예산": "budget", "실제 지출": "actual", "완료": "done", "링크": "link" };

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
      if(!(col.name && col.budget && col.actual)) continue;
      if(col.cat === 1 && col.name === 2) return readRows(ws, h, "old", col);
      if(col.name === 1) return readRows(ws, h, "now", col);
    }
    return null; // summary sheets and anything else
  }

  const OLD_FILLS = { green: "2E6F6B", navy: "3A5A94", pink: "B83D6E", yellow: "F2C230", purple: "6B4FA0", orange: "C2571A" }; // colors used by earlier exports
  function accentFromSheet(ws, headRow){
    const rgb = a => a ? String(a).slice(-6).toUpperCase() : "";
    const candidates = [ws.properties && ws.properties.tabColor && ws.properties.tabColor.argb,
                        (ws.getRow(headRow).getCell(1).fill || {}).fgColor && ws.getRow(headRow).getCell(1).fill.fgColor.argb].map(rgb);
    for(const c of candidates){
      const key = c && (Object.keys(ACCENT_XL).find(k => rgb(ACCENT_XL[k].fill) === c) || Object.keys(OLD_FILLS).find(k => OLD_FILLS[k] === c));
      if(key) return key;
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
      const budget = cellMoney(v(col.budget)), actual = cellMoney(v(col.actual));

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

      if(!name && !budget && !actual) continue;
      if(!cur) openCat("기타");
      const item = { id: nid(), name, budget, actual, done: col.done ? cellDone(v(col.done)) : false };
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

    const snap = snapshot();
    // An untouched starter budget is replaced instead of being left behind as an empty tab
    const pristine = store.plans.length === 1
      && !state.categories.some(c => c.items.some(hasContent))
      && state.categories.every(c => !c.name || c.name === "첫 번째 카테고리");
    if(pristine) store.plans = [];
    const added = found.map(p => newPlan(p));
    store.plans.push(...added);
    store.activeId = added[0].id;
    syncActive();
    render(); save();
    toast(added.length === 1 ? `새 파일로 불러왔어요 · ${planLabel(added[0])}` : `파일 ${added.length}개로 불러왔어요`, snap);
  });

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
    try{ token = new URLSearchParams(location.search).get("join") || ""; }catch(e){}
    if(!token) return;
    if(!(Auth && Auth.enabled)) return;
    if(!Auth.user){
      toast("초대를 받으려면 먼저 로그인해 주세요");
      return; // 로그인하면 아래 onChange에서 다시 처리합니다
    }
    const res = await Auth.acceptInvite(token);
    try{ history.replaceState(null, "", location.pathname); }catch(e){}
    if(!res || res.error){ toast("초대가 만료됐거나 잘못된 링크예요"); return; }
    await mergeWithAccount();
    const joined = store.plans.find(p => p.id === res.planId);
    if(joined){ store.activeId = joined.id; syncActive(); render(); save(); }
    toast("예산표를 함께 쓰게 됐어요");
  }

  // ---- 상대가 고쳤을 때 ----
  let lastTyped = 0, stopWatch = null;
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

  async function watchRemote(){
    if(stopWatch) return;
    stopWatch = await Auth.watchPlans(payload => {
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
    });
  }

  if(Auth && Auth.enabled){
    Auth.onChange(async user => {
      showShare();
      if(user){ await mergeWithAccount(); handleJoin(); watchRemote(); }
    });
    Auth.init().then(() => { showShare(); handleJoin(); });
  }
})();
