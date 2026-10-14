-- 프로젝트는 검증된 사용자(auth.uid())만 읽고 쓴다.
-- service-role은 이 정책의 대상이 아니며, 앱의 일반 요청에서는 쓰지 않는다.
-- 연구실 정보는 projects.record 의 lab 필드다. 별도 공개 테이블에 두지 않는다.

create table if not exists public.projects (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  revision integer not null check (revision > 0),
  record jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.project_files (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.jobs (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  status text not null,
  payload jsonb not null default '{}'::jsonb
);

alter table public.projects enable row level security;
alter table public.project_files enable row level security;
alter table public.jobs enable row level security;

create policy projects_owner_select on public.projects for select using (owner_id = auth.uid());
create policy projects_owner_insert on public.projects for insert with check (owner_id = auth.uid());
create policy projects_owner_update on public.projects for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy projects_owner_delete on public.projects for delete using (owner_id = auth.uid());

create policy files_owner_all on public.project_files for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy jobs_owner_all on public.jobs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
