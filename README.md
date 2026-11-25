# FlightCare

FlightCare is a React + Vite flight-disruption, passenger-assistance, and flight-tracking workspace. It uses Supabase Authentication and PostgreSQL with row-level security (RLS). Live aircraft positions come from the public adsb.lol ADS-B API. Commercial flight-status lookups and scheduled-flight data are provided separately by Aviationstack when configured. Alternative selections only record a passenger preference and do not issue a ticket or create a booking.

## Run locally

1. Install Node.js (LTS) and open this project folder in VS Code.
2. In the project root, copy `.env.example` to a new file named `.env`.
3. In the Supabase dashboard, open **Project Settings → API**. Copy the **Project URL** into `VITE_SUPABASE_URL`, and copy the project's **publishable key** into `VITE_SUPABASE_PUBLISHABLE_KEY`. The legacy `anon` key can also be used. Do not use a `service_role` or secret key in this frontend.
4. Follow **Supabase setup** below and apply `supabase/schema.sql`.
5. Run `npm install`, then `npm run dev`, and open the local URL printed by Vite.

Vite reads `.env` at startup. Stop and restart `npm run dev` after changing those values. The login page explicitly indicates when Supabase is not configured. This project has not been connected to your Supabase project until you supply its URL/key and successfully apply the SQL.

## Supabase setup

1. Create a Supabase project.
2. In its dashboard, open **SQL Editor → New query**.
3. Open `supabase/schema.sql` in VS Code, copy its contents into the SQL Editor, and run it. It creates the tables, indexes, profile-on-signup trigger, and role-aware RLS policies.
   For an existing project with the older FlightCare tables, run `supabase/migrations/20261127_align_legacy_schema.sql` instead of rerunning the full schema. It adds the app's missing fields and tables, retains legacy columns, and adds policies that keep passenger data scoped to its owner or staff.
   If this project is already installed and only `public.passengers` is missing, do not rerun the full schema. Instead, run `supabase/migrations/20260603_create_passengers.sql` as a separate query. It adds the missing passenger table only if needed, adds a nullable passenger relationship to assistance requests without deleting existing requests, backfills passenger rows for existing passenger profiles, and enables owner/staff RLS. The migration stops if an existing table has incompatible columns or the assistance relationship points elsewhere.
   If `public.passengers` exists but reports a table permission error, run `supabase/migrations/20261125_fix_passengers_permissions.sql`. It grants table access only to `authenticated` and replaces passenger policies with staff CRUD, admin-only deletion, and passenger self-read rules. It keeps RLS enabled and removes anonymous/public table grants.
4. Register your first account at `/register`. New accounts are assigned `passenger` by the database trigger; the registration form cannot choose a staff role.
5. To make that first account the administrator, run this once in the Supabase SQL Editor, replacing the email with your account email:

   ```sql
   update public.profiles
   set role = 'admin'
   where email = 'you@example.com';
   ```

   This is an administrative SQL operation, not a profile setting. Admins can update other staff profiles from **Staff management**, but database policies prevent a user from changing their own role through the application.
6. After the schema is aligned, load optional, clearly marked staff-demo records by running `supabase/demo_seed.sql` in the SQL Editor. These shared sample records are fictional and do not create cases or notifications for real accounts. Passenger RLS remains private, so passenger logins only see records linked to their own account.
   The older `supabase/seed.sql` also contains optional fictional examples.
7. Sign out/in after changing your role so the refreshed profile is loaded.

## Live flight tracking and commercial schedules

