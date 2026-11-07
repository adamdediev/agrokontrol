-- =====================================================================
-- AgroKontrol — схема базы данных для Supabase (Postgres)
-- Запустить целиком в Supabase → SQL Editor → New query → Run.
-- Скрипт идемпотентный: его можно запускать повторно.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Таблицы
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null unique,
  role text not null check (role in ('admin', 'agronom')),
  recovery_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  work_days int[] not null default '{3,4}',      -- ISO: 1=Пн … 7=Вс
  day_start time not null default '09:00',
  day_end time not null default '18:00',
  visit_limit int not null default 8,            -- визитов в день
  visit_duration int not null default 60,        -- минут на осмотр
  interval_min int not null default 10,          -- перерыв между визитами в одном посёлке
  travel_min int not null default 30,            -- дорога между посёлками
  period_anchor date not null default '2026-01-05', -- понедельник начала первого 4-недельного периода
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null default '',
  district text not null default '',
  settlement text not null default '',
  address text not null default '',
  preferred_time text not null default '',
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  discount_percent numeric not null default 0,
  manual_price numeric,                 -- ручная итоговая цена за 4 недели (перекрывает расчёт)
  old_debt numeric not null default 0,  -- долг прошлого сезона, только ручной ввод
  old_debt_note text not null default '',
  pay_on_visit boolean not null default false, -- исключение «оплата при визите»
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.greenhouses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null default '',
  area numeric not null default 0,      -- м²
  tariff numeric not null default 0,    -- руб./м² за 4 недели
  address text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  paid_at date not null default current_date,
  amount numeric not null check (amount >= 0),
  method text not null check (method in ('cash', 'card')),
  received_by text not null default '',
  weeks date[] not null default '{}',   -- понедельники оплаченных недель
  note text not null default '',
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  week_start date not null,             -- понедельник недели обслуживания
  visit_date date,                      -- null = ещё не расставлен
  start_time time,
  duration_min int not null default 60,
  status text not null default 'planned' check (status in ('planned', 'done', 'missed', 'rescheduled')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists visits_date_idx on public.visits (visit_date);
create index if not exists visits_client_week_idx on public.visits (client_id, week_start);
create index if not exists payments_client_idx on public.payments (client_id);
create index if not exists greenhouses_client_idx on public.greenhouses (client_id);

create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  user_name text not null default '',
  table_name text not null,
  row_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

create table if not exists public.backups (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null default 'auto',
  size_bytes int not null default 0,
  data jsonb not null
);

-- ---------------------------------------------------------------------
-- Вспомогательные функции ролей
-- ---------------------------------------------------------------------

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- updated_at и журнал действий
-- ---------------------------------------------------------------------

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_id text;
begin
  if current_setting('app.restoring', true) = '1' then
    return coalesce(new, old);
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  v_id := coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'), '');
  insert into public.audit_log (user_id, user_name, table_name, row_id, action, old_data, new_data)
  values (
    auth.uid(), coalesce(v_name, 'система'), tg_table_name, v_id, lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- Агроном может менять у клиента только заметки
create or replace function public.guard_client_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.restoring', true) = '1' or public.is_admin() then
    return new;
  end if;
  if (to_jsonb(new) - 'notes' - 'updated_at') is distinct from (to_jsonb(old) - 'notes' - 'updated_at') then
    raise exception 'Агроном может изменять только заметки клиента';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['settings', 'clients', 'greenhouses', 'payments', 'visits'] loop
    execute format('drop trigger if exists trg_touch on public.%I', t);
    execute format('create trigger trg_touch before update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.write_audit()', t);
  end loop;
end $$;

drop trigger if exists trg_guard_client on public.clients;
create trigger trg_guard_client before update on public.clients
  for each row execute function public.guard_client_update();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.clients enable row level security;
alter table public.greenhouses enable row level security;
alter table public.payments enable row level security;
alter table public.visits enable row level security;
alter table public.audit_log enable row level security;
alter table public.backups enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy profiles_read on public.profiles for select using (public.is_staff());
create policy profiles_admin on public.profiles for update using (public.is_admin()) with check (public.is_admin());

create policy settings_read on public.settings for select using (public.is_staff());
create policy settings_write on public.settings for update using (public.is_admin()) with check (public.is_admin());

create policy clients_read on public.clients for select using (public.is_staff());
create policy clients_insert on public.clients for insert with check (public.is_admin());
create policy clients_update on public.clients for update using (public.is_staff()) with check (public.is_staff());
create policy clients_delete on public.clients for delete using (public.is_admin());

create policy gh_read on public.greenhouses for select using (public.is_staff());
create policy gh_insert on public.greenhouses for insert with check (public.is_admin());
create policy gh_update on public.greenhouses for update using (public.is_admin()) with check (public.is_admin());
create policy gh_delete on public.greenhouses for delete using (public.is_admin());

create policy pay_read on public.payments for select using (public.is_staff());
create policy pay_insert on public.payments for insert with check (public.is_admin());
create policy pay_update on public.payments for update using (public.is_admin()) with check (public.is_admin());
create policy pay_delete on public.payments for delete using (public.is_admin());

create policy visits_read on public.visits for select using (public.is_staff());
create policy visits_insert on public.visits for insert with check (public.is_staff());
create policy visits_update on public.visits for update using (public.is_staff()) with check (public.is_staff());
create policy visits_delete on public.visits for delete using (public.is_staff());

create policy audit_read on public.audit_log for select using (public.is_staff());

create policy backups_read on public.backups for select using (public.is_admin());

-- ---------------------------------------------------------------------
-- Пользователи: создание, вход по телефону, смена пароля
-- ---------------------------------------------------------------------

create or replace function public.normalize_phone(p text) returns text
language sql immutable as $$
  select case
    when length(d) = 11 and left(d, 1) = '8' then '7' || substr(d, 2)
    when length(d) = 10 then '7' || d
    else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s
$$;

-- Для формы входа: телефон → технический email учётной записи
create or replace function public.login_email(p_phone text) returns text
language sql stable security definer set search_path = public, auth as $$
  select u.email from public.profiles p join auth.users u on u.id = p.id
  where p.phone = public.normalize_phone(p_phone)
$$;

-- Нужно ли первичное создание администратора (пустая система)
create or replace function public.needs_bootstrap() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles)
$$;

create or replace function public.create_app_user(
  p_phone text, p_password text, p_full_name text, p_role text, p_email text default null
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_phone text := public.normalize_phone(p_phone);
  v_email text;
begin
  if exists (select 1 from public.profiles) and not public.is_admin() then
    raise exception 'Регистрация закрыта. Пользователей создаёт администратор.';
  end if;
  if not exists (select 1 from public.profiles) and p_role <> 'admin' then
    raise exception 'Первым должен быть создан администратор';
  end if;
  if p_role not in ('admin', 'agronom') then raise exception 'Неизвестная роль'; end if;
  if length(v_phone) < 10 then raise exception 'Некорректный телефон'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Пароль должен быть не короче 6 символов'; end if;
  if exists (select 1 from public.profiles where phone = v_phone) then
    raise exception 'Пользователь с таким телефоном уже есть';
  end if;
  v_email := lower(coalesce(nullif(trim(p_email), ''), v_phone || '@agrokontrol.local'));
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'Этот email уже используется';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_full_name), now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());

  insert into public.profiles (id, full_name, phone, role, recovery_email)
  values (v_id, coalesce(p_full_name, ''), v_phone, p_role, nullif(trim(p_email), ''));
  return v_id;
