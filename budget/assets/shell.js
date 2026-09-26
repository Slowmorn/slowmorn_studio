/* 버짓리스트 공통 셸 스크립트
   - 상단 바의 현재 메뉴 표시
   - 로그인 버튼과 로그인 창 (assets/auth.js 가 실제 통신을 맡습니다)
   - 홈의 파일 목록은 assets/desk.js 가 맡습니다 */
(function(){
  const Auth = window.BudgetAuth;
  // 이 파일은 /budget/assets/ 에 있으므로 두 단계 올라가면 사이트 최상위입니다
  const root = new URL("../../", (document.currentScript && document.currentScript.src) || location.href).pathname;
  const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---- 현재 페이지 메뉴 표시 ----
  const here = location.pathname.replace(/\/index\.html$/, "/");
  document.querySelectorAll(".topbar nav a").forEach(a => {
    const target = new URL(a.getAttribute("href"), location.href).pathname.replace(/\/index\.html$/, "/");
    if(target === here) a.setAttribute("aria-current", "page");
  });

  // ---- 로그인 버튼 ----
  const slot = document.getElementById("authSlot");
  function renderAuth(){
    if(!slot || !Auth || !Auth.enabled) return;
    const user = Auth.user;
    if(user){
      const meta = user.user_metadata || {};
      const name = meta.name || meta.full_name || meta.nickname || meta.preferred_username || "내 계정";
      slot.innerHTML = `<details class="auth-menu">
        <summary class="auth-btn" aria-label="계정 메뉴">
          ${meta.avatar_url ? `<img src="${esc(meta.avatar_url)}" alt="" width="22" height="22">` : `<span class="auth-dot" aria-hidden="true"></span>`}
          <span class="auth-name">${esc(name)}</span>
        </summary>
        <div class="auth-pop">
          <p class="auth-hint">예산표가 이 계정에 저장돼요</p>
          <button type="button" data-auth="out">로그아웃</button>
          <button type="button" class="auth-danger" data-auth="delete">계정 삭제</button>
        </div>
      </details>`;
    } else {
      slot.innerHTML = `<button type="button" class="auth-btn" data-auth="in">로그인</button>`;
    }
  }

  function openLogin(){
    let dlg = document.getElementById("loginDialog");
    if(!dlg){
      dlg = document.createElement("dialog");
      dlg.id = "loginDialog";
      dlg.className = "login-dialog";
      dlg.innerHTML = `<div class="login-inner">
        <h2>로그인</h2>
        <p>로그인하면 만든 예산표가 계정에 저장돼서, 휴대폰이나 다른 기기에서도 이어서 쓸 수 있어요.</p>
        ${(window.BUDGET_CONFIG || {}).kakao ? `<button type="button" class="login-kakao" data-provider="kakao">카카오로 시작하기</button>` : ""}
        <button type="button" class="login-google" data-provider="google">구글로 시작하기</button>
        <p class="login-note">로그인 전에 만든 예산표는 로그인할 때 계정으로 함께 옮겨져요.</p>
        <p class="login-note">로그인하면 <a href="${root}budget/terms/">이용약관</a>과 <a href="${root}budget/privacy/">개인정보 처리방침</a>에 동의하는 것으로 봅니다.</p>
        <button type="button" class="login-close" data-close>닫기</button>
      </div>`;
      document.body.appendChild(dlg);
      dlg.addEventListener("click", e => {
        if(e.target === dlg || e.target.closest("[data-close]")){ dlg.close(); return; }
        const btn = e.target.closest("[data-provider]");
        if(btn) Auth.signIn(btn.dataset.provider);
      });
    }
    dlg.showModal();
  }

  function openDelete(){
    let dlg = document.getElementById("deleteDialog");
    if(!dlg){
      dlg = document.createElement("dialog");
      dlg.id = "deleteDialog";
      dlg.className = "login-dialog";
      dlg.innerHTML = `<div class="login-inner">
        <h2>계정을 지울까요?</h2>
        <p id="deleteWhat">계정에 저장된 예산표가 모두 함께 지워져요.</p>
        <p>되돌릴 수 없고, 같이 쓰자고 보낸 링크도 더는 열리지 않아요.</p>
        <p class="login-note">이 브라우저에 남아 있는 사본은 지워지지 않아요. 예산표 화면에서 탭을 닫으시면 됩니다.</p>
        <button type="button" class="login-danger" data-del>계정 지우기</button>
        <button type="button" class="login-close" data-close>그만두기</button>
      </div>`;
      document.body.appendChild(dlg);
      dlg.addEventListener("click", async e => {
        if(e.target === dlg || e.target.closest("[data-close]")){ dlg.close(); return; }
        const btn = e.target.closest("[data-del]");
        if(!btn) return;
        btn.disabled = true;
        btn.textContent = "지우는 중…";
        const res = await Auth.deleteAccount();
        btn.disabled = false;
        btn.textContent = "계정 지우기";
        if(res && res.error){ alert("계정을 지우지 못했어요: " + res.error); return; }
        dlg.close();
        location.href = root + "budget/";
      });
    }
    // 몇 개가 지워지는지 먼저 알려 줍니다
    const what = dlg.querySelector("#deleteWhat");
    what.textContent = "계정에 저장된 예산표가 모두 함께 지워져요.";
    Auth.listPlans().then(plans => {
      if(plans) what.textContent = `계정에 저장된 예산표 ${plans.length}개가 함께 지워져요.`;
    }).catch(() => {});
    dlg.showModal();
  }

  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-auth]");
    if(!btn) return;
    document.querySelectorAll("details.auth-menu[open]").forEach(d => d.open = false);
    if(btn.dataset.auth === "in") openLogin();
    if(btn.dataset.auth === "out"){
      // 아직 안 올린 변경을 올린 뒤 나갑니다. 나가면 이 브라우저의 계정 사본은 지워져요.
      const BS = window.BudgetStore;
      Promise.resolve(BS && BS.flushAccount && BS.flushAccount()).catch(() => {}).then(() => Auth.signOut());
    }
    if(btn.dataset.auth === "delete") openDelete();
  });

  // ---- 날짜 정하기 ----
  // 책상과 체크리스트가 같은 창을 씁니다. 여는 쪽에서 끝난 뒤 할 일을 넘겨 주세요.
  const BS = window.BudgetStore;
  let ddayDone = null;
  function openDday(plan, onDone){
    ddayDone = onDone || null;
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
        <!-- 날짜 칸이 required 라서, 빈 채로 그만두려면 검사를 건너뛰어야 창이 닫힙니다 -->
        <button type="submit" class="login-close" value="cancel" formnovalidate>그만두기</button>
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
        if(ddayDone) ddayDone();
      });
    }
    dlg.dataset.pid = plan.id;
    const f = dlg.querySelector("form");
    f.label.value = plan.ddayLabel || (BS.isGuest(plan) ? "결혼식" : "");
    f.date.value = plan.dday || "";
    dlg.querySelector("[data-clear]").hidden = !plan.dday;
    dlg.showModal();
  }
  window.BudgetShell = { openDday, openLogin };

  // 홈의 파일 목록은 assets/desk.js 가 그립니다.
  renderAuth();
  if(Auth && Auth.enabled){
    Auth.onChange(renderAuth);
    Auth.init();
  }
})();
