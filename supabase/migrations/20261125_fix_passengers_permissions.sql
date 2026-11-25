begin;

do $$
begin
  if to_regclass('public.passengers') is null then
    raise exception 'public.passengers does not exist; apply the passenger-table migration first.';
  end if;
  if to_regclass('public.profiles') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'id'
        and data_type = 'uuid'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'role'
    ) then
    raise exception 'public.profiles must contain uuid id and role columns.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'passengers'
      and column_name = 'user_id'
      and data_type = 'uuid'
  ) then
    raise exception 'public.passengers.user_id must be uuid for owner-scoped access.';
  end if;
end;
$$;

alter table public.passengers enable row level security;

grant usage on schema public to authenticated;
revoke all privileges on table public.passengers from public, anon, authenticated;
grant select, insert, update, delete on table public.passengers to authenticated;

create or replace function public.flightcare_passenger_current_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid());
$$;

create or replace function public.flightcare_passenger_is_staff()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(
    public.flightcare_passenger_current_role() in ('admin', 'operations_manager', 'customer_service'),
    false
  );
$$;

create or replace function public.flightcare_passenger_is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(public.flightcare_passenger_current_role() = 'admin', false);
$$;

revoke all privileges on function public.flightcare_passenger_current_role() from public, anon, authenticated;
revoke all privileges on function public.flightcare_passenger_is_staff() from public, anon, authenticated;
revoke all privileges on function public.flightcare_passenger_is_admin() from public, anon, authenticated;
grant execute on function public.flightcare_passenger_current_role() to authenticated;
grant execute on function public.flightcare_passenger_is_staff() to authenticated;
grant execute on function public.flightcare_passenger_is_admin() to authenticated;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'passengers'
  loop
    execute format('drop policy %I on public.passengers', existing_policy.policyname);
  end loop;
end;
$$;

create policy flightcare_passengers_read_authorized
  on public.passengers
  for select to authenticated
  using (
    public.flightcare_passenger_is_staff()
    or (
      public.flightcare_passenger_current_role() = 'passenger'
      and user_id = (select auth.uid())
    )
  );

create policy flightcare_passengers_insert_staff
  on public.passengers
  for insert to authenticated
  with check (public.flightcare_passenger_is_staff());

create policy flightcare_passengers_update_staff
  on public.passengers
  for update to authenticated
  using (public.flightcare_passenger_is_staff())
  with check (public.flightcare_passenger_is_staff());

create policy flightcare_passengers_delete_admin
  on public.passengers
  for delete to authenticated
  using (public.flightcare_passenger_is_admin());

do $$
begin
  if not (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.passengers'::regclass
  ) then
    raise exception 'RLS is not enabled on public.passengers.';
  end if;
  if not has_table_privilege('authenticated', 'public.passengers', 'SELECT')
    or not has_table_privilege('authenticated', 'public.passengers', 'INSERT')
    or not has_table_privilege('authenticated', 'public.passengers', 'UPDATE')
    or not has_table_privilege('authenticated', 'public.passengers', 'DELETE') then
    raise exception 'Required table grants for authenticated are missing.';
  end if;
  if has_table_privilege('anon', 'public.passengers', 'SELECT')
    or has_table_privilege('anon', 'public.passengers', 'INSERT')
    or has_table_privilege('anon', 'public.passengers', 'UPDATE')
    or has_table_privilege('anon', 'public.passengers', 'DELETE') then
    raise exception 'Anonymous privileges remain on public.passengers.';
  end if;
end;
$$;

commit;