end $$;

-- Администратор задаёт новый пароль любому пользователю
create or replace function public.admin_set_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.is_admin() then raise exception 'Только администратор'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Пароль должен быть не короче 6 символов'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
  where id = p_user;
end $$;

create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Только администратор'; end if;
  if p_user = auth.uid() then raise exception 'Нельзя удалить самого себя'; end if;
  delete from auth.users where id = p_user;
end $$;

-- ---------------------------------------------------------------------
-- Резервные копии
-- ---------------------------------------------------------------------

create or replace function public.snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'version', 1,
    'created_at', now(),
    'settings', (select to_jsonb(s) from public.settings s where id = 1),
    'clients', coalesce((select jsonb_agg(to_jsonb(c)) from public.clients c), '[]'),
    'greenhouses', coalesce((select jsonb_agg(to_jsonb(g)) from public.greenhouses g), '[]'),
    'payments', coalesce((select jsonb_agg(to_jsonb(p)) from public.payments p), '[]'),
    'visits', coalesce((select jsonb_agg(to_jsonb(v)) from public.visits v), '[]')
  )
$$;

create or replace function public.make_backup(p_kind text default 'manual') returns bigint
language plpgsql security definer set search_path = public as $$
declare v_data jsonb; v_id bigint;
begin
  if p_kind <> 'auto' and not public.is_admin() then raise exception 'Только администратор'; end if;
  v_data := public.snapshot();
  insert into public.backups (kind, data, size_bytes) values (p_kind, v_data, octet_length(v_data::text))
  returning id into v_id;
  -- храним последние 60 копий
  delete from public.backups where id in (select id from public.backups order by created_at desc offset 60);
  return v_id;
