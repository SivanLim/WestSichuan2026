-- ============================================================
--  在 Supabase 后台 → SQL Editor 里，粘贴下面全部内容并运行（Run）。
--  幂等版本：跑多少次都不会报错。
-- ============================================================

-- 1) 建表
create table if not exists travel_data (
  id          int primary key default 1,
  data        jsonb not null,
  updated_at  timestamptz default now()
);

-- 2) 开启行级安全（RLS）
alter table travel_data enable row level security;

-- 3) 先删旧策略，再创建新策略
drop policy if exists "auth_read"   on travel_data;
drop policy if exists "auth_insert" on travel_data;
drop policy if exists "auth_update" on travel_data;

create policy "auth_read"   on travel_data for select   to authenticated using (true);
create policy "auth_insert" on travel_data for insert   to authenticated with check (true);
create policy "auth_update" on travel_data for update   to authenticated using (true);

-- 4) 开启实时订阅
alter publication supabase_realtime add table travel_data;
