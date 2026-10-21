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

  // 계정과 그 계정에 저장된 예산표를 모두 지웁니다 (되돌릴 수 없습니다)
  async function deleteAccount(){
    const sb = await getClient();
    if(!sb || !session) return { error: "로그인이 필요해요" };
    const { error } = await sb.rpc("delete_my_account");
    if(error){ console.warn("탈퇴하지 못했어요:", error); return { error: error.message || String(error) }; }
    try{ await sb.auth.signOut(); }catch(e){}
    session = null;
    notify();
    return { ok: true };
  }

  // ---- 예산표 읽고 쓰기 ----
  // 공유받은 예산표는 주인이 따로 있으므로 주인 id를 함께 들고 다닙니다
  // 버짓보드 위 카드 자리(pos)는 사람마다 따로예요. data.pos 는 주인의 자리, data.posBy[사람 id] 는 같이 쓰는 사람의 자리.
  // 앱 안에서는 늘 pos 가 '내 자리'이고, 주고받을 때만 여기서 바꿔 끼웁니다.
  const meId = () => session && session.user && session.user.id;
  const rowToPlan = row => {
    const plan = Object.assign({}, row.data, {
      id: row.id, title: row.title, kind: row.kind || undefined, owner: row.user_id, updatedAt: Date.parse(row.updated_at) || undefined
    });
    const me = meId();
    if(me && row.user_id !== me){
      plan.ownerPos = plan.pos;   // 주인의 자리는 건드리지 않고 그대로 돌려보내요
      const mine = plan.posBy && plan.posBy[me];
      if(mine) plan.pos = mine; else delete plan.pos;
    }
    return plan;
  };
  const planToRow = (plan, i, userId) => {
    const owner = plan.owner || userId;
    const data = Object.assign({}, plan);
    delete data.ownerPos;
    if(owner !== userId){
      data.posBy = Object.assign({}, plan.posBy);
      if(plan.pos) data.posBy[userId] = plan.pos; else delete data.posBy[userId];
      if(plan.ownerPos) data.pos = plan.ownerPos; else delete data.pos;
    }
    return {
      id: plan.id,
      user_id: owner,
      title: (plan.title || "").trim(),
      kind: plan.kind || "budget",
      position: i,
      data,
      updated_at: new Date().toISOString()
    };
  };
  // 실시간으로 받은 줄이 내가 가진 것과 같은지 (내가 방금 저장한 것이면 다시 불러올 필요가 없어요)
  const sameAsMine = (row, plan) => {
    const strip = p => { const c = Object.assign({}, p); delete c.updatedAt; return JSON.stringify(c); };
    return !!plan && strip(rowToPlan(row)) === strip(plan);
  };

  async function listPlans(){
    const sb = await getClient();
    if(!sb || !session) return null;
    const { data, error } = await sb.from("plans").select("*").order("position", { ascending: true });
    if(error){ console.warn("예산표를 불러오지 못했어요:", error.message); return null; }
    return data.map(rowToPlan);
  }

  async function savePlans(plans){
    const sb = await getClient();
    if(!sb || !session) return { error: "로그인이 필요해요" };
    const me = session.user.id;
    const rows = plans.map((p, i) => planToRow(p, i, me));
    // 내 예산표는 upsert(없으면 추가, 있으면 수정)로 한꺼번에 올립니다.
    // 공유받은 예산표는 update 로만 고쳐요. upsert 는 '추가' 규칙(내가 주인일 것)도 검사해서,
    // 주인이 아닌 사람이 올리면 "new row violates row-level security policy" 로 막혀요.
    // 순서(position)는 주인의 버짓보드 것이라 건드리지 않습니다.
    const mine = rows.filter(r => r.user_id === me), shared = rows.filter(r => r.user_id !== me);
    const failed = [];
    if(mine.length){
      const { error } = await sb.from("plans").upsert(mine, { onConflict: "id" });
      if(error){
        // 하나라도 막히면 전부 저장되지 않아요. 하나씩 다시 올려서 나머지는 저장되게 합니다.
        console.warn("저장하지 못했어요:", error);
        for(const row of mine){
          const r = await sb.from("plans").upsert(row, { onConflict: "id" });
          if(r.error){ failed.push(row.id); console.warn(`'${row.title || row.id}'을(를) 저장하지 못했어요:`, r.error.message); }
        }
      }
    }
    await Promise.all(shared.map(async row => {
      const { error } = await sb.from("plans")
        .update({ title: row.title, kind: row.kind, data: row.data, updated_at: row.updated_at })
        .eq("id", row.id);
      if(error){ failed.push(row.id); console.warn(`공유받은 '${row.title || row.id}'을(를) 저장하지 못했어요:`, error.message); }
    }));
    return failed.length ? { error: "일부 예산표를 저장하지 못했어요", failed } : { ok: true };
  }

  async function removePlans(ids){
    const sb = await getClient();
    if(!sb || !session || !ids.length) return;
    const { error } = await sb.from("plans").delete().in("id", ids);
    if(error) console.warn("삭제하지 못했어요:", error.message);
  }

  // ---- 공유 ----
  async function createInvite(planId){
    const sb = await getClient();
    if(!sb || !session) return { error: "로그인이 필요해요" };
    const { data, error } = await sb.from("plan_invites").insert({ plan_id: planId }).select("token").single();
    if(error){ console.warn("초대 링크를 만들지 못했어요:", error); return { error: error.message || String(error) }; }
    return { token: data.token };
  }

  async function acceptInvite(token){
    const sb = await getClient();
    if(!sb || !session) return null;
    const { data, error } = await sb.rpc("accept_plan_invite", { invite_token: token });
    if(error){ console.warn("초대를 받지 못했어요:", error.message); return { error: error.message }; }
    return { planId: data };
  }

  // 내가 초대 링크를 만든 예산표 (같이 쓰는 중일 수 있는 것)
  async function sharedPlanIds(){
    const sb = await getClient();
    if(!sb || !session) return [];
    const { data, error } = await sb.from("plan_invites").select("plan_id");
    if(error){ console.warn("초대 목록을 불러오지 못했어요:", error.message); return []; }
    return [...new Set(data.map(r => r.plan_id))];
  }

  // 다른 사람이 이 예산표를 저장하면 알려 줍니다 (같은 예산표를 함께 쓸 때만 부릅니다)
  async function watchPlans(onChange, planId){
    const sb = await getClient();
    if(!sb || !session || !planId) return () => {};
    const channel = sb.channel("plan-" + planId)
      .on("postgres_changes", { event: "*", schema: "public", table: "plans", filter: "id=eq." + planId }, payload => {
        try{ onChange(payload); }catch(e){}
      })
      .subscribe();
    return () => { try{ sb.removeChannel(channel); }catch(e){} };
  }

  window.BudgetAuth = {
    enabled: ENABLED,
    get session(){ return session; },
    get user(){ return session && session.user; },
    onChange(fn){ listeners.add(fn); return () => listeners.delete(fn); },
    hasStoredSession,
    getClient, signIn, signOut, deleteAccount,
    listPlans, savePlans, removePlans, sameAsMine, createInvite, acceptInvite, watchPlans, sharedPlanIds,
    // 페이지가 열릴 때: 이미 로그인한 흔적이 있으면 세션을 복구합니다
    async init(){
      if(!ENABLED || !hasStoredSession()) return null;
      try{ await getClient(); }catch(e){ console.warn(e); }
      notify();
      return session;
    }
  };
})();
