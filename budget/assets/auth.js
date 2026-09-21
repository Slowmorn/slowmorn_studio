/* 버짓리스트 로그인과 동기화 (Supabase)
   - 설정이 비어 있으면 아무것도 하지 않습니다. 사이트는 지금까지처럼 브라우저 저장만으로 동작합니다.
   - 로그인하면 예산표가 계정에 저장되고, 다른 기기에서 같은 계정으로 이어서 쓸 수 있습니다.
   다른 스크립트는 window.BudgetAuth 로 접근합니다. */
(function(){
  const CFG = window.BUDGET_CONFIG || {};
  const ENABLED = !!(CFG.supabaseUrl && CFG.supabaseKey);
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";

  const listeners = new Set();
  let client = null, session = null, ready = null;

  const notify = () => listeners.forEach(fn => { try{ fn(session); }catch(e){} });

  function loadScript(src){
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error("스크립트를 불러오지 못했어요: " + src));
      document.head.appendChild(el);
    });
  }

  // 로그인 화면이 필요할 때만 SDK를 받아옵니다 (첫 화면을 가볍게)
  async function getClient(){
    if(!ENABLED) return null;
    if(client) return client;
    if(!ready){
      ready = (async () => {
        if(!window.supabase) await loadScript(SDK_URL);
        client = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        const { data } = await client.auth.getSession();
        session = data.session || null;
        client.auth.onAuthStateChange((_event, s) => { session = s || null; notify(); });
        return client;
      })().catch(err => { ready = null; throw err; });
    }
    await ready;
    return client;
  }

  // 돌아온 주소에 토큰이 있거나 이미 로그인한 적이 있으면 조용히 세션을 복구합니다
  function hasStoredSession(){
    try{
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(k && k.startsWith("sb-") && k.endsWith("-auth-token")) return true;
      }
    }catch(e){}
    return /[#&](access_token|error)=/.test(location.hash) || /[?&]code=/.test(location.search);
  }

  async function signIn(provider){
    const sb = await getClient();
    if(!sb) return;
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: location.href.split("#")[0] }
    });
    if(error) alert("로그인을 시작하지 못했어요: " + error.message);
  }

  async function signOut(){
    const sb = await getClient();
    if(!sb) return;
    await sb.auth.signOut();
    session = null;
    notify();
  }

  // ---- 예산표 읽고 쓰기 ----
  const rowToPlan = row => Object.assign({}, row.data, { id: row.id, title: row.title, kind: row.kind || undefined });
  const planToRow = (plan, i, userId) => ({
    id: plan.id,
    user_id: userId,
    title: (plan.title || "").trim(),
    kind: plan.kind || "budget",
    position: i,
    data: plan,
    updated_at: new Date().toISOString()
  });

  async function listPlans(){
    const sb = await getClient();
    if(!sb || !session) return null;
    const { data, error } = await sb.from("plans").select("*").order("position", { ascending: true });
    if(error){ console.warn("예산표를 불러오지 못했어요:", error.message); return null; }
    return data.map(rowToPlan);
  }

  async function savePlans(plans){
    const sb = await getClient();
    if(!sb || !session) return false;
    const rows = plans.map((p, i) => planToRow(p, i, session.user.id));
    const { error } = await sb.from("plans").upsert(rows, { onConflict: "id" });
    if(error){ console.warn("저장하지 못했어요:", error.message); return false; }
    return true;
  }

  async function removePlans(ids){
    const sb = await getClient();
    if(!sb || !session || !ids.length) return;
    const { error } = await sb.from("plans").delete().in("id", ids);
    if(error) console.warn("삭제하지 못했어요:", error.message);
  }

  window.BudgetAuth = {
    enabled: ENABLED,
    get session(){ return session; },
    get user(){ return session && session.user; },
    onChange(fn){ listeners.add(fn); return () => listeners.delete(fn); },
    getClient, signIn, signOut, listPlans, savePlans, removePlans,
    // 페이지가 열릴 때: 이미 로그인한 흔적이 있으면 세션을 복구합니다
    async init(){
      if(!ENABLED || !hasStoredSession()) return null;
      try{ await getClient(); }catch(e){ console.warn(e); }
      notify();
      return session;
    }
  };
})();