end $$;

create or replace function public.backup_data(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только администратор'; end if;
  return (select data from public.backups where id = p_id);
end $$;

create or replace function public.restore_snapshot(p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только администратор'; end if;
  if p_data is null or p_data ->> 'version' is null then raise exception 'Неверный формат копии'; end if;

  -- перед восстановлением сохраняем текущее состояние
  perform public.make_backup('before-restore');
  perform set_config('app.restoring', '1', true);

  delete from public.visits where true;
  delete from public.payments where true;
  delete from public.greenhouses where true;
  delete from public.clients where true;

  insert into public.clients select * from jsonb_populate_recordset(null::public.clients, p_data -> 'clients');
  insert into public.greenhouses select * from jsonb_populate_recordset(null::public.greenhouses, p_data -> 'greenhouses');
  insert into public.payments select * from jsonb_populate_recordset(null::public.payments, p_data -> 'payments');
  insert into public.visits select * from jsonb_populate_recordset(null::public.visits, p_data -> 'visits');
  if p_data -> 'settings' is not null and jsonb_typeof(p_data -> 'settings') = 'object' then
    delete from public.settings where true;
    insert into public.settings select * from jsonb_populate_record(null::public.settings, p_data -> 'settings');
  end if;

  perform set_config('app.restoring', '0', true);
  insert into public.audit_log (user_id, user_name, table_name, row_id, action, new_data)
  values (auth.uid(), coalesce((select full_name from public.profiles where id = auth.uid()), ''),
          'backups', '', 'restore', jsonb_build_object('created_at', p_data ->> 'created_at'));
end $$;

create or replace function public.restore_backup(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_data jsonb;
begin
  if not public.is_admin() then raise exception 'Только администратор'; end if;
  select data into v_data from public.backups where id = p_id;
  if v_data is null then raise exception 'Копия не найдена'; end if;
  perform public.restore_snapshot(v_data);
end $$;

-- ---------------------------------------------------------------------
-- Права на функции
-- ---------------------------------------------------------------------

revoke all on function public.create_app_user(text, text, text, text, text) from public;
grant execute on function public.create_app_user(text, text, text, text, text) to anon, authenticated;
grant execute on function public.login_email(text) to anon, authenticated;
grant execute on function public.needs_bootstrap() to anon, authenticated;
revoke all on function public.snapshot() from public, anon, authenticated;
revoke all on function public.make_backup(text) from public, anon;
grant execute on function public.make_backup(text) to authenticated;
revoke all on function public.restore_snapshot(jsonb) from public, anon;
grant execute on function public.restore_snapshot(jsonb) to authenticated;
revoke all on function public.restore_backup(bigint) from public, anon;
grant execute on function public.restore_backup(bigint) to authenticated;
revoke all on function public.backup_data(bigint) from public, anon;
grant execute on function public.backup_data(bigint) to authenticated;
revoke all on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Ежедневная автоматическая копия (pg_cron). 02:00 UTC = 05:00 МСК
-- ---------------------------------------------------------------------

create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('agrokontrol-daily-backup')
  where exists (select 1 from cron.job where jobname = 'agrokontrol-daily-backup');
  perform cron.schedule('agrokontrol-daily-backup', '0 2 * * *', $cron$select public.make_backup('auto')$cron$);
end $$;
