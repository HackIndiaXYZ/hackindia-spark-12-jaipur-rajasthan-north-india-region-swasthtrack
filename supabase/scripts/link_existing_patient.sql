-- Link an EXISTING patient (for example Papa's original record) to a real account.
--
-- After 20261004000000_secure_auth_rls_soie.sql runs, old patient rows have no
-- members, so nobody can see them. Do this once:
--
--   1. Sign up in the app with your email (password + email OTP).
--   2. Put your email and the patient id below. List patient ids with:
--        select id, name, created_at from public.patients order by created_at;
--   3. Run this script in the Supabase SQL editor (it runs as postgres, so it is
--      allowed to write memberships directly).

do $$
declare
  v_email   text := 'you@example.com';                          -- <-- your login email
  v_patient uuid := '00000000-0000-0000-0000-000000000000';     -- <-- patient id to link (see query above)
  v_user    uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'No account for % yet. Sign up in the app first.', v_email;
  end if;
  if not exists (select 1 from public.patients where id = v_patient) then
    raise exception 'No patient with id %', v_patient;
  end if;

  insert into public.patient_members (patient_id, user_id, role, status)
  values (v_patient, v_user, 'owner', 'active')
  on conflict (patient_id, user_id) do update set role = 'owner', status = 'active';

  insert into public.patient_settings (patient_id)
  values (v_patient)
  on conflict (patient_id) do nothing;

  raise notice 'Linked % as owner of patient %', v_email, v_patient;
end $$;

-- Optional: make yourself an admin (shows the developer tools in the UI).
-- update public.profiles set role = 'admin' where lower(email) = lower('you@example.com');
