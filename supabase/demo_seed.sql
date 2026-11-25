-- Fictional records for staff demonstrations only. Safe to run repeatedly.
begin;

insert into public.flights
  (flight_number, airline, origin, destination, scheduled_departure, estimated_departure, arrival_at, aircraft_model, terminal, gate, status)
select 'DEMO-204', '[DEMO] Northstar Air', 'JFK', 'LHR',
  now() + interval '2 hours', now() + interval '2 hours', now() + interval '9 hours',
  'Airbus A350-900', 'DEMO-T4', 'DEMO-B12', 'on_time'
where not exists (select 1 from public.flights where flight_number = 'DEMO-204');

insert into public.flights
  (flight_number, airline, origin, destination, scheduled_departure, estimated_departure, arrival_at, aircraft_model, terminal, gate, status)
select 'DEMO-518', '[DEMO] Coastline Airways', 'SFO', 'ORD',
  now() + interval '3 hours', now() + interval '3 hours 35 minutes', now() + interval '8 hours 35 minutes',
  'Boeing 737-900', 'DEMO-T2', 'DEMO-C08', 'delayed'
where not exists (select 1 from public.flights where flight_number = 'DEMO-518');

insert into public.flights
  (flight_number, airline, origin, destination, scheduled_departure, estimated_departure, arrival_at, aircraft_model, terminal, gate, status)
select 'DEMO-731', '[DEMO] Pacific Demo Air', 'BOS', 'SEA',
  now() + interval '5 hours', null, now() + interval '11 hours',
  'Boeing 787-8', 'DEMO-T1', 'DEMO-A04', 'scheduled'
where not exists (select 1 from public.flights where flight_number = 'DEMO-731');

insert into public.passengers (full_name, email, phone, loyalty_number)
select '[DEMO] Avery Morgan', 'avery.morgan@example.test', '+1 555 010 2040', 'DEMO-LOYALTY-204'
where not exists (select 1 from public.passengers where email = 'avery.morgan@example.test')
on conflict (loyalty_number) do nothing;

insert into public.passengers (full_name, email, phone, loyalty_number)
select '[DEMO] Jordan Ellis', 'jordan.ellis@example.test', '+1 555 010 5180', 'DEMO-LOYALTY-518'
where not exists (select 1 from public.passengers where email = 'jordan.ellis@example.test')
on conflict (loyalty_number) do nothing;

insert into public.passengers (full_name, email, phone, loyalty_number)
select '[DEMO] Riley Chen', 'riley.chen@example.test', '+1 555 010 7310', 'DEMO-LOYALTY-731'
where not exists (select 1 from public.passengers where email = 'riley.chen@example.test')
on conflict (loyalty_number) do nothing;

insert into public.bookings (passenger_id, flight_id, booking_reference, seat, status)
select p.id, f.id, 'DEMO-BOOK-204', '12A', 'confirmed'
from public.passengers p join public.flights f on f.flight_number = 'DEMO-204'
where p.email = 'avery.morgan@example.test'
and not exists (select 1 from public.bookings where booking_reference = 'DEMO-BOOK-204');

insert into public.bookings (passenger_id, flight_id, booking_reference, seat, status)
select p.id, f.id, 'DEMO-BOOK-518', '08C', 'disrupted'
from public.passengers p join public.flights f on f.flight_number = 'DEMO-518'
where p.email = 'jordan.ellis@example.test'
and not exists (select 1 from public.bookings where booking_reference = 'DEMO-BOOK-518');

insert into public.bookings (passenger_id, flight_id, booking_reference, seat, status)
select p.id, f.id, 'DEMO-BOOK-731', '16D', 'confirmed'
from public.passengers p join public.flights f on f.flight_number = 'DEMO-731'
where p.email = 'riley.chen@example.test'
and not exists (select 1 from public.bookings where booking_reference = 'DEMO-BOOK-731');

insert into public.disruptions (flight_id, type, reason, estimated_delay_minutes, status)
select f.id, 'delay', '[DEMO] Weather-related air traffic restrictions near the destination.', 35, 'active'
from public.flights f
where f.flight_number = 'DEMO-518'
and not exists (
  select 1 from public.disruptions d
  where d.flight_id = f.id and d.reason = '[DEMO] Weather-related air traffic restrictions near the destination.'
);

