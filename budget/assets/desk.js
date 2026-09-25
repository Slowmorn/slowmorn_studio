/* 내 책상 — 유리판 위에 파일을 자석처럼 붙여 두는 화면
   파일 하나가 예산표 하나입니다. 여기서만 파일을 만들고 지웁니다.
   (체크리스트 화면에는 삭제가 없습니다. 닫기인지 삭제인지 헷갈리지 않도록요.)
   넓은 화면에서는 끌어서 아무 데나 놓을 수 있고, 좁은 화면에서는 줄줄이 놓입니다.
   assets/store.js 다음에 읽습니다. */
(function(){
  const BS = window.BudgetStore;
  const Auth = window.BudgetAuth;
  const board = document.getElementById("deskBoard");
  const noteEl = document.querySelector(".desk-note");
  const newMenu = document.getElementById("newMenu");
  const trashBtn = document.getElementById("trashBtn");
  if(!BS || !board) return;

  const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const won = n => (Number(n) || 0).toLocaleString("ko-KR") + "원";
  const manwon = n => {
    if(!n) return "0원";
    if(n < 10000) return won(n);
    const man = Math.round(n / 10000);
    if(man >= 10000){
      const eok = Math.floor(man / 10000), rest = man % 10000;
      return eok + "억" + (rest ? " " + rest.toLocaleString("ko-KR") + "만" : "") + "원";
    }
    return man.toLocaleString("ko-KR") + "만원";
  };

  // 아이콘 1~6 순서
  const COLORS = [
    ["orange", "주황"],
    ["navy", "파랑"],
    ["green", "초록"],
    ["pink", "분홍"],
    ["purple", "자주"],
    ["teal", "청록"]
  ];

  // 자석 크기. 자리를 잡을 때도 이 값을 씁니다.
  const W = 208, H = 108, GAP = 16, PAD = 26;
  const FREE = () => board.clientWidth >= 760;   // 좁으면 자유 배치를 끕니다

  const SHAPE = {
    orange: "M28.4 6.40039C32.1556 6.40039 35.2 12.4893 35.2 20.0004C35.2 27.5115 32.1556 33.6004 28.4 33.6004C26.8148 33.6004 25.3564 32.5155 24.2 30.6968C23.0437 32.5155 21.5852 33.6004 20 33.6004C18.4148 33.6004 16.9564 32.5155 15.8 30.6968C14.6437 32.5155 13.1852 33.6004 11.6 33.6004C7.84451 33.6004 4.80005 27.5115 4.80005 20.0004C4.80005 12.4893 7.84451 6.40039 11.6 6.40039C13.1852 6.40039 14.6437 7.48522 15.8 9.30391C16.9564 7.48522 18.4149 6.40039 20 6.40039C21.5852 6.40039 23.0437 7.48522 24.2 9.30391C25.3564 7.48522 26.8149 6.40039 28.4 6.40039Z",
    navy: "M33.6 28.3998C33.6 32.1553 27.511 35.1998 20 35.1998C12.4889 35.1998 6.39997 32.1553 6.39997 28.3998C6.39997 26.8146 7.48485 25.3561 9.30357 24.1998C7.48485 23.0435 6.39997 21.585 6.39997 19.9998C6.39997 18.4146 7.48485 16.9561 9.30357 15.7998C7.48485 14.6435 6.39997 13.185 6.39997 11.5998C6.39997 7.84427 12.4889 4.7998 20 4.7998C27.511 4.7998 33.6 7.84427 33.6 11.5998C33.6 13.185 32.5151 14.6435 30.6965 15.7998C32.5151 16.9561 33.6 18.4146 33.6 19.9998C33.6 21.585 32.5151 23.0435 30.6965 24.1998C32.5151 25.3561 33.6 26.8146 33.6 28.3998Z",
    green: "M5.59998 20.8797V20.0797C5.59998 12.1268 12.0471 5.67969 20 5.67969C27.9529 5.67969 34.4 12.1268 34.4 20.0797V20.8797C34.4 28.3908 31.5346 34.4797 28 34.4797C26.4864 34.4797 25.0957 33.3631 24 31.4965C22.9043 33.3631 21.5136 34.4797 20 34.4797C18.4864 34.4797 17.0957 33.3631 16 31.4965C14.9043 33.3631 13.5136 34.4797 12 34.4797C8.46535 34.4797 5.59998 28.3908 5.59998 20.8797Z",
    pink: "M34.4 19.2805L34.4 20.0805C34.4 28.0334 27.9529 34.4805 20 34.4805C12.0471 34.4805 5.60003 28.0334 5.60003 20.0805L5.60003 19.2805C5.60003 11.7694 8.46541 5.68047 12 5.68047C13.5136 5.68047 14.9043 6.79707 16 8.66367C17.0957 6.79707 18.4864 5.68047 20 5.68047C21.5136 5.68047 22.9043 6.79707 24 8.66367C25.0957 6.79707 26.4864 5.68047 28 5.68047C31.5346 5.68047 34.4 11.7694 34.4 19.2805Z",
    purple: "M21.1139 5.07392C23.1133 3.07458 27.2276 3.94733 30.3035 7.02325C33.3794 10.0992 34.2521 14.2134 32.2528 16.2128C31.564 16.9015 30.6242 17.2494 29.5623 17.2838C33.7199 23.0168 34.8753 29.0733 31.9743 31.9743C29.5134 34.4353 24.7818 33.9772 19.9032 31.2437C20.1018 32.707 19.783 34.0293 18.8862 34.9261C16.8868 36.9254 12.7725 36.0527 9.69658 32.9768C6.62068 29.9009 5.74794 25.7866 7.74725 23.7872C8.43597 23.0985 9.3757 22.7506 10.4374 22.7161C6.28001 16.9832 5.12469 10.9268 8.0257 8.02579C10.4866 5.56486 15.2182 6.02294 20.0968 8.75643C19.8982 7.29312 20.2171 5.97075 21.1139 5.07392Z",
    teal: "M18.8861 5.07392C16.8867 3.07458 12.7724 3.94733 9.69649 7.02325C6.6206 10.0992 5.7479 14.2134 7.74724 16.2128C8.43603 16.9015 9.37579 17.2494 10.4377 17.2838C6.2801 23.0168 5.12466 29.0733 8.02568 31.9743C10.4866 34.4353 15.2182 33.9772 20.0968 31.2437C19.8982 32.707 20.217 34.0293 21.1138 34.9261C23.1132 36.9254 27.2275 36.0527 30.3034 32.9768C33.3793 29.9009 34.2521 25.7866 32.2527 23.7872C31.564 23.0985 30.6243 22.7506 29.5626 22.7161C33.72 16.9832 34.8753 10.9268 31.9743 8.02579C29.5134 5.56486 24.7818 6.02294 19.9032 8.75643C20.1018 7.29312 19.7829 5.97075 18.8861 5.07392Z"
  };
  const fileIcon = accent => `<svg class="file-ico" viewBox="0 0 40 40" aria-hidden="true"><path d="${SHAPE[BS.accentKey(accent)]}" fill="var(--swatch)"/></svg>`;
  const ICON_MORE = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/></svg>`;

  // 자석처럼 보이도록 파일마다 아주 살짝 기울입니다. id 에서 뽑으니 늘 같은 각도예요.
  function tilt(id){
    let h = 0;
    for(let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000;
    return ((h / 1000) * 3.4 - 1.7).toFixed(2);
  }

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
      b.addEventListener("click", () => { undo(); toast("되돌렸어요"); });
      toastEl.appendChild(b);
    }
    toastEl.classList.add("show");
    toastTimer = setTimeout(hide, undo ? 7000 : 2600);
    function hide(){ toastEl.classList.remove("show"); }
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

  // ---- 자리 잡기 ----
  // 자리를 정해 둔 파일은 그대로, 아직 없는 파일은 빈 칸을 찾아 차례로 놓습니다.
  function layout(plans){
    const width = board.clientWidth || 1000;
    const perRow = Math.max(1, Math.floor((width - PAD * 2 + GAP) / (W + GAP)));
    const taken = [];
    const place = p => {
      const x = Math.min(Math.max(p.pos.x, PAD), Math.max(PAD, width - W - PAD));
      return { x, y: Math.max(PAD, p.pos.y) };
    };
    // 끌어다 놓은 파일이 차지한 자리를 먼저 잡아 두고, 새 파일은 그 자리와 겹치지 않는 칸에 놓습니다
    const out = plans.map(p => p.pos ? { plan: p, ...place(p) } : { plan: p });
    out.forEach(o => { if(o.plan.pos) taken.push(o); });
    const clash = (x, y) => taken.some(t => x < t.x + W + GAP && t.x < x + W + GAP && y < t.y + H + GAP && t.y < y + H + GAP);
    let slot = 0;
    out.forEach(o => {
      if(o.plan.pos) return;
      let x, y;
      do {
        x = PAD + (slot % perRow) * (W + GAP);
        y = PAD + Math.floor(slot / perRow) * (H + GAP);
        slot++;
      } while(clash(x, y));
      o.x = x; o.y = y;
      taken.push(o);
    });
    return out;
  }

  function ddayHTML(p){
    const n = BS.daysLeft(p.dday);
    if(n === null) return "";
    const label = n === 0 ? "D-DAY" : (n > 0 ? "D-" + n : "D+" + (-n));
    const cls = n < 0 ? " past" : (n <= 14 ? " soon" : "");
    // 표를 눌러도 ⋯ 메뉴의 '날짜 바꾸기'와 같은 창이 열립니다 (data-act="dday")
    const target = ((p.ddayLabel || "") + " " + p.dday).trim();
    return `<button type="button" class="file-dday${cls}" data-act="dday" title="${esc(target)} · 눌러서 바꾸기" aria-label="${esc(label + ", " + target)} · 날짜 바꾸기">${label}</button>`;
  }

  function cardHTML(p, at){
    const guest = BS.isGuest(p);
    const { budget, count } = BS.summary(p);
    const pr = BS.progress(p);
    const title = BS.planLabel(p);
    const meta = guest
      ? `${count}명 · ${when(p.updatedAt)}`
      : `${manwon(budget)} · ${when(p.updatedAt)}`;
    const style = `--tilt:${tilt(p.id)}deg` + (at ? `;left:${at.x}px;top:${at.y}px` : "");
    return `<div class="file" data-id="${esc(p.id)}" data-accent="${esc(p.accent || "green")}" style="${style}">
      <a class="file-open" href="planner/?id=${encodeURIComponent(p.id)}">
        ${fileIcon(p.accent)}
        <span class="file-name">${esc(title)}</span>
        <span class="file-meta">${esc(meta)}</span>
        ${guest || !pr.total ? "" : `<span class="file-progress" aria-label="${pr.done}/${pr.total} 완료">
          <span style="width:${Math.round(pr.ratio * 100)}%"></span>
        </span><span class="file-count">${pr.done}/${pr.total}</span>`}
      </a>
      ${ddayHTML(p)}
      <details class="menu file-menu">
        <summary class="file-more" aria-label="'${esc(title)}' 파일 메뉴" title="파일 메뉴">${ICON_MORE}</summary>
        <div class="menu-pop">
          <button type="button" data-act="rename">이름 바꾸기</button>
          <button type="button" data-act="dday">${p.dday ? "날짜 바꾸기" : "날짜 정하기"}</button>
          <button type="button" data-act="duplicate">복제</button>
          <hr>
          <div class="menu-note">색</div>
          <div class="file-colors">
            ${COLORS.map(([k, label]) => `<button type="button" class="color-chip" data-act="accent" data-accent-key="${k}" data-accent="${k}" aria-label="${label}" title="${label}"></button>`).join("")}
          </div>
          <hr>
          <button type="button" class="danger" data-act="delete">휴지통으로</button>
        </div>
      </details>
    </div>`;
  }

  function startHTML(){
    const picks = BS.templates.slice(0, 3);
    return `<div class="desk-empty">
      <p>버짓보드가 비어 있어요. 무엇부터 준비하세요?</p>
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

  // ---- 그리기 ----
  function render(){
    const plans = BS.live;
    const free = FREE();
    board.classList.toggle("free", free && plans.length > 0);

    if(!plans.length){
      board.innerHTML = startHTML();
      board.style.height = "";
    } else if(free){
      const placed = layout(plans);
      board.innerHTML = placed.map(({ plan, x, y }) => cardHTML(plan, { x, y })).join("");
      const lowest = placed.reduce((m, p) => Math.max(m, p.y + H), 0);
      board.style.height = (lowest + PAD) + "px";
    } else {
      board.innerHTML = plans.map(cardHTML).join("");
      board.style.height = "";
    }

    renderTrashBtn();
    if(!noteEl) return;
    noteEl.textContent = (Auth && Auth.enabled && Auth.user)
      ? "이 계정에 저장돼 있어요. 다른 기기에서 같은 계정으로 로그인하면 이어서 쓸 수 있어요."
      : (Auth && Auth.enabled
        ? "지금은 이 브라우저에만 저장돼요. 로그인하면 다른 기기에서도 이어서 쓸 수 있어요."
        : "이 브라우저에 저장돼요.");
  }

  function renderTrashBtn(){
    if(!trashBtn) return;
    const n = BS.trashed.length;
    trashBtn.hidden = !n;
    trashBtn.querySelector("span").textContent = `휴지통 ${n}`;
  }

  // ---- 카드 누르기 ----
  board.addEventListener("click", e => {
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
    if(btn.dataset.act === "dday"){ window.BudgetShell.openDday(plan, render); return; }
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
      if(!BS.removePlan(id)) return;
      render();
      toast(`'${name}'을(를) 휴지통에 넣었어요`, () => { BS.restorePlan(id); render(); });
    }
  });

  // ---- 끌어서 옮기기 ----
  // 자석처럼 아무 데나 놓을 수 있습니다. 조금이라도 끌었으면 파일이 열리지 않게 막아요.
  let drag = null, justDragged = false, dragFlagTimer = null;
  board.addEventListener("click", e => {
    if(!justDragged) return;
    justDragged = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  board.addEventListener("pointerdown", e => {
    if(!board.classList.contains("free")) return;
    if(e.button !== 0) return;
    if(e.target.closest(".file-menu, [data-act]")) return;
    const card = e.target.closest(".file");
    if(!card) return;
    // 여기서 포인터를 붙잡지 않습니다. 붙잡으면 click 이 카드로 가서
    // 안에 있는 링크가 열리지 않아요. 실제로 끌기 시작할 때만 붙잡습니다.
    drag = {
      card, id: card.dataset.id, pointerId: e.pointerId, moved: false,
      startX: e.clientX, startY: e.clientY,
      originX: parseFloat(card.style.left) || 0,
      originY: parseFloat(card.style.top) || 0
    };
  });

  board.addEventListener("pointermove", e => {
    if(!drag) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if(!drag.moved && Math.hypot(dx, dy) < 4) return;
    if(!drag.moved){
      drag.moved = true;
      try{ drag.card.setPointerCapture(drag.pointerId); }catch(err){}
      drag.card.classList.add("dragging");
      // 집어 든 것이 맨 위로 오도록
      board.querySelectorAll(".file").forEach(el => el.style.zIndex = "");
      drag.card.style.zIndex = "5";
    }
    e.preventDefault();
    const maxX = Math.max(PAD, board.clientWidth - W - PAD);
    drag.card.style.left = Math.min(Math.max(drag.originX + dx, PAD), maxX) + "px";
    drag.card.style.top = Math.max(drag.originY + dy, PAD) + "px";
  });

  function endDrag(){
    if(!drag) return;
    const d = drag; drag = null;
    d.card.classList.remove("dragging");
    if(!d.moved) return;
    const x = parseFloat(d.card.style.left) || 0;
    const y = parseFloat(d.card.style.top) || 0;
    BS.setPos(d.id, x, y);
    // 판이 모자라면 늘립니다
    const lowest = [...board.querySelectorAll(".file")].reduce((m, el) => Math.max(m, (parseFloat(el.style.top) || 0) + H), 0);
    board.style.height = (lowest + PAD) + "px";
    // 끌고 난 직후의 click 은 무시합니다.
    // 한 번만 듣는 리스너로 두면, 끌고 나서 click 이 안 올 때 그 리스너가 남아
    // 다음 정상 클릭까지 삼켜 버립니다. 그래서 잠깐만 켜지는 표시로 둡니다.
    justDragged = true;
    clearTimeout(dragFlagTimer);
    dragFlagTimer = setTimeout(() => { justDragged = false; }, 350);
  }
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", endDrag);
  board.addEventListener("dragstart", e => e.preventDefault());

  // ---- 휴지통 ----
  function openTrash(){
    let dlg = document.getElementById("trashDialog");
    if(!dlg){
      dlg = document.createElement("dialog");
      dlg.id = "trashDialog";
      dlg.className = "share-dialog trash-dialog";
      dlg.innerHTML = `<div class="share-inner">
        <h2>휴지통</h2>
        <p>지운 파일은 30일 동안 여기 있다가 저절로 사라져요.</p>
        <div class="trash-list"></div>
        <div class="share-actions">
          <button type="button" class="btn-ghost" data-empty>비우기</button>
          <button type="button" class="btn-primary" data-close>닫기</button>
        </div>
      </div>`;
      document.body.appendChild(dlg);
      dlg.addEventListener("click", e => {
        if(e.target === dlg || e.target.closest("[data-close]")){ dlg.close(); return; }
        if(e.target.closest("[data-empty]")){
          const ids = BS.trashed.map(p => p.id);
          if(!ids.length) return;
          if(!confirm(`${ids.length}개를 완전히 지울까요? 되돌릴 수 없어요.`)) return;
          BS.purge(ids);
          fillTrash(dlg); render();
          return;
        }
        const row = e.target.closest("[data-trash-id]");
        if(!row) return;
        const id = row.dataset.trashId;
        if(e.target.closest("[data-restore]")){
          BS.restorePlan(id);
          fillTrash(dlg); render();
          toast("버짓보드로 되돌렸어요");
        } else if(e.target.closest("[data-purge]")){
          BS.purge([id]);
          fillTrash(dlg); render();
        }
      });
    }
    fillTrash(dlg);
    dlg.showModal();
  }

  function fillTrash(dlg){
    const list = BS.trashed;
    const box = dlg.querySelector(".trash-list");
    box.innerHTML = list.length ? list.map(p => {
      const left = 30 - Math.floor((Date.now() - p.deletedAt) / 86400000);
      return `<div class="trash-row" data-trash-id="${esc(p.id)}" data-accent="${esc(p.accent || "green")}">
        <span class="file-dot" aria-hidden="true"></span>
        <span class="trash-name">${esc(BS.planLabel(p))}</span>
        <span class="trash-left">${left}일 남음</span>
        <button type="button" data-restore>되돌리기</button>
        <button type="button" class="danger" data-purge aria-label="완전히 지우기">지우기</button>
      </div>`;
    }).join("") : `<p class="trash-empty">휴지통이 비어 있어요.</p>`;
    dlg.querySelector("[data-empty]").hidden = !list.length;
  }

  if(trashBtn) trashBtn.addEventListener("click", openTrash);

  // 메뉴 하나만 열어 둡니다
  document.addEventListener("click", e => {
    document.querySelectorAll(".desk details[open]").forEach(d => {
      if(!d.contains(e.target)) d.open = false;
    });
  });
  document.addEventListener("keydown", e => {
    if(e.key === "Escape") document.querySelectorAll(".desk details[open]").forEach(d => d.open = false);
  });

  newMenu.addEventListener("click", e => {
    const btn = e.target.closest("[data-new]");
    if(btn) createFile(btn.dataset.new);
  });

  let resizeTimer = null;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });

  BS.purgeExpired();
  BS.ready.then(render);
  render();
  if(Auth && Auth.enabled){
    Auth.onChange(async () => {
      if(Auth.user) await BS.mergeWithAccount();
      render();
    });
  }
})();
