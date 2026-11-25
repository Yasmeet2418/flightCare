insert into public.flights (flight_number, airline, origin, destination, scheduled_departure, estimated_departure, gate, status)
select 'FC 204', 'FlightCare Airways', 'JFK', 'LHR', now() + interval '2 hours', now() + interval '2 hours', 'B12', 'on_time'
where not exists (select 1 from public.flights where flight_number = 'FC 204')
union all
select 'FC 518', 'FlightCare Airways', 'SFO', 'ORD', now() + interval '3 hours', now() + interval '3 hours 35 minutes', 'C08', 'delayed'
where not exists (select 1 from public.flights where flight_number = 'FC 518')
union all
select 'FC 731', 'Northstar Air', 'BOS', 'SEA', now() + interval '5 hours', null, 'A04', 'scheduled'
where not exists (select 1 from public.flights where flight_number = 'FC 731');

insert into public.passengers (full_name, email, phone, loyalty_number)
values
  ('Avery Morgan', 'avery.morgan@example.test', '+1 555 010 2040', 'FC-DEMO-204'),
  ('Jordan Ellis', 'jordan.ellis@example.test', '+1 555 010 5180', 'FC-DEMO-518'),
  ('Riley Chen', 'riley.chen@example.test', '+1 555 010 7310', 'FC-DEMO-731')
on conflict (loyalty_number) do nothing;

insert into public.disruptions (flight_id, type, reason, estimated_delay_minutes, status)
select f.id, 'delay', 'Weather-related air traffic restrictions near the destination.', 35, 'active'
from public.flights f where f.flight_number = 'FC 518'
and not exists (select 1 from public.disruptions d where d.flight_id = f.id and d.reason like 'Weather-related air traffic restrictions%');

insert into public.alternative_flights (disruption_id, flight_number, airline, origin, destination, departure_at, available_seats, status)
select d.id, 'FC 522', 'FlightCare Airways', 'SFO', 'ORD', now() + interval '4 hours', 12, 'available'
from public.disruptions d join public.flights f on f.id = d.flight_id
where f.flight_number = 'FC 518'
and not exists (select 1 from public.alternative_flights a where a.flight_number = 'FC 522');

insert into public.assistance_requests (passenger_id, type, subject, details, status)
select p.id, 'meal', 'Meal voucher information', 'Please share information about meal support while waiting.', 'pending'
from public.passengers p where p.email = 'jordan.ellis@example.test'
and not exists (select 1 from public.assistance_requests r where r.passenger_id = p.id and r.subject = 'Meal voucher information');