insert into public.disruptions (flight_id, type, reason, estimated_delay_minutes, status)
select f.id, 'cancellation', '[DEMO] Aircraft inspection caused a cancellation.', null, 'active'
from public.flights f
where f.flight_number = 'DEMO-731'
and not exists (
  select 1 from public.disruptions d
  where d.flight_id = f.id and d.reason = '[DEMO] Aircraft inspection caused a cancellation.'
);

insert into public.disruption_cases (disruption_id, passenger_id, booking_id, summary, status)
select d.id, p.id, b.id, '[DEMO] Delay may affect this passenger itinerary.', 'active'
from public.disruptions d
join public.flights f on f.id = d.flight_id and f.flight_number = 'DEMO-518'
join public.bookings b on b.flight_id = f.id and b.booking_reference = 'DEMO-BOOK-518'
join public.passengers p on p.id = b.passenger_id
where not exists (
  select 1 from public.disruption_cases dc
  where dc.disruption_id = d.id and dc.passenger_id = p.id and dc.booking_id is not distinct from b.id
);

insert into public.disruption_cases (disruption_id, passenger_id, booking_id, summary, status)
select d.id, p.id, b.id, '[DEMO] Cancellation requires passenger assistance.', 'active'
from public.disruptions d
join public.flights f on f.id = d.flight_id and f.flight_number = 'DEMO-731'
join public.bookings b on b.flight_id = f.id and b.booking_reference = 'DEMO-BOOK-731'
join public.passengers p on p.id = b.passenger_id
where not exists (
  select 1 from public.disruption_cases dc
  where dc.disruption_id = d.id and dc.passenger_id = p.id and dc.booking_id is not distinct from b.id
);

insert into public.alternative_flights
  (disruption_id, flight_number, airline, origin, destination, departure_at, available_seats, status)
select d.id, 'DEMO-522', '[DEMO] Coastline Airways', 'SFO', 'ORD',
  now() + interval '4 hours', 12, 'available'
from public.disruptions d
join public.flights f on f.id = d.flight_id and f.flight_number = 'DEMO-518'
where not exists (select 1 from public.alternative_flights where flight_number = 'DEMO-522');

insert into public.alternative_flights
  (disruption_id, flight_number, airline, origin, destination, departure_at, available_seats, status)
select d.id, 'DEMO-733', '[DEMO] Pacific Demo Air', 'BOS', 'SEA',
  now() + interval '6 hours', 8, 'available'
from public.disruptions d
join public.flights f on f.id = d.flight_id and f.flight_number = 'DEMO-731'
where not exists (select 1 from public.alternative_flights where flight_number = 'DEMO-733');

insert into public.assistance_requests (passenger_id, type, subject, details, status)
select p.id, 'meal', '[DEMO] Meal voucher information',
  '[DEMO] Please share meal support information while waiting for the delayed flight.', 'pending'
from public.passengers p
where p.email = 'jordan.ellis@example.test'
and not exists (
  select 1 from public.assistance_requests r
  where r.passenger_id = p.id and r.subject = '[DEMO] Meal voucher information'
);

insert into public.assistance_requests (passenger_id, type, subject, details, status)
select p.id, 'special_assistance', '[DEMO] Mobility assistance',
  '[DEMO] Example request for mobility support after a cancelled flight.', 'in_progress'
from public.passengers p
where p.email = 'riley.chen@example.test'
and not exists (
  select 1 from public.assistance_requests r
  where r.passenger_id = p.id and r.subject = '[DEMO] Mobility assistance'
);

insert into public.assistance_requests (passenger_id, type, subject, details, status)
select p.id, 'transport', '[DEMO] Ground transport',
  '[DEMO] Example request for transport information during a delay.', 'pending'
from public.passengers p
where p.email = 'avery.morgan@example.test'
and not exists (
  select 1 from public.assistance_requests r
  where r.passenger_id = p.id and r.subject = '[DEMO] Ground transport'
);

commit;
