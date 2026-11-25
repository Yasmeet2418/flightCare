begin;

alter table public.profiles
  add column if not exists email text,
  add column if not exists updated_at timestamptz not null default now();

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null and u.email is not null;

create unique index if not exists profiles_email_unique_idx
  on public.profiles (email) where email is not null;

alter table public.flights
  add column if not exists arrival_at timestamptz,
  add column if not exists aircraft_model text,
  add column if not exists terminal text,
  add column if not exists updated_at timestamptz not null default now();

update public.flights
set status = lower(replace(trim(status), ' ', '_'))
where lower(trim(status)) in ('scheduled', 'on_time', 'delayed', 'cancelled', 'diverted');

update public.flights
set flight_status = initcap(replace(status, '_', ' '))
where status in ('scheduled', 'on_time', 'delayed', 'cancelled', 'diverted');

alter table public.passengers
  add column if not exists loyalty_number text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists passengers_loyalty_number_key
  on public.passengers (loyalty_number);
drop index if exists public.passengers_loyalty_number_unique_idx;

alter table public.disruptions
  add column if not exists type text,
  add column if not exists reported_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.disruptions
set type = lower(replace(trim(disruption_type), ' ', '_'))
where type is null and disruption_type is not null;

update public.disruptions
set status = case lower(trim(status))
  when 'open' then 'active'
  when 'active' then 'active'
  when 'monitoring' then 'monitoring'
  when 'resolved' then 'resolved'
  else status
end
where status is not null;

alter table public.assistance_requests
  add column if not exists passenger_id uuid,
  add column if not exists type text,
  add column if not exists subject text,
  add column if not exists details text,
  add column if not exists internal_notes text,
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.assistance_requests'::regclass
      and conname = 'assistance_requests_passenger_id_fkey'
  ) then
    alter table public.assistance_requests
      add constraint assistance_requests_passenger_id_fkey
      foreign key (passenger_id) references public.passengers(id)
      on delete set null not valid;
  end if;
end;
$$;

update public.assistance_requests
set type = case lower(replace(trim(request_type), ' ', '_'))
      when 'accommodation' then 'accommodation'
      when 'meal' then 'meal'
      when 'transport' then 'transport'
      when 'special_assistance' then 'special_assistance'
      else 'general_enquiry'
    end,
    subject = coalesce(nullif(subject, ''), nullif(left(description, 120), ''), 'Existing assistance request'),
    details = coalesce(details, description, '')
where type is null or subject is null or details is null;

update public.assistance_requests
set status = case lower(replace(trim(status), ' ', '_'))
  when 'pending' then 'pending'
  when 'in_progress' then 'in_progress'
  when 'completed' then 'completed'
  when 'cancelled' then 'cancelled'
  else status