- **Live aircraft map and positions:** The authenticated **Flight tracking** page opens on a single full-world Esri World Imagery view with zoom controls. Imagery is not live. For worldwide live aircraft, configure OpenSky OAuth client credentials as the `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET` Supabase Edge Function secrets; see [OpenSky authentication](https://openskynetwork.github.io/opensky-api/rest.html#authentication). Its `/states/all` endpoint returns worldwide state vectors, is credit-limited, and the map refreshes every five minutes with a short server cache. Without those credentials the app falls back to the public [adsb.lol API](https://www.adsb.lol/docs/open-data/api), which only returns aircraft within 250 nm of the selected area. No adsb.lol key is required; anonymous access is limited to 500 requests per day per IP and `429` responses are reported in the UI. An optional adsb.lol key may be stored as the `ADSBLOL_API_KEY` secret to increase the quota. The public ADS-B APIs do not provide browser CORS headers, so use the included Supabase Edge Function. Selecting **My area** requests browser location permission. Esri imagery is credited on the map. Short tracks contain only ADS-B positions observed in the current page session.
- **Flight-number lookup and commercial status:** The page can query ADS-B callsigns without a key, but ADS-B coverage does not guarantee airline names, schedule times, or airline status. For commercial status and schedule data, create an [Aviationstack account](https://aviationstack.com/signup/free/) and store its key only as a Supabase Edge Function secret. Do not put this provider key in Vite's browser `.env` file.

- Install the [Supabase CLI](https://supabase.com/docs/guides/cli), run `supabase login`, and link your existing project with `supabase link --project-ref <your-project-ref>`. Deploy the proxy with `supabase functions deploy flight-data`. If you obtain an adsb.lol key, store it with `supabase secrets set ADSBLOL_API_KEY=<your-real-adsb.lol-key>`.
- The Aviationstack `/flights` endpoint is listed for all plans; a registered provider key and the plan's request quota still apply. The Edge Function accepts the secret name `AVIATIONSTACK_ACCESS_KEY` or `AVIATIONSTACK_API_KEY`; the first is canonical. To set it with the CLI, use `supabase secrets set AVIATIONSTACK_ACCESS_KEY=<your-real-aviationstack-key>`, then deploy the function. Aviationstack lists `/flight_schedules` as **Basic or higher** (paid), so upcoming commercial schedules are not available on its free plan. The Edge Function keeps the provider key out of the browser. The browser calls that function with the current signed-in Supabase session.
- This project does not include your Supabase URL/key or deploy functions to your project automatically. Until the function is deployed and the key is configured, schedules and commercial flight records are explicitly unavailable; live ADS-B tracking remains independent. Missing provider responses are never filled with sample or estimated flights.

## Roles

- **Admin:** all operational pages, staff-role management, and settings.
- **Operations Manager:** dashboard, flights, disruptions, passengers, alternatives, assistance, notifications, analytics, profile and settings.
- **Customer Service:** dashboard, disruptions, passenger records, assistance, notifications, profile and settings.
- **Passenger:** private portal for their own bookings, disruption cases, eligible alternatives, assistance requests, notifications and profile.

Pages use the signed-in Supabase session. Passenger visibility is enforced by RLS policies that connect records through the authenticated user's passenger profile. The SQL policies—not client-side navigation—are the security boundary. Do not disable RLS or add public read/write policies.

## Included workflows

- Live dashboard and analytics queries with loading, empty and database-error states.
- Flight, disruption, passenger, alternative, assistance, notification and staff record views.
- Search and status/airline filtering where applicable; create/edit/delete actions where authorized.
- Header route search accepts IATA codes such as `DEL to BOM`, filters saved schedules by date, and shows seat counts only for rebooking alternatives visible to the signed-in user. Regular schedules do not include seat inventory, and ticket prices are not provided.
- Confirmation before deleting supported records and toast feedback for mutations.
- Passenger assistance submission and status tracking.
- Alternative-flight preference capture without automatic booking or ticket issue.
- Password reset email and authenticated password update.

## Project layout

- `src/components/` — authenticated navigation, tables, loading state and notifications.
- `src/pages/` — dashboards and operational/authentication pages.
- `src/context/AuthContext.jsx` — persisted Supabase session and profile role.
- `src/lib/supabase.js` — environment-based Supabase client.
- `supabase/schema.sql` — PostgreSQL tables, triggers, indexes and RLS.
- `supabase/migrations/20260603_create_passengers.sql` — additive migration for existing projects missing the passenger dataset.
- `supabase/migrations/20261125_fix_passengers_permissions.sql` — authenticated table grants and role-aware passenger RLS policies.
- `supabase/migrations/20261127_align_legacy_schema.sql` — additive compatibility migration from the older connected-project schema.
- `supabase/seed.sql` — optional fictional sample records.
- `supabase/demo_seed.sql` — idempotent, clearly labelled staff demo flights, bookings, disruptions, alternatives and assistance requests.

## Useful commands

```bash
npm run dev
npm run build
npm run lint
```

If authentication works but a page reports missing tables or permission errors, check that the SQL schema ran in the correct Supabase project and that the signed-in role is correct. The app deliberately reports these errors rather than displaying fabricated statistics.

## Deploy to Netlify

The repository includes `netlify.toml` for Vite (`npm run build`, publish `dist`) and React Router's SPA fallback. In Netlify, import the GitHub repository and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under **Site configuration → Environment variables**, then deploy. Use the Supabase publishable key only; never add a service-role or secret key to the frontend or Netlify build variables.
