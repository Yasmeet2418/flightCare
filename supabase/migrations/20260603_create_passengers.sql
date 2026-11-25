begin;

create table if not exists public.passengers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  loyalty_number text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  expected_column record;
begin
  for expected_column in
    select * from (values
      ('id', 'uuid'),
      ('user_id', 'uuid'),
      ('full_name', 'text'),
      ('email', 'text'),
      ('phone', 'text'),
      ('loyalty_number', 'text'),
      ('created_at', 'timestamp with time zone'),
      ('updated_at', 'timestamp with time zone')
    ) as expected(name, data_type)
  loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'passengers'
        and c.column_name = expected_column.name
        and c.data_type = expected_column.data_type
    ) then
      raise exception 'public.passengers is missing expected column % with type %; migration stopped without altering existing passenger data.',
        expected_column.name, expected_column.data_type;
    end if;
  end loop;

  if to_regclass('public.assistance_requests') is null then
    raise exception 'public.assistance_requests does not exist; migration stopped without creating or replacing it.';
  end if;
end;
$$;

alter table public.assistance_requests
  add column if not exists passenger_id uuid;

do $$
declare
  passenger_id_attnum smallint;
  existing_reference oid;
  passenger_id_column smallint;
  profile_id_column smallint;
  existing_profile_reference oid;
  user_id_attnum smallint;
begin
  select a.attnum into passenger_id_column
  from pg_attribute a
  where a.attrelid = 'public.passengers'::regclass
    and a.attname = 'id'
    and not a.attisdropped
    and a.atttypid = 'uuid'::regtype;

  select a.attnum into profile_id_column
  from pg_attribute a
  where a.attrelid = 'public.profiles'::regclass
    and a.attname = 'id'
    and not a.attisdropped
    and a.atttypid = 'uuid'::regtype;

  if passenger_id_column is null or profile_id_column is null then
    raise exception 'Passenger and profile IDs must both be uuid; migration stopped.';
  end if;

  if not exists (
    select 1
    from pg_index i
    where i.indrelid = 'public.passengers'::regclass
      and i.indisunique
      and i.indisvalid
      and i.indpred is null
      and i.indnkeyatts = 1
      and i.indkey[0] = passenger_id_column
  ) then
    execute 'create unique index passengers_id_unique_idx on public.passengers (id)';
  end if;

  select a.attnum into passenger_id_attnum
  from pg_attribute a
  where a.attrelid = 'public.assistance_requests'::regclass
    and a.attname = 'passenger_id'
    and not a.attisdropped
    and a.atttypid = 'uuid'::regtype;

  if passenger_id_attnum is null then
    raise exception 'public.assistance_requests.passenger_id must be uuid; migration stopped.';
  end if;

  select a.attnum into user_id_attnum
  from pg_attribute a
  where a.attrelid = 'public.passengers'::regclass
    and a.attname = 'user_id'
    and not a.attisdropped;

  select c.confrelid into existing_profile_reference
  from pg_constraint c
  where c.conrelid = 'public.passengers'::regclass
    and c.contype = 'f'
    and c.conkey = array[user_id_attnum]::smallint[]
  limit 1;

  if existing_profile_reference is null then
    alter table public.passengers
      add constraint passengers_user_id_fkey
      foreign key (user_id) references public.profiles(id)
      on delete set null not valid;
  elsif existing_profile_reference <> 'public.profiles'::regclass then
    raise exception 'public.passengers.user_id already references another table; migration stopped.';
  end if;

  select c.confrelid into existing_reference
  from pg_constraint c
  where c.conrelid = 'public.assistance_requests'::regclass
    and c.contype = 'f'
    and c.conkey = array[passenger_id_attnum]::smallint[]
  limit 1;

  if existing_reference is null then
    alter table public.assistance_requests
      add constraint assistance_requests_passenger_id_fkey
      foreign key (passenger_id) references public.passengers(id)
      on delete set null not valid;
  elsif existing_reference <> 'public.passengers'::regclass then
    raise exception 'public.assistance_requests.passenger_id already references another table; migration stopped.';
  end if;

  if not exists (
    select 1
    from pg_index i
    where i.indrelid = 'public.passengers'::regclass
      and i.indisunique
      and i.indisvalid
      and i.indpred is null
      and i.indnkeyatts = 1
      and i.indkey[0] = user_id_attnum
  ) then
    execute 'create unique index passengers_user_id_unique_idx on public.passengers (user_id)';
  end if;
end;
$$;

create index if not exists passengers_user_id_idx on public.passengers (user_id);
create index if not exists passengers_email_idx on public.passengers (lower(email));
create index if not exists assistance_requests_passenger_id_idx on public.assistance_requests (passenger_id);

create or replace function public.flightcare_set_passenger_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists flightcare_passengers_updated_at on public.passengers;
create trigger flightcare_passengers_updated_at
  before update on public.passengers
  for each row execute function public.flightcare_set_passenger_updated_at();

create or replace function public.flightcare_current_profile_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid());
$$;

create or replace function public.flightcare_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.flightcare_current_profile_role() in ('admin', 'operations_manager', 'customer_service'),
    false
  );
$$;

create or replace function public.flightcare_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.flightcare_current_profile_role() = 'admin', false);
$$;

grant execute on function public.flightcare_current_profile_role() to anon, authenticated;
grant execute on function public.flightcare_is_staff() to anon, authenticated;
grant execute on function public.flightcare_is_admin() to anon, authenticated;

alter table public.passengers enable row level security;

drop policy if exists flightcare_passengers_row_guard on public.passengers;
create policy flightcare_passengers_row_guard on public.passengers
  as restrictive for all to public
  using (
    auth.uid() is not null
    and (user_id = (select auth.uid()) or public.flightcare_is_staff())
  )
  with check (
    auth.uid() is not null
    and (user_id = (select auth.uid()) or public.flightcare_is_staff())
  );

drop policy if exists flightcare_passengers_read on public.passengers;
create policy flightcare_passengers_read on public.passengers
  for select to authenticated
  using (user_id = (select auth.uid()) or public.flightcare_is_staff());

drop policy if exists flightcare_passengers_insert_staff on public.passengers;
create policy flightcare_passengers_insert_staff on public.passengers
  for insert to authenticated
  with check (public.flightcare_is_staff());

drop policy if exists flightcare_passengers_update_staff on public.passengers;
create policy flightcare_passengers_update_staff on public.passengers
  for update to authenticated
  using (public.flightcare_is_staff())
  with check (public.flightcare_is_staff());

drop policy if exists flightcare_passengers_delete_admin on public.passengers;
create policy flightcare_passengers_delete_admin on public.passengers
  for delete to authenticated
  using (public.flightcare_is_admin());

grant select, insert, update, delete on public.passengers to authenticated;

create or replace function public.flightcare_create_passenger_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  auth_email text;
begin
  select u.email into auth_email
  from auth.users u
  where u.id = new.id;

  if auth_email is not null then
    insert into public.passengers (user_id, full_name, email)
    values (new.id, coalesce(nullif(trim(new.full_name), ''), split_part(auth_email, '@', 1)), auth_email)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists flightcare_create_passenger_for_profile on public.profiles;
create trigger flightcare_create_passenger_for_profile
  after insert on public.profiles
  for each row
  when (new.role = 'passenger')
  execute function public.flightcare_create_passenger_for_profile();

insert into public.passengers (user_id, full_name, email)
select p.id, coalesce(nullif(trim(p.full_name), ''), split_part(u.email, '@', 1)), u.email
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'passenger'
  and u.email is not null
on conflict (user_id) do nothing;

commit;