end
where status is not null;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.passengers(id) on delete cascade,
  flight_id uuid not null references public.flights(id) on delete restrict,
  booking_reference text not null unique,
  seat text,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'disrupted', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.disruption_cases (
  id uuid primary key default gen_random_uuid(),
  disruption_id uuid not null references public.disruptions(id) on delete cascade,
  passenger_id uuid not null references public.passengers(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  summary text not null default 'A disruption may affect your journey.',
  status text not null default 'active'
    check (status in ('active', 'monitoring', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (disruption_id, passenger_id, booking_id)
);

create table if not exists public.alternative_flights (
  id uuid primary key default gen_random_uuid(),
  disruption_id uuid references public.disruptions(id) on delete set null,
  flight_number text not null,
  airline text not null,
  origin text not null,
  destination text not null,
  departure_at timestamptz not null,
  available_seats integer not null default 0 check (available_seats >= 0),
  status text not null default 'available'
    check (status in ('available', 'full', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alternatives_distinct_route check (origin <> destination)
);

create table if not exists public.passenger_options (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.passengers(id) on delete cascade,
  disruption_id uuid not null references public.disruptions(id) on delete cascade,
  alternative_flight_id uuid not null references public.alternative_flights(id) on delete cascade,
  decision text not null default 'selected'
    check (decision in ('selected', 'declined', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (passenger_id, disruption_id, alternative_flight_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'general'
    check (type in ('flight_update', 'disruption', 'assistance', 'general')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flights_departure_idx on public.flights (scheduled_departure);
create index if not exists flights_status_airline_idx on public.flights (status, airline);
create index if not exists passengers_user_id_idx on public.passengers (user_id);
create index if not exists passengers_email_idx on public.passengers (lower(email));
create index if not exists bookings_passenger_flight_idx on public.bookings (passenger_id, flight_id);
create index if not exists disruptions_flight_status_idx on public.disruptions (flight_id, status);
create index if not exists disruption_cases_passenger_idx on public.disruption_cases (passenger_id, status);
create index if not exists alternatives_disruption_status_idx on public.alternative_flights (disruption_id, status);
create index if not exists passenger_options_owner_idx on public.passenger_options (passenger_id, disruption_id);
create index if not exists assistance_owner_status_idx
  on public.assistance_requests (passenger_id, status, created_at desc);
create index if not exists notifications_owner_created_idx on public.notifications (user_id, created_at desc);
create index if not exists activity_logs_created_idx on public.activity_logs (created_at desc);

create or replace function public.flightcare_sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.email is null then
    select u.email into new.email from auth.users u where u.id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists flightcare_sync_profile_email on public.profiles;
create trigger flightcare_sync_profile_email
  before insert or update of email on public.profiles
  for each row execute function public.flightcare_sync_profile_email();

create or replace function public.flightcare_sync_legacy_flight_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if lower(trim(coalesce(new.status, ''))) = 'scheduled'
      and lower(trim(coalesce(new.flight_status, 'scheduled'))) <> 'scheduled' then
      new.status := lower(replace(trim(new.flight_status), ' ', '_'));
    else
      new.status := lower(replace(trim(coalesce(new.status, 'scheduled')), ' ', '_'));
      new.flight_status := initcap(replace(new.status, '_', ' '));
    end if;
  elsif new.status is distinct from old.status then
    new.status := lower(replace(trim(new.status), ' ', '_'));
    new.flight_status := initcap(replace(new.status, '_', ' '));
  elsif new.flight_status is distinct from old.flight_status then
    new.status := lower(replace(trim(new.flight_status), ' ', '_'));
    new.flight_status := initcap(replace(new.status, '_', ' '));
  end if;
  return new;
end;
$$;

drop trigger if exists flightcare_sync_legacy_flight_fields on public.flights;
create trigger flightcare_sync_legacy_flight_fields
  before insert or update of status, flight_status on public.flights
  for each row execute function public.flightcare_sync_legacy_flight_fields();

create or replace function public.flightcare_sync_legacy_disruption_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.type is null then
      new.type := lower(replace(trim(new.disruption_type), ' ', '_'));
    end if;
    if new.disruption_type is null then
      new.disruption_type := initcap(replace(coalesce(new.type, 'missed_connection'), '_', ' '));
    end if;
    new.disruption_type := initcap(replace(new.type, '_', ' '));
  elsif new.type is distinct from old.type then
    new.disruption_type := initcap(replace(new.type, '_', ' '));
  elsif new.disruption_type is distinct from old.disruption_type then
    new.type := lower(replace(new.disruption_type, ' ', '_'));
  end if;
  if lower(trim(coalesce(new.status, ''))) = 'open' then
    new.status := 'active';
  else
    new.status := lower(replace(trim(coalesce(new.status, 'active')), ' ', '_'));
  end if;
  return new;
end;
$$;

drop trigger if exists flightcare_sync_legacy_disruption_fields on public.disruptions;
create trigger flightcare_sync_legacy_disruption_fields
  before insert or update of type, disruption_type, status on public.disruptions
  for each row execute function public.flightcare_sync_legacy_disruption_fields();

create or replace function public.flightcare_sync_legacy_assistance_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  passenger_full_name text;
begin
  if new.type is null then
    new.type := case lower(replace(trim(coalesce(new.request_type, '')), ' ', '_'))
      when 'accommodation' then 'accommodation'
      when 'meal' then 'meal'
      when 'transport' then 'transport'
      when 'special_assistance' then 'special_assistance'
      else 'general_enquiry'
    end;
  end if;
  if new.request_type is null then
    new.request_type := initcap(replace(coalesce(new.type, 'general_enquiry'), '_', ' '));
  end if;
  if new.subject is null or new.subject = '' then
    new.subject := coalesce(nullif(left(new.description, 120), ''), initcap(replace(new.type, '_', ' ')) || ' request');
  end if;
  if new.details is null then
    new.details := coalesce(new.description, '');
  end if;
  if new.description is null then
    new.description := new.details;
  end if;
  if new.passenger_name is null and new.passenger_id is not null then
    select p.full_name into passenger_full_name
    from public.passengers p where p.id = new.passenger_id;
    new.passenger_name := passenger_full_name;
  end if;
  new.status := lower(replace(trim(coalesce(new.status, 'pending')), ' ', '_'));
  return new;
end;
$$;

drop trigger if exists flightcare_sync_legacy_assistance_fields on public.assistance_requests;
create trigger flightcare_sync_legacy_assistance_fields
  before insert or update of passenger_id, passenger_name, type, request_type, subject, details, description, status
  on public.assistance_requests
  for each row execute function public.flightcare_sync_legacy_assistance_fields();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'flights', 'passengers', 'bookings', 'disruptions',
    'disruption_cases', 'alternative_flights', 'passenger_options',
    'assistance_requests', 'notifications', 'activity_logs'
  ] loop
    execute format('drop trigger if exists flightcare_set_updated_at on public.%I', table_name);
    execute format(
      'create trigger flightcare_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.has_staff_role()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_profile_role() in ('admin', 'operations_manager', 'customer_service'), false);
$$;

create or replace function public.has_operations_role()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_profile_role() in ('admin', 'operations_manager'), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_profile_role() = 'admin', false);
$$;

revoke all on function public.current_profile_role() from public, anon;
revoke all on function public.has_staff_role() from public, anon;
revoke all on function public.has_operations_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.has_staff_role() to authenticated;
grant execute on function public.has_operations_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.flights enable row level security;
alter table public.passengers enable row level security;
alter table public.bookings enable row level security;
alter table public.disruptions enable row level security;
alter table public.disruption_cases enable row level security;
alter table public.alternative_flights enable row level security;
alter table public.passenger_options enable row level security;
alter table public.assistance_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "profiles_read_self_or_staff" on public.profiles;
create policy "profiles_read_self_or_staff" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.has_staff_role());
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (
    (id = (select auth.uid()) and role = public.current_profile_role())
    or (public.is_admin() and id <> (select auth.uid()))
  );
drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert" on public.profiles for insert to authenticated with check (public.is_admin());
drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete" on public.profiles for delete to authenticated
  using (public.is_admin() and id <> (select auth.uid()));

drop policy if exists "flights_read_authenticated" on public.flights;
create policy "flights_read_authenticated" on public.flights for select to authenticated using (true);
drop policy if exists "flights_manage_operations" on public.flights;
create policy "flights_manage_operations" on public.flights for all to authenticated
  using (public.has_operations_role()) with check (public.has_operations_role());

drop policy if exists "passengers_read_self_or_staff" on public.passengers;
create policy "passengers_read_self_or_staff" on public.passengers for select to authenticated
  using (user_id = (select auth.uid()) or public.has_staff_role());
drop policy if exists "passengers_insert_staff" on public.passengers;
create policy "passengers_insert_staff" on public.passengers for insert to authenticated
  with check (public.has_staff_role());
drop policy if exists "passengers_update_staff" on public.passengers;
create policy "passengers_update_staff" on public.passengers for update to authenticated
  using (public.has_staff_role()) with check (public.has_staff_role());
drop policy if exists "passengers_delete_admin" on public.passengers;
create policy "passengers_delete_admin" on public.passengers for delete to authenticated
  using (public.is_admin());

drop policy if exists "bookings_read_self_or_staff" on public.bookings;
create policy "bookings_read_self_or_staff" on public.bookings for select to authenticated
  using (public.has_staff_role() or exists (
    select 1 from public.passengers p
    where p.id = bookings.passenger_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "bookings_manage_operations" on public.bookings;
create policy "bookings_manage_operations" on public.bookings for all to authenticated
  using (public.has_operations_role()) with check (public.has_operations_role());

drop policy if exists "disruptions_read_staff_or_case_owner" on public.disruptions;
create policy "disruptions_read_staff_or_case_owner" on public.disruptions for select to authenticated
  using (public.has_staff_role() or exists (
    select 1 from public.disruption_cases dc
    join public.passengers p on p.id = dc.passenger_id
    where dc.disruption_id = disruptions.id and p.user_id = (select auth.uid())
  ));
drop policy if exists "disruptions_manage_staff" on public.disruptions;
create policy "disruptions_manage_staff" on public.disruptions for all to authenticated
  using (public.has_staff_role()) with check (public.has_staff_role());

drop policy if exists "disruption_cases_read_owner_or_staff" on public.disruption_cases;
create policy "disruption_cases_read_owner_or_staff" on public.disruption_cases for select to authenticated
  using (public.has_staff_role() or exists (
    select 1 from public.passengers p
    where p.id = disruption_cases.passenger_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "disruption_cases_manage_staff" on public.disruption_cases;
create policy "disruption_cases_manage_staff" on public.disruption_cases for all to authenticated
  using (public.has_staff_role()) with check (public.has_staff_role());

drop policy if exists "alternatives_read_eligible_or_staff" on public.alternative_flights;
create policy "alternatives_read_eligible_or_staff" on public.alternative_flights for select to authenticated
  using (public.has_staff_role() or exists (
    select 1 from public.disruption_cases dc
    join public.passengers p on p.id = dc.passenger_id
    where dc.disruption_id = alternative_flights.disruption_id
      and dc.status <> 'resolved'
      and p.user_id = (select auth.uid())
  ));
drop policy if exists "alternatives_manage_operations" on public.alternative_flights;
create policy "alternatives_manage_operations" on public.alternative_flights for all to authenticated
  using (public.has_operations_role()) with check (public.has_operations_role());

drop policy if exists "passenger_options_read_owner_or_staff" on public.passenger_options;
create policy "passenger_options_read_owner_or_staff" on public.passenger_options for select to authenticated
  using (public.has_staff_role() or exists (
    select 1 from public.passengers p
    where p.id = passenger_options.passenger_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "passenger_options_insert_owner_or_staff" on public.passenger_options;
create policy "passenger_options_insert_owner_or_staff" on public.passenger_options for insert to authenticated
  with check (
    (public.has_staff_role() or exists (
      select 1 from public.passengers p
      where p.id = passenger_options.passenger_id and p.user_id = (select auth.uid())
    ))
    and exists (
      select 1 from public.alternative_flights af
      where af.id = passenger_options.alternative_flight_id
        and af.disruption_id = passenger_options.disruption_id
        and af.status = 'available'
        and af.available_seats > 0
    )
    and exists (
      select 1 from public.disruption_cases dc
      where dc.disruption_id = passenger_options.disruption_id
        and dc.passenger_id = passenger_options.passenger_id
        and dc.status <> 'resolved'
    )
  );
drop policy if exists "passenger_options_update_staff" on public.passenger_options;
create policy "passenger_options_update_staff" on public.passenger_options for update to authenticated
  using (public.has_staff_role()) with check (public.has_staff_role());

drop policy if exists "assistance_read_owner_or_staff" on public.assistance_requests;
create policy "assistance_read_owner_or_staff" on public.assistance_requests for select to authenticated
  using (public.has_staff_role() or exists (
    select 1 from public.passengers p
    where p.id = assistance_requests.passenger_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "assistance_insert_owner_or_staff" on public.assistance_requests;
create policy "assistance_insert_owner_or_staff" on public.assistance_requests for insert to authenticated
  with check (
    public.has_staff_role()
    or (
      status = 'pending'
      and internal_notes is null
      and assigned_to is null
      and exists (
        select 1 from public.passengers p
        where p.id = assistance_requests.passenger_id and p.user_id = (select auth.uid())
      )
    )
  );
drop policy if exists "assistance_update_staff" on public.assistance_requests;
create policy "assistance_update_staff" on public.assistance_requests for update to authenticated
  using (public.has_staff_role()) with check (public.has_staff_role());
drop policy if exists "assistance_delete_admin" on public.assistance_requests;
create policy "assistance_delete_admin" on public.assistance_requests for delete to authenticated
  using (public.is_admin());

drop policy if exists "notifications_read_self_or_staff" on public.notifications;
create policy "notifications_read_self_or_staff" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) or public.has_staff_role());
drop policy if exists "notifications_create_staff" on public.notifications;
create policy "notifications_create_staff" on public.notifications for insert to authenticated
  with check (public.has_staff_role());
drop policy if exists "notifications_update_admin" on public.notifications;
create policy "notifications_update_admin" on public.notifications for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "notifications_delete_admin" on public.notifications;
create policy "notifications_delete_admin" on public.notifications for delete to authenticated
  using (public.is_admin());

drop policy if exists "activity_read_staff" on public.activity_logs;
create policy "activity_read_staff" on public.activity_logs for select to authenticated
  using (public.has_staff_role());
drop policy if exists "activity_insert_staff" on public.activity_logs;
create policy "activity_insert_staff" on public.activity_logs for insert to authenticated
  with check (public.has_staff_role() and (actor_id is null or actor_id = (select auth.uid())));

grant select, insert, update, delete on public.profiles, public.flights, public.passengers,
  public.bookings, public.disruptions, public.disruption_cases, public.alternative_flights,
  public.passenger_options, public.assistance_requests, public.notifications, public.activity_logs
  to authenticated;

notify pgrst, 'reload schema';

commit;
