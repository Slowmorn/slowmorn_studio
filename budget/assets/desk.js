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
  const summaryEl = document.querySelector(".desk-summary");
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

  const COLORS = [
    ["green", "녹색"], ["navy", "네이비"], ["pink", "핑크"],
    ["yellow", "노랑"], ["purple", "보라"], ["orange", "주황"]
  ];

  // 자석 크기. 자리를 잡을 때도 이 값을 씁니다.
  const W = 208, H = 108, GAP = 16, PAD = 26;
  const FREE = () => board.clientWidth >= 760;   // 좁으면 자유 배치를 끕니다

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
      b.addEventListener("click", () => { undo(); hide(); });
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
    let slot = 0;
    return plans.map(p => {
      if(p.pos) return { plan: p, ...place(p) };
      const i = slot++;
      return {
        plan: p,
        x: PAD + (i % perRow) * (W + GAP),
        y: PAD + Math.floor(i / perRow) * (H + GAP)
      };
    });
  }

  function ddayHTML(p){
    const n = BS.daysLeft(p.dday);
    if(n === null) return "";
    const label = n === 0 ? "D-DAY" : (n > 0 ? "D-" + n : "D+" + (-n));
    const cls = n < 0 ? " past" : (n <= 14 ? " soon" : "");
    return `<span class="file-dday${cls}" title="${esc((p.ddayLabel || "") + " " + p.dday)}">${label}</span>`;
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
        ${guest ? ICON_GUEST : ICON_BUDGET}
        <span class="file-name">${esc(title)}</span>
        <span class="file-meta">${esc(meta)}</span>
        ${guest || !pr.total ? "" : `<span class="file-bar" aria-label="${pr.done}/${pr.total} 완료">
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
      <p>책상이 비어 있어요. 무엇부터 준비하세요?</p>
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

    renderSummary(plans);
    renderTrashBtn();
    if(!noteEl) return;
    noteEl.textContent = (Auth && Auth.enabled && Auth.user)
      ? "이 계정에 저장돼 있어요. 다른 기기에서 같은 계정으로 로그인하면 이어서 쓸 수 있어요."
      : (Auth && Auth.enabled
        ? "지금은 이 브라우저에만 저장돼요. 로그인하면 다른 기기에서도 이어서 쓸 수 있어요."
        : "이 브라우저에 저장돼요.");
  }

  function renderSummary(plans){
    if(!summaryEl) return;
    if(!plans.length){ summaryEl.textContent = ""; return; }
    let budget = 0, done = 0, total = 0;
    plans.forEach(p => {
      if(BS.isGuest(p)) return;
      budget += BS.summary(p).budget;
      const pr = BS.progress(p);
      done += pr.done; total += pr.total;
    });
    const bits = [`파일 ${plans.length}개`];
    if(budget) bits.push(`총 예산 ${manwon(budget)}`);
    if(total) bits.push(`완료 ${done}/${total}`);
    summaryEl.textContent = bits.join(" · ");
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
    if(btn.dataset.act === "dday"){ openDday(plan); return; }
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

  // ---- 날짜 정하기 ----
  function openDday(plan){
    let dlg = document.getElementById("ddayDialog");
    if(!dlg){
      dlg = document.createElement("dialog");
      dlg.id = "ddayDialog";
      dlg.className = "login-dialog";
      dlg.innerHTML = `<form method="dialog" class="login-inner">
        <h2>언제까지 준비하세요?</h2>
        <p>날짜를 정하면 파일에 남은 날이 표시돼요.</p>
        <label class="dday-field"><span>이름</span>
          <input name="label" type="text" maxlength="12" placeholder="결혼식, 출산 예정일…">
        </label>
        <label class="dday-field"><span>날짜</span>
          <input name="date" type="date" required>
        </label>
        <button type="submit" class="btn-ink dday-save" value="save">정하기</button>
        <button type="button" class="login-close" data-clear>날짜 지우기</button>
        <button type="submit" class="login-close" value="cancel">그만두기</button>
      </form>`;
      document.body.appendChild(dlg);
      dlg.addEventListener("click", e => {
        if(!e.target.closest("[data-clear]")) return;
        BS.setDday(dlg.dataset.pid, null);
        dlg.close("cleared");
      });
      dlg.addEventListener("close", () => {
        if(dlg.returnValue === "save"){
          const f = dlg.querySelector("form");
          BS.setDday(dlg.dataset.pid, f.date.value, f.label.value.trim());
        }
        render();
      });
    }
    dlg.dataset.pid = plan.id;
    const f = dlg.querySelector("form");
    f.label.value = plan.ddayLabel || (BS.isGuest(plan) ? "결혼식" : "");
    f.date.value = plan.dday || "";
    dlg.querySelector("[data-clear]").hidden = !plan.dday;
    dlg.showModal();
  }

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
          toast("책상으로 되돌렸어요");
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
