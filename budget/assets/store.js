/* 버짓리스트 파일 보관소
   예산표 하나가 파일 하나입니다. 책상(홈)과 체크리스트 화면이 같은 이 모듈을 씁니다.
   브라우저 저장이 먼저고, 로그인했을 때만 계정에도 같이 올립니다.

   저장 형태는 예전 그대로입니다: { activeId, plans: [plan, …] }
   다른 스크립트는 window.BudgetStore 로 접근합니다. assets/auth.js 다음에 읽습니다. */
(function(){
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  const STORE_KEY = "prep-budget-v2";
  const LEGACY_KEY = "prep-budget-v1";   // 예산표 하나만 담던 옛 형식. 처음 열 때 한 번 옮깁니다.
  const Auth = window.BudgetAuth;

  let uid = Date.now();
  const nid = () => (uid++).toString(36);

  function safeLink(raw){
    let s = String(raw || "").trim();
    if(!s) return "";
    if(!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
    try{
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
    }catch(e){ return ""; }
  }

  // ---- 템플릿 ----
  // assets/templates.json 한 곳에서만 관리합니다 (template-editor.html 로 편집).
  // [{ id, label, desc, title, intro, kind: "budget" | "guestbook", categories: […] }]
  let templates = [], byKey = {};
  const BLANK = { title: "새 예산표", categories: [{ name: "첫 번째 카테고리", items: [{ name: "" }] }] };

  const ready = (async () => {
    try{
      const res = await fetch(new URL("templates.json", HERE));
      if(!res.ok) throw new Error("HTTP " + res.status);
      templates = await res.json();
    }catch(e){
      console.warn("템플릿을 불러오지 못했어요:", e);
      templates = [];
    }
    byKey = Object.fromEntries(templates.map(t => [t.id, t]));
    API.templates = templates;
    return templates;
  })();

  function fromTemplate(key){
    const t = byKey[key] || BLANK;
    return {
      title: t.title,
      intro: t.intro || "",
      kind: t.kind === "guestbook" ? "guestbook" : undefined,
      template: byKey[key] ? key : undefined,
      categories: (t.categories || []).map(c => ({
        id: nid(), name: c.name,
        items: ((c.items || []).length ? c.items : [{ name: "" }]).map(n => {
          const src = typeof n === "string" ? { name: n } : n;
          const it = { id: nid(), name: src.name || "", budget: src.budget || 0, actual: 0, done: false };
          if(src.qty > 1) it.qty = src.qty;
          if(src.options && src.options.length){
            it.options = src.options.map(o => ({ id: nid(), name: o.name, link: safeLink(o.link), price: o.price || 0, note: o.note || "" }));
          }
          return it;
        })
      }))
    };
  }

  const newPlan = data => Object.assign({ title: "새 예산표", categories: [] }, data, { id: (data && data.id) || nid() });
  const planLabel = p => ((p && p.title) || "").trim() || "이름 없는 예산표";
  const isGuest = p => !!(p && p.kind === "guestbook");

  // 카드에 보여 줄 한 줄 요약
  function summary(p){
    let budget = 0, count = 0;
    ((p && p.categories) || []).forEach(c => (c.items || []).forEach(i => {
      budget += i.budget || 0;
      if(i.name || i.budget || i.actual) count++;
    }));
    return { budget, count };
  }

  // ---- 불러오기 ----
  function load(){
    try{
      const raw = localStorage.getItem(STORE_KEY);
      if(raw){
        const s = JSON.parse(raw);
        if(s && Array.isArray(s.plans) && s.plans.length) return s;
      }
      const legacy = localStorage.getItem(LEGACY_KEY);
      if(legacy){
        const old = JSON.parse(legacy);
        if(old && Array.isArray(old.categories)){
          const plan = newPlan(old);
          return { activeId: plan.id, plans: [plan] };
        }
      }
    }catch(e){}
    return { activeId: null, plans: [] };
  }

  const data = load();

  const find = id => data.plans.find(p => p.id === id) || null;
  const indexOf = id => data.plans.findIndex(p => p.id === id);

  // ---- 저장 ----
  let localTimer = null, cloudTimer = null;

  function saveLocalNow(){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(data)); }catch(e){}
  }

  function save(plan){
    if(plan) plan.updatedAt = Date.now();
    clearTimeout(localTimer);
    localTimer = setTimeout(saveLocalNow, 250);
    saveToAccount();
  }

  // 로그인했을 때만 계정에도 올립니다. 실패해도 브라우저 저장은 그대로예요.
  function saveToAccount(){
    if(!(Auth && Auth.enabled && Auth.user)) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => { Auth.savePlans(data.plans); }, 1500);
  }

  // ---- 파일 다루기 ----
  function addPlan(tplKey){
    const plan = newPlan(fromTemplate(tplKey || "blank"));
    plan.updatedAt = Date.now();
    data.plans.push(plan);
    data.activeId = plan.id;
    saveLocalNow();
    saveToAccount();
    return plan;
  }

  function addExisting(plan){
    data.plans.push(plan);
    data.activeId = plan.id;
    saveLocalNow();
    saveToAccount();
    return plan;
  }

  // ---- 휴지통 ----
  // 지운 파일은 목록에 남겨 두고 deletedAt 만 찍습니다. 계정 동기화가 그대로 따라오고,
  // 30일이 지난 것만 진짜로 지웁니다.
  const TRASH_DAYS = 30;
  const live = () => data.plans.filter(p => !p.deletedAt);
  const trashed = () => data.plans.filter(p => p.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);

  function removePlan(id){
    const plan = find(id);
    if(!plan || plan.deletedAt) return null;
    plan.deletedAt = Date.now();
    if(data.activeId === id) data.activeId = (live()[0] || {}).id || null;
    saveLocalNow();
    saveToAccount();
    return plan;
  }

  function restorePlan(id){
    const plan = find(id);
    if(!plan) return null;
    delete plan.deletedAt;
    saveLocalNow();
    saveToAccount();
    return plan;
  }

  // 되돌릴 수 없는 삭제
  function purge(ids){
    const gone = [];
    (ids || []).forEach(id => {
      const i = indexOf(id);
      if(i >= 0) gone.push(data.plans.splice(i, 1)[0].id);
    });
    if(!gone.length) return 0;
    if(!data.plans.some(p => p.id === data.activeId)) data.activeId = (live()[0] || {}).id || null;
    saveLocalNow();
    if(Auth && Auth.enabled && Auth.user) Auth.removePlans(gone);
    return gone.length;
  }

  // 30일 지난 것은 열 때 알아서 비웁니다
  function purgeExpired(){
    const cut = Date.now() - TRASH_DAYS * 86400000;
    return purge(trashed().filter(p => p.deletedAt < cut).map(p => p.id));
  }

  // ---- 책상 위 자리와 D-day ----
  function setPos(id, x, y){
    const p = find(id);
    if(!p) return null;
    p.pos = { x: Math.round(x), y: Math.round(y) };
    save(p);
    return p;
  }

  function setDday(id, date, label){
    const p = find(id);
    if(!p) return null;
    if(date){ p.dday = date; p.ddayLabel = label || ""; }
    else { delete p.dday; delete p.ddayLabel; }
    save(p);
    return p;
  }

  // 남은 날. 오늘이면 0, 지났으면 음수.
  function daysLeft(dateStr){
    if(!dateStr) return null;
    const [y, m, d] = String(dateStr).split("-").map(Number);
    if(!y || !m || !d) return null;
    const then = new Date(y, m - 1, d);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    then.setHours(0, 0, 0, 0);
    return Math.round((then - now) / 86400000);
  }

  // 체크리스트 진행률 — 내용이 있는 항목 중 끝낸 것
  function progress(p){
    let total = 0, done = 0;
    ((p && p.categories) || []).forEach(c => (c.items || []).forEach(i => {
      if(!(i.name || i.budget || i.actual)) return;
      total++;
      if(i.done) done++;
    }));
    return { total, done, ratio: total ? done / total : 0 };
  }

  function duplicate(id){
    const src = find(id);
    if(!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = nid();
    copy.title = planLabel(src) + " 사본";
    copy.updatedAt = Date.now();
    delete copy.owner;
    // 안에 있는 id 도 새로 뽑습니다. 같은 id 가 두 벌이면 드래그와 저장이 엉켜요.
    (copy.categories || []).forEach(c => {
      c.id = nid();
      (c.items || []).forEach(it => {
        it.id = nid();
        (it.options || []).forEach(o => { o.id = nid(); });
      });
    });
    delete copy.pos;   // 원본 위에 겹치지 않도록 자리는 다시 잡습니다
    data.plans.splice(indexOf(id) + 1, 0, copy);
    data.activeId = copy.id;
    saveLocalNow();
    saveToAccount();
    return copy;
  }

  function rename(id, title){
    const p = find(id);
    if(!p) return null;
    p.title = title;
    save(p);
    return p;
  }

  function setAccent(id, accent){
    const p = find(id);
    if(!p) return null;
    p.accent = accent;
    save(p);
    return p;
  }

  // 로그인 직후: 계정의 파일과 이 브라우저의 파일을 합칩니다.
  // 화면 갱신은 부르는 쪽에서 합니다. 바뀐 게 있으면 true 를 돌려줍니다.
  async function mergeWithAccount(){
    if(!(Auth && Auth.enabled && Auth.user)) return false;
    const mine = await Auth.listPlans();
    if(!mine) return false;
    const byId = new Map(mine.map(p => [p.id, p]));
    let changed = false;
    data.plans.forEach(p => { if(!byId.has(p.id)){ byId.set(p.id, p); changed = true; } }); // 이 브라우저에만 있던 것
    const merged = [...byId.values()];
    if(merged.length !== data.plans.length) changed = true;
    data.plans = merged;
    if(!data.plans.some(p => p.id === data.activeId)) data.activeId = (live()[0] || {}).id || null;
    saveLocalNow();
    if(changed) Auth.savePlans(data.plans);
    return true;
  }

  const API = {
    ready, templates,
    get plans(){ return data.plans; },
    get activeId(){ return data.activeId; },
    set activeId(v){ data.activeId = v; },
    data,
    get live(){ return live(); },
    get trashed(){ return trashed(); },
    nid, newPlan, fromTemplate, safeLink, planLabel, isGuest, summary, progress, daysLeft,
    find, indexOf,
    save, saveLocalNow, saveToAccount,
    addPlan, addExisting, removePlan, restorePlan, purge, purgeExpired,
    duplicate, rename, setAccent, setPos, setDday,
    mergeWithAccount
  };
  window.BudgetStore = API;
})();
