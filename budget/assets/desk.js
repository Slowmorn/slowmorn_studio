/* 내 책상 — 홈에 놓인 파일들
   파일 하나가 예산표 하나입니다. 여기서만 파일을 만들고 지웁니다.
   (체크리스트 화면에는 삭제가 없습니다. 닫기인지 삭제인지 헷갈리지 않도록요.)
   assets/store.js 다음에 읽습니다. */
(function(){
  const BS = window.BudgetStore;
  const Auth = window.BudgetAuth;
  const listEl = document.getElementById("deskFiles");
  const noteEl = document.querySelector(".desk-note");
  const newMenu = document.getElementById("newMenu");
  if(!BS || !listEl) return;

  const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const won = n => (Number(n) || 0).toLocaleString("ko-KR") + "원";

  const COLORS = [
    ["green", "녹색"], ["navy", "네이비"], ["pink", "핑크"],
    ["yellow", "노랑"], ["purple", "보라"], ["orange", "주황"]
  ];

  // 파일 아이콘. 선과 면 모두 그 파일의 색을 씁니다.
  const ICON_BUDGET = `<svg class="file-ico" viewBox="0 0 40 48" aria-hidden="true">
    <path d="M4.8 5a4 4 0 0 1 4-4H24l11.2 11.2V43a4 4 0 0 1-4 4H8.8a4 4 0 0 1-4-4z" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5"/>
    <path d="M24 1v7.2a4 4 0 0 0 4 4h7.2" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M12 22.5h10M12 29h10" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" opacity=".5"/>
    <path d="M12 35.5h5.5" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" opacity=".3"/>
    <path d="M23 34.8l2.6 2.6 5.4-6" fill="none" stroke="var(--accent)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  const ICON_GUEST = `<svg class="file-ico" viewBox="0 0 40 48" aria-hidden="true">
    <path d="M4.8 5a4 4 0 0 1 4-4H24l11.2 11.2V43a4 4 0 0 1-4 4H8.8a4 4 0 0 1-4-4z" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5"/>
    <path d="M24 1v7.2a4 4 0 0 0 4 4h7.2" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="20" cy="25" r="4.2" fill="none" stroke="var(--accent)" stroke-width="1.8"/>
    <path d="M12.5 38c0-4.1 3.4-7.4 7.5-7.4s7.5 3.3 7.5 7.4" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
  const ICON_MORE = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/></svg>`;

  // '어제', '3일 전' 처럼 읽기 쉽게
  function when(ts){
    if(!ts) return "";
    const day = 86400000;
    const d0 = new Date(ts); d0.setHours(0, 0, 0, 0);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const gap = Math.round((now - d0) / day);
    if(gap <= 0) return "오늘";
    if(gap === 1) return "어제";
    if(gap < 7) return gap + "일 전";
    return new Date(ts).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
  }

  // ---- 새 파일 메뉴 ----
  BS.ready.then(() => {
    const html = BS.templates.map(t =>
      `<button type="button" data-new="${esc(t.id)}">${esc(t.label)}<small>${esc(t.desc)}</small></button>`
    ).join("");
    newMenu.querySelector('[data-new="blank"]').insertAdjacentHTML("beforebegin", html);
  });

  function createFile(key){
    const plan = BS.addPlan(key);
    if(key && key !== "blank"){
      try{ if(typeof gtag === "function") gtag("event", "template_load", { template: key, source: "desk" }); }catch(e){}
    }
    location.href = "planner/?id=" + encodeURIComponent(plan.id);
  }

  // ---- 알림 한 줄 ----
  const toastEl = document.getElementById("toast");
  let toastTimer = null;
  function toast(msg, undo){
    if(!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.innerHTML = `<span>${esc(msg)}</span>`;
    toastEl.classList.toggle("has-action", !!undo);
    if(undo){
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "되돌리기";
      b.addEventListener("click", () => { undo(); hide(); });
      toastEl.appendChild(b);
    }
    toastEl.classList.add("show");
    toastTimer = setTimeout(hide, undo ? 7000 : 2600);
    function hide(){ toastEl.classList.remove("show"); }
  }

  // ---- 파일 목록 ----
  let remote = null;   // 로그인했을 때 계정에서 받아 온 목록

  const files = () => remote || BS.plans;

  function cardHTML(p){
    const guest = p.kind === "guestbook";
    const { budget, count } = BS.summary(p);
    const title = BS.planLabel(p);
    const meta = [
      `${count}${guest ? "명" : "개"}`,
      guest ? null : won(budget),
      when(p.updatedAt)
    ].filter(Boolean).join(" · ");
    return `<div class="file" data-id="${esc(p.id)}" data-accent="${esc(p.accent || "green")}">
      <a class="file-open" href="planner/?id=${encodeURIComponent(p.id)}">
        ${guest ? ICON_GUEST : ICON_BUDGET}
        <span class="file-name">${esc(title)}</span>
        <span class="file-meta">${esc(meta)}</span>
      </a>
      <details class="menu file-menu">
        <summary class="file-more" aria-label="'${esc(title)}' 파일 메뉴" title="파일 메뉴">${ICON_MORE}</summary>
        <div class="menu-pop">
          <button type="button" data-act="rename">이름 바꾸기</button>
          <button type="button" data-act="duplicate">복제</button>
          <hr>
          <div class="menu-note">색</div>
          <div class="file-colors">
            ${COLORS.map(([k, label]) => `<button type="button" class="color-chip" data-act="accent" data-accent-key="${k}" data-accent="${k}" aria-label="${label}" title="${label}"></button>`).join("")}
          </div>
          <hr>
          <button type="button" class="danger" data-act="delete">삭제</button>
        </div>
      </details>
    </div>`;
  }

  function startHTML(){
    const picks = BS.templates.slice(0, 3);
    return `<div class="desk-empty">
      <p>아직 파일이 없어요. 하나 만들어 시작해 보세요.</p>
      <div class="start-cards">
        ${picks.map(t => `<button type="button" class="start-card" data-new="${esc(t.id)}">
          <b>${esc(t.label)}</b><span>${esc(t.desc)}</span>
        </button>`).join("")}
        <button type="button" class="start-card start-blank" data-new="blank">
          <b>빈 목록</b><span>처음부터 직접 적을게요</span>
        </button>
      </div>
    </div>`;
  }

  function render(){
    const list = files();
    listEl.innerHTML = list.length ? list.map(cardHTML).join("") : startHTML();
    if(!noteEl) return;
    noteEl.textContent = remote
      ? "이 계정에 저장돼 있어요. 다른 기기에서 같은 계정으로 로그인하면 이어서 쓸 수 있어요."
      : (Auth && Auth.enabled
        ? "지금은 이 브라우저에만 저장돼요. 로그인하면 다른 기기에서도 이어서 쓸 수 있어요."
        : "이 브라우저에 저장돼요.");
  }

  async function refresh(){
    remote = null;
    if(Auth && Auth.enabled && Auth.user){
      // 로그인했으면 계정의 것과 이 브라우저의 것을 합쳐 두고 그 결과를 보여 줍니다
      await BS.mergeWithAccount();
      remote = BS.plans;
    }
    render();
  }

  // ---- 카드 누르기 ----
  listEl.addEventListener("click", e => {
    const start = e.target.closest("[data-new]");
    if(start){ createFile(start.dataset.new); return; }

    const btn = e.target.closest("[data-act]");
    if(!btn) return;
    const card = btn.closest(".file");
    const id = card.dataset.id;
    const plan = BS.find(id);
    if(!plan) return;
    card.querySelectorAll("details[open]").forEach(d => d.open = false);

    if(btn.dataset.act === "rename"){
      const next = prompt("파일 이름", BS.planLabel(plan));
      if(next == null) return;
      BS.rename(id, next.trim());
      render();
      return;
    }
    if(btn.dataset.act === "duplicate"){
      const copy = BS.duplicate(id);
      render();
      toast(`'${BS.planLabel(copy)}'로 복제했어요`);
      return;
    }
    if(btn.dataset.act === "accent"){
      BS.setAccent(id, btn.dataset.accentKey);
      render();
      return;
    }
    if(btn.dataset.act === "delete"){
      const name = BS.planLabel(plan);
      const gone = BS.removePlan(id);
      if(!gone) return;
      render();
      toast(`'${name}' 파일을 지웠어요`, () => {
        BS.restorePlan(gone.plan, gone.index);
        render();
      });
    }
  });

  // 메뉴 하나만 열어 둡니다
  document.addEventListener("click", e => {
    document.querySelectorAll(".desk details[open]").forEach(d => {
      if(!d.contains(e.target)) d.open = false;
    });
  });
  document.addEventListener("keydown", e => {
    if(e.key === "Escape") document.querySelectorAll(".desk details[open]").forEach(d => d.open = false);
  });

  // 상단의 '새 파일' 메뉴
  newMenu.addEventListener("click", e => {
    const btn = e.target.closest("[data-new]");
    if(btn) createFile(btn.dataset.new);
  });

  BS.ready.then(render);
  refresh();
  if(Auth && Auth.enabled) Auth.onChange(() => refresh());
})();
