/* 버짓리스트 공통 셸 스크립트
   - 상단 바의 현재 메뉴 표시
   - 홈의 '내 예산표' 목록 (브라우저에 저장된 것, 로그인 붙기 전까지)
   로그인이 들어오면 이 파일에서 계정 목록으로 갈아끼웁니다. */
(function(){
  const STORE_KEY = "prep-budget-v2";

  // 현재 페이지에 해당하는 메뉴에 표시
  const here = location.pathname.replace(/\/index\.html$/, "/");
  document.querySelectorAll(".topbar nav a").forEach(a => {
    const target = new URL(a.getAttribute("href"), location.href).pathname.replace(/\/index\.html$/, "/");
    if(target === here) a.setAttribute("aria-current", "page");
  });

  // ---- 내 예산표 (홈에서만) ----
  const listEl = document.getElementById("myPlans");
  if(!listEl) return;

  const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const won = n => (Number(n) || 0).toLocaleString("ko-KR") + "원";

  let store = null;
  try{ store = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); }catch(e){}
  const plans = (store && Array.isArray(store.plans)) ? store.plans : [];

  if(!plans.length){
    listEl.innerHTML = `<p class="my-empty">아직 만든 예산표가 없어요. 위에서 하나 골라 시작해 보세요.</p>`;
    return;
  }

  const sum = p => {
    let budget = 0, count = 0;
    (p.categories || []).forEach(c => (c.items || []).forEach(i => {
      budget += i.budget || 0;
      if(i.name || i.budget || i.actual) count++;
    }));
    return { budget, count };
  };

  listEl.innerHTML = plans.map(p => {
    const { budget, count } = sum(p);
    const guest = p.kind === "guestbook";
    const title = (p.title || "").trim() || "이름 없는 예산표";
    return `<a class="my-plan" href="planner/?id=${encodeURIComponent(p.id)}" data-accent="${esc(p.accent || "green")}">
      <span class="my-dot" aria-hidden="true"></span>
      <span class="my-name">${esc(title)}</span>
      <span class="my-meta">${guest ? "방명록" : "예산표"} · ${count}${guest ? "명" : "개"} · ${won(budget)}</span>
    </a>`;
  }).join("");
})();
