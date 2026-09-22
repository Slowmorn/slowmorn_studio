-- 버짓리스트 데이터베이스 설정 (Supabase SQL Editor에 붙여 넣어 실행)
-- 이미 만든 부분은 건너뛰고, 아직 안 한 것만 실행하면 됩니다.

-- 1) 예산표 -------------------------------------------------------------
-- create table public.plans (
--   id          text primary key,
--   user_id     uuid not null references auth.users on delete cascade,
--   title       text not null default '',
--   kind        text not null default 'budget',
--   position    int  not null default 0,
--   data        jsonb not null,
--   updated_at  timestamptz not null default now()
-- );
-- alter table public.plans enable row level security;

-- 2) 같이 쓰는 사람 -------------------------------------------------------
create table if not exists public.plan_members (
  plan_id    text not null references public.plans(id) on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  role       text not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
alter table public.plan_members enable row level security;

drop policy if exists "내 멤버십만 조회" on public.plan_members;
create policy "내 멤버십만 조회" on public.plan_members
  for select using (auth.uid() = user_id);

-- 3) 예산표 접근 규칙: 내가 만든 것 + 초대받은 것 ----------------------------
drop policy if exists "본인 것만 조회" on public.plans;
drop policy if exists "내 것 또는 공유받은 것 조회" on public.plans;
create policy "내 것 또는 공유받은 것 조회" on public.plans for select using (
  auth.uid() = user_id
  or exists (select 1 from public.plan_members m where m.plan_id = plans.id and m.user_id = auth.uid())
);

drop policy if exists "본인 것만 수정" on public.plans;
drop policy if exists "내 것 또는 공유받은 것 수정" on public.plans;
create policy "내 것 또는 공유받은 것 수정" on public.plans for update
  using (
    auth.uid() = user_id
    or exists (select 1 from public.plan_members m where m.plan_id = plans.id and m.user_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    or exists (select 1 from public.plan_members m where m.plan_id = plans.id and m.user_id = auth.uid())
  );
-- 추가와 삭제는 만든 사람만 (기존 정책 그대로 둡니다)

-- 4) 초대 링크 -----------------------------------------------------------
create table if not exists public.plan_invites (
  token      uuid primary key default gen_random_uuid(),
  plan_id    text not null references public.plans(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at    timestamptz
);
alter table public.plan_invites enable row level security;

drop policy if exists "내가 만든 초대만 조회" on public.plan_invites;
create policy "내가 만든 초대만 조회" on public.plan_invites
  for select using (auth.uid() = created_by);

drop policy if exists "내 예산표만 초대 생성" on public.plan_invites;
create policy "내 예산표만 초대 생성" on public.plan_invites for insert with check (
  auth.uid() = created_by
  and exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid())
);

-- 초대 수락: 링크를 가진 사람만 자기 자신을 멤버로 넣을 수 있게 함수로 처리합니다
create or replace function public.accept_plan_invite(invite_token uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare inv public.plan_invites;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into inv from public.plan_invites where token = invite_token;
  if inv is null then raise exception '초대를 찾을 수 없어요'; end if;
  if inv.expires_at < now() then raise exception '초대가 만료됐어요'; end if;

  insert into public.plan_members (plan_id, user_id, role)
  values (inv.plan_id, auth.uid(), 'editor')
  on conflict (plan_id, user_id) do nothing;

  update public.plan_invites set used_at = now() where token = invite_token and used_at is null;
  return inv.plan_id;
end $$;

revoke all on function public.accept_plan_invite(uuid) from public, anon;
grant execute on function public.accept_plan_invite(uuid) to authenticated;

-- 5) 상대의 변경을 실시간으로 받기 ------------------------------------------
alter publication supabase_realtime add table public.plans;
