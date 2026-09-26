/* 버짓리스트 파일 보관소
   예산표 하나가 파일 하나입니다. 책상(홈)과 체크리스트 화면이 같은 이 모듈을 씁니다.
   브라우저 저장이 먼저고, 로그인했을 때만 계정에도 같이 올립니다.

   보드는 두 개예요. 로그인 전 보드(STORE_KEY)와 계정 보드의 사본(ACCT_KEY).
   로그인하면 계정 보드로 바꿔 끼우고, 로그아웃하면 사본을 지우고 로그인 전 보드로 돌아갑니다.
   저장 형태: { activeId, plans: [plan, …] } (계정 사본은 uid 가 더 붙어요)
   다른 스크립트는 window.BudgetStore 로 접근합니다. assets/auth.js 다음에 읽습니다. */
(function(){
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  const STORE_KEY = "prep-budget-v2";
  const LEGACY_KEY = "prep-budget-v1";   // 예산표 하나만 담던 옛 형식. 처음 열 때 한 번 옮깁니다.
  const ACCT_KEY = "prep-budget-account"; // 로그인한 계정 보드의 사본
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

  // 새 파일의 색은 여섯 가지 중 하나를 고릅니다. 바로 전에 만든 파일과는 겹치지 않게 해요.
  const ACCENTS = ["orange", "navy", "green", "pink", "purple", "teal"];
  // 예전 팔레트의 키를 지금 색으로 옮깁니다
  const OLD_ACCENT = { yellow: "orange", lime: "green" };
  const accentKey = k => OLD_ACCENT[k] || (ACCENTS.includes(k) ? k : "green");
  function randomAccent(){
    const last = data.plans[data.plans.length - 1]; // 새 파일은 늘 끝에 붙어요
    const pool = ACCENTS.filter(k => !last || k !== last.accent);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function fromTemplate(key){
    const t = byKey[key] || BLANK;
    return {
      title: t.title,
      accent: randomAccent(),
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

  // 이름도 내용도 그대로인 새 파일인지 (저절로 생긴 빈 파일은 계정으로 옮기지 않아요)
  const hasContent = i => i.name || i.budget || i.actual || (i.options && i.options.length);
  const isTouched = p => (p.title || "") !== "새 예산표"
    || (p.categories || []).some(c => (c.items || []).some(hasContent))
    || !(p.categories || []).every(c => !c.name || c.name === "첫 번째 카테고리");

  // ---- 불러오기 ----
  const readJSON = k => { try{ const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }catch(e){ return null; } };
  const tidy = s => { s.plans.forEach(p => { if(p.accent) p.accent = accentKey(p.accent); }); return s; };

  let mode = "guest", acctUid = null;   // 지금 보고 있는 보드

  function load(){
    // 로그인한 채로 떠났으면 계정 보드의 사본부터 보여 줍니다 (세션이 없으면 사본을 버려요)
    const acct = readJSON(ACCT_KEY);
    if(acct && Array.isArray(acct.plans)){
      if(Auth && Auth.enabled && Auth.hasStoredSession && Auth.hasStoredSession()){
        mode = "account"; acctUid = acct.uid || null;
        return tidy({ activeId: acct.activeId || null, plans: acct.plans });
      }
      try{ localStorage.removeItem(ACCT_KEY); }catch(e){}
    }
    return loadGuest();
  }

  function loadGuest(){
    try{
      const s = readJSON(STORE_KEY);
      if(s && Array.isArray(s.plans) && s.plans.length) return tidy(s);
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
    try{
      if(mode === "account") localStorage.setItem(ACCT_KEY, JSON.stringify({ uid: acctUid, activeId: data.activeId, plans: data.plans }));
      else localStorage.setItem(STORE_KEY, JSON.stringify(data));
    }catch(e){}
  }

  function save(plan){
    if(plan) plan.updatedAt = Date.now();
    clearTimeout(localTimer);
    localTimer = setTimeout(saveLocalNow, 250);
    saveToAccount();
  }

  // 로그인했을 때만 계정에도 올립니다. 실패해도 브라우저 저장은 그대로예요.
  function saveToAccount(){
    if(mode !== "account" || !(Auth && Auth.enabled && Auth.user)) return;
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

  // 로그인했을 때: 계정 보드로 바꿔 끼웁니다.
  // 계정이 비어 있으면(첫 로그인) 로그인 전에 만든 파일을 계정으로 옮기고,
  // 계정에 파일이 있으면 로그인 전 보드는 그대로 두었다가 로그아웃하면 다시 보여 줘요.
  // 화면 갱신은 부르는 쪽에서 합니다. 보드를 바꿨으면 true 를 돌려줍니다.
  async function mergeWithAccount(){
    if(!(Auth && Auth.enabled && Auth.user)) return false;
    const mine = await Auth.listPlans();
    if(!mine) return false;
    const u = Auth.user.id;
    const byId = new Map(mine.map(p => [p.id, p]));
    let plans = mine, upload = false;
    if(mode === "account" && acctUid === u){
      // 같은 계정: 계정이 기준이고, 이 기기에서 아직 못 올린 파일만 더합니다
      const localOnly = data.plans.filter(p => !byId.has(p.id));
      if(localOnly.length){ plans = mine.concat(localOnly); upload = true; }
    } else {
      if(mode === "guest"){ clearTimeout(localTimer); saveLocalNow(); }   // 로그인 전 보드를 마저 저장
      // 예전 방식으로 합쳐졌던 계정 파일은 로그인 전 보드에서 뺍니다
      const guest = (loadGuest().plans || []).filter(p => !byId.has(p.id));
      const moving = mine.length ? [] : guest.filter(p => !p.deletedAt && isTouched(p));
      writeGuest(guest.filter(p => !moving.includes(p)));
      if(moving.length){ plans = moving; upload = true; }
    }
    const active = plans.some(p => p.id === data.activeId && !p.deletedAt) ? data.activeId
      : ((plans.find(p => !p.deletedAt) || {}).id || null);
    mode = "account"; acctUid = u;
    data.plans = plans; data.activeId = active;
    saveLocalNow();
    if(upload) Auth.savePlans(data.plans);
    return true;
  }

  function writeGuest(plans){
    try{
      if(plans.length) localStorage.setItem(STORE_KEY, JSON.stringify({ activeId: (plans.find(p => !p.deletedAt) || plans[0]).id, plans }));
      else localStorage.removeItem(STORE_KEY);
    }catch(e){}
  }

  // 로그인 전 보드에 남은 파일 (계정 보드를 보는 동안에만 의미가 있어요)
  function guestPlans(){
    if(mode !== "account") return [];
    return (loadGuest().plans || []).filter(p => !p.deletedAt && isTouched(p));
  }

  // 로그인 전 파일이 남아 있으면 한 번만(탭마다) 가져올지 물어봐요. 물어볼 개수를 돌려줍니다.
  function offerImport(){
    const n = guestPlans().filter(p => !find(p.id)).length;
    if(!n) return 0;
    try{ if(sessionStorage.getItem("prep-budget-import-asked")) return 0; sessionStorage.setItem("prep-budget-import-asked", "1"); }catch(e){}
    return n;
  }

  // 로그인 전 파일을 계정 보드로 옮깁니다
  function importGuest(){
    const moving = guestPlans().filter(p => !find(p.id));
    if(!moving.length) return 0;
    data.plans.push(...moving);
    writeGuest([]);
    saveLocalNow();
    if(Auth && Auth.user) Auth.savePlans(data.plans);
    return moving.length;
  }

  // 로그아웃하기 전에 아직 안 올린 변경을 올립니다
  async function flushAccount(){
    if(mode !== "account" || !(Auth && Auth.user)) return;
    clearTimeout(cloudTimer);
    await Auth.savePlans(data.plans);
  }

  // 로그아웃했을 때: 계정 사본을 지우고 로그인 전 보드로 돌아갑니다
  function leaveAccount(){
    if(mode !== "account") return false;
    clearTimeout(localTimer); clearTimeout(cloudTimer);
    try{ localStorage.removeItem(ACCT_KEY); }catch(e){}
    mode = "guest"; acctUid = null;
    const g = loadGuest();
    data.plans = g.plans; data.activeId = g.activeId || null;
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
    nid, newPlan, fromTemplate, accentKey, safeLink, planLabel, isGuest, summary, progress, daysLeft,
    find, indexOf,
    save, saveLocalNow, saveToAccount,
    addPlan, addExisting, removePlan, restorePlan, purge, purgeExpired,
    duplicate, rename, setAccent, setPos, setDday,
    isTouched, mergeWithAccount, leaveAccount, flushAccount, guestPlans, importGuest, offerImport,
    get signedInBoard(){ return mode === "account"; }
  };
  window.BudgetStore = API;
})();
