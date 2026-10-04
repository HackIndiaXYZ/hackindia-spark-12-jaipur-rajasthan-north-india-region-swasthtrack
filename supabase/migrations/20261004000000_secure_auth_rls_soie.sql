-- SwasthTrack: real authentication, patient-scoped Row Level Security, caregiver
-- membership, and SOIE (conversation, feedback, memory, telemetry) tables.
--
-- IDEMPOTENT: safe to run more than once. Run it in the Supabase SQL editor.
--
-- READ BEFORE RUNNING
--   * This REMOVES the old "anyone with the anon key can read/write everything"
--     policies. After it runs, only signed-in members of a patient can see that
--     patient's data. Existing patient rows become invisible until you link them
--     to an account with supabase/scripts/link_existing_patient.sql.
--   * Sign up in the app first (email + password + email OTP), then run the link
--     script with that email and the patient's id.
--   * Tables used here are NEW names (profiles, patient_members, caregiver_invites)
--     so they cannot collide with the unused user_profiles / patient_memberships /
--     caregiver_invitations tables described in older docs.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Back-fill profiles for accounts that already exist.
insert into public.profiles (id, email, display_name)
select u.id, u.email, split_part(coalesce(u.email, ''), '@', 1)
from auth.users u
on conflict (id) do nothing;

-- A signed-in user may never promote themselves. Roles change only from the SQL
-- editor / service role.
create or replace function public.profiles_protect_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and current_user in ('authenticated', 'anon') then
    raise exception 'profiles.role cannot be changed from the client';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.profiles_protect_role();

-- ---------------------------------------------------------------------------
-- 2. patient_members (who may see / edit which patient)
--    owner  = manages caregivers, can delete the patient
--    editor = can log data
--    viewer = read-only
-- ---------------------------------------------------------------------------
create table if not exists public.patient_members (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (patient_id, user_id)
);
create index if not exists idx_patient_members_user on public.patient_members (user_id, status);
create index if not exists idx_patient_members_patient on public.patient_members (patient_id, status);

-- SECURITY DEFINER so RLS policies can call them without recursing into
-- patient_members' own policies.
create or replace function public.is_patient_member(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.patient_members m
    where m.patient_id = p_patient and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function public.can_write_patient(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.patient_members m
    where m.patient_id = p_patient and m.user_id = auth.uid() and m.status = 'active'
      and m.role in ('owner', 'editor')
  );
$$;

create or replace function public.is_patient_owner(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.patient_members m
    where m.patient_id = p_patient and m.user_id = auth.uid() and m.status = 'active'
      and m.role = 'owner'
  );
$$;

revoke all on function public.is_patient_member(uuid) from public, anon;
revoke all on function public.can_write_patient(uuid) from public, anon;
revoke all on function public.is_patient_owner(uuid) from public, anon;
grant execute on function public.is_patient_member(uuid) to authenticated;
grant execute on function public.can_write_patient(uuid) to authenticated;
grant execute on function public.is_patient_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. food catalogue ownership (custom foods belong to the user who made them)
-- ---------------------------------------------------------------------------
alter table public.food_items add column if not exists created_by uuid default auth.uid();

-- ---------------------------------------------------------------------------
-- 4. patient_settings (was queried by the app but never had a migration)
-- ---------------------------------------------------------------------------
create table if not exists public.patient_settings (
  patient_id uuid primary key references public.patients (id) on delete cascade,
  daily_calorie_target integer not null default 1600 check (daily_calorie_target > 0),
  daily_step_goal integer not null default 6000 check (daily_step_goal > 0),
  sleep_target_hours numeric not null default 7 check (sleep_target_hours > 0 and sleep_target_hours <= 14),
  bp_monitoring_schedule text not null default 'morning_evening'
    check (bp_monitoring_schedule in ('morning_evening', 'morning_only', 'evening_only', 'custom')),
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  height_unit text not null default 'cm' check (height_unit in ('cm', 'ft_in')),
  distance_unit text not null default 'km' check (distance_unit in ('km', 'miles')),
  timezone text not null default 'Asia/Kolkata',
  preferred_language text not null default 'bilingual' check (preferred_language in ('hi', 'en', 'bilingual')),
  alerts_enabled jsonb not null default '{"bp":true,"medicine":true,"activity":true,"sleep":true,"missingData":true}'::jsonb,
  -- Per-patient blood-pressure thresholds. Defaults follow AHA/ACC 2017 + a
  -- stroke-secondary-prevention target of <130/80. A clinician can tighten or
  -- relax these per patient; the app never hard-codes them.
  bp_targets jsonb not null default
    '{"target_systolic":130,"target_diastolic":80,"alert_systolic":160,"alert_diastolic":100,"crisis_systolic":180,"crisis_diastolic":120,"low_systolic":90,"low_diastolic":60}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. caregiver_invites (short-lived codes, created and redeemed via RPC only)
-- ---------------------------------------------------------------------------
create table if not exists public.caregiver_invites (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  role text not null default 'viewer' check (role in ('editor', 'viewer')),
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_caregiver_invites_pending_code
  on public.caregiver_invites (code) where status = 'pending';
create index if not exists idx_caregiver_invites_patient on public.caregiver_invites (patient_id, status);

create table if not exists public.caregiver_invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_invite_attempts_user on public.caregiver_invite_attempts (user_id, attempted_at desc);

-- ---------------------------------------------------------------------------
-- 6. SOIE tables
-- ---------------------------------------------------------------------------
create table if not exists public.soie_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);
create index if not exists idx_soie_sessions_user on public.soie_sessions (user_id, last_active_at desc);

create table if not exists public.soie_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.soie_sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Structured assistant answer (claims, cited facts, sources, confidence, safety level).
  answer jsonb,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists idx_soie_messages_session on public.soie_messages (session_id, created_at);

create table if not exists public.soie_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.soie_messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating text not null check (rating in ('helpful', 'not_helpful')),
  comment text,
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create table if not exists public.soie_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid references public.soie_sessions (id) on delete set null,
  patient_id uuid references public.patients (id) on delete set null,
  intent text,
  status text not null check (status in ('success', 'refused', 'emergency', 'no_data', 'validation_failed', 'fallback', 'error', 'rate_limited')),
  tools_used jsonb,
  data_points integer,
  latency_ms integer,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_soie_events_user_time on public.soie_events (user_id, created_at desc);

-- Things the family tells SOIE to remember about the patient
-- ("allergic to milk", "walks after dinner", "target weight 70"). Patient-scoped.
create table if not exists public.soie_memories (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  kind text not null check (kind in ('allergy', 'preference', 'routine', 'goal', 'note')),
  content text not null check (length(content) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_soie_memories_patient on public.soie_memories (patient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------------

-- 7a. Drop EVERY existing policy on the tables we are about to lock down, so the
--     old "TO anon USING (true)" policies cannot survive.
do $$
declare
  t text;
  pol record;
  all_tables text[] := array[
    'patients', 'medical_conditions', 'medicines', 'food_items', 'food_portions',
    'patient_food_favorites', 'food_logs', 'bp_logs', 'weight_logs', 'activity_logs',
    'sleep_logs', 'medicine_logs', 'daily_checklists', 'patient_settings',
    'profiles', 'patient_members', 'caregiver_invites', 'caregiver_invite_attempts',
    'soie_sessions', 'soie_messages', 'soie_feedback', 'soie_events', 'soie_memories'
  ];
begin
  foreach t in array all_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', pol.policyname, t);
      end loop;
      -- Defence in depth: the anonymous role gets no table privileges at all.
      execute format('revoke all on table public.%I from anon', t);
    end if;
  end loop;
end $$;

-- 7b. Tables carrying a patient_id: members read, owners/editors write.
do $$
declare
  t text;
  scoped text[] := array[
    'medical_conditions', 'medicines', 'patient_food_favorites', 'food_logs', 'bp_logs',
    'weight_logs', 'activity_logs', 'sleep_logs', 'medicine_logs', 'daily_checklists',
    'patient_settings', 'soie_memories'
  ];
begin
  foreach t in array scoped loop
    if to_regclass('public.' || t) is not null then
      execute format('create policy %I on public.%I for select to authenticated using (public.is_patient_member(patient_id))', t || '_select', t);
      execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write_patient(patient_id))', t || '_insert', t);
      execute format('create policy %I on public.%I for update to authenticated using (public.can_write_patient(patient_id)) with check (public.can_write_patient(patient_id))', t || '_update', t);
      execute format('create policy %I on public.%I for delete to authenticated using (public.can_write_patient(patient_id))', t || '_delete', t);
    end if;
  end loop;
end $$;

-- 7c. patients: rows are created through create_patient() so an owner membership
--     is always created in the same transaction.
create policy patients_select on public.patients
  for select to authenticated using (public.is_patient_member(id));
create policy patients_update on public.patients
  for update to authenticated using (public.can_write_patient(id)) with check (public.can_write_patient(id));
create policy patients_delete on public.patients
  for delete to authenticated using (public.is_patient_owner(id));

-- 7d. Shared food catalogue: everyone signed in can read; custom foods are
--     editable only by their creator. Seeded rows (created_by is null) are
--     read-only from the client.
create policy food_items_select on public.food_items
  for select to authenticated using (true);
create policy food_items_insert on public.food_items
  for insert to authenticated with check (coalesce(is_custom, false) = true and created_by = auth.uid());
create policy food_items_update on public.food_items
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy food_items_delete on public.food_items
  for delete to authenticated using (created_by = auth.uid());

create policy food_portions_select on public.food_portions
  for select to authenticated using (true);
create policy food_portions_write on public.food_portions
  for all to authenticated
  using (exists (select 1 from public.food_items f where f.id = food_item_id and f.created_by = auth.uid()))
  with check (exists (select 1 from public.food_items f where f.id = food_item_id and f.created_by = auth.uid()));

-- 7e. profiles: read/update your own row (role is protected by trigger).
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 7f. patient_members: you can see your own memberships; owners see their
--     patient's whole roster. ALL writes go through the RPCs below.
create policy patient_members_select on public.patient_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_patient_owner(patient_id));

-- 7g. caregiver invites: only the owner can see them; created/redeemed via RPC.
create policy caregiver_invites_select on public.caregiver_invites
  for select to authenticated using (public.is_patient_owner(patient_id));
-- caregiver_invite_attempts: no policies on purpose (RPC-only).

-- 7h. SOIE: your own sessions, for patients you belong to.
create policy soie_sessions_all on public.soie_sessions
  for all to authenticated
  using (user_id = auth.uid() and public.is_patient_member(patient_id))
  with check (user_id = auth.uid() and public.is_patient_member(patient_id));

create policy soie_messages_all on public.soie_messages
  for all to authenticated
  using (exists (select 1 from public.soie_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.soie_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy soie_feedback_all on public.soie_feedback
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.soie_messages m
      join public.soie_sessions s on s.id = m.session_id
      where m.id = message_id and s.user_id = auth.uid()
    )
  );

create policy soie_events_select on public.soie_events
  for select to authenticated using (user_id = auth.uid());
create policy soie_events_insert on public.soie_events
  for insert to authenticated with check (user_id = auth.uid());

-- 7i. Everything the signed-in role is allowed to touch needs table privileges
--     too (RLS then narrows rows). Idempotent grants.
grant select, insert, update, delete on
  public.medical_conditions, public.medicines, public.patient_food_favorites, public.food_logs,
  public.bp_logs, public.weight_logs, public.activity_logs, public.sleep_logs,
  public.medicine_logs, public.daily_checklists, public.patient_settings, public.soie_memories,
  public.patients, public.food_items, public.food_portions, public.profiles,
  public.soie_sessions, public.soie_messages, public.soie_feedback
to authenticated;
grant select on public.patient_members, public.caregiver_invites to authenticated;
grant select, insert on public.soie_events to authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPCs (SECURITY DEFINER; every one authorises with auth.uid() itself)
-- ---------------------------------------------------------------------------

-- 8a. Create a patient and make the caller its owner, atomically.
create or replace function public.create_patient(
  p_name text,
  p_age integer default null,
  p_gender text default null,
  p_height_cm numeric default null,
  p_current_weight_kg numeric default null,
  p_target_weight_kg numeric default null,
  p_daily_calorie_target integer default 1600
)
returns public.patients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient public.patients;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'patient name is required';
  end if;

  insert into public.patients (name, age, gender, height_cm, current_weight_kg, target_weight_kg, daily_calorie_target)
  values (trim(p_name), p_age, p_gender, p_height_cm, p_current_weight_kg, p_target_weight_kg, coalesce(p_daily_calorie_target, 1600))
  returning * into v_patient;

  insert into public.patient_members (patient_id, user_id, role)
  values (v_patient.id, auth.uid(), 'owner');

  insert into public.patient_settings (patient_id, daily_calorie_target)
  values (v_patient.id, coalesce(p_daily_calorie_target, 1600))
  on conflict (patient_id) do nothing;

  return v_patient;
end;
$$;

-- 8b. Owner creates a 15-minute invite code for a caregiver.
create or replace function public.create_caregiver_invite(p_patient uuid, p_role text default 'viewer')
returns public.caregiver_invites
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_invite public.caregiver_invites;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_patient_owner(p_patient) then
    raise exception 'only the patient owner can invite caregivers' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'role must be editor or viewer';
  end if;

  update public.caregiver_invites
     set status = 'cancelled'
   where patient_id = p_patient and status = 'pending';

  for i in 1..8 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
  end loop;

  insert into public.caregiver_invites (patient_id, created_by, role, code, expires_at)
  values (p_patient, auth.uid(), p_role, v_code, now() + interval '15 minutes')
  returning * into v_invite;

  return v_invite;
end;
$$;

-- 8c. Caregiver redeems a code. Rate-limited to 10 attempts / 15 minutes / user.
create or replace function public.accept_caregiver_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.caregiver_invites;
  v_attempts integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select count(*) into v_attempts
    from public.caregiver_invite_attempts
   where user_id = auth.uid() and attempted_at > now() - interval '15 minutes';
  if v_attempts >= 10 then
    raise exception 'too many attempts, try again later' using errcode = '54000';
  end if;
  insert into public.caregiver_invite_attempts (user_id) values (auth.uid());

  select * into v_invite
    from public.caregiver_invites
   where code = upper(trim(p_code)) and status = 'pending'
   for update;

  if not found then
    raise exception 'invalid or already used invite code';
  end if;
  if v_invite.expires_at < now() then
    update public.caregiver_invites set status = 'expired' where id = v_invite.id;
    raise exception 'invite code has expired';
  end if;

  insert into public.patient_members (patient_id, user_id, role, invited_by)
  values (v_invite.patient_id, auth.uid(), v_invite.role, v_invite.created_by)
  on conflict (patient_id, user_id) do update
    set status = 'active',
        role = case when public.patient_members.role = 'owner' then 'owner' else excluded.role end;

  update public.caregiver_invites
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v_invite.id;

  return v_invite.patient_id;
end;
$$;

-- 8d. Owner's view of the roster (joins profiles, which clients cannot read).
create or replace function public.list_patient_members(p_patient uuid)
returns table (
  member_id uuid,
  user_id uuid,
  email text,
  display_name text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_patient_owner(p_patient) then
    raise exception 'only the patient owner can list members' using errcode = '42501';
  end if;
  return query
    select m.id, m.user_id, p.email, p.display_name, m.role, m.status, m.created_at
      from public.patient_members m
      left join public.profiles p on p.id = m.user_id
     where m.patient_id = p_patient
     order by m.created_at;
end;
$$;

-- 8e. Owner revokes (or restores) a caregiver, or changes their role.
create or replace function public.set_patient_member(p_member uuid, p_status text default null, p_role text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.patient_members;
begin
  select * into v_member from public.patient_members where id = p_member;
  if not found then
    raise exception 'member not found';
  end if;
  if not public.is_patient_owner(v_member.patient_id) then
    raise exception 'only the patient owner can manage members' using errcode = '42501';
  end if;
  if v_member.user_id = auth.uid() then
    raise exception 'you cannot change your own membership';
  end if;
  if p_status is not null and p_status not in ('active', 'revoked') then
    raise exception 'invalid status';
  end if;
  if p_role is not null and p_role not in ('owner', 'editor', 'viewer') then
    raise exception 'invalid role';
  end if;

  update public.patient_members
     set status = coalesce(p_status, status),
         role = coalesce(p_role, role)
   where id = p_member;
end;
$$;

revoke all on function public.create_patient(text, integer, text, numeric, numeric, numeric, integer) from public, anon;
revoke all on function public.create_caregiver_invite(uuid, text) from public, anon;
revoke all on function public.accept_caregiver_invite(text) from public, anon;
revoke all on function public.list_patient_members(uuid) from public, anon;
revoke all on function public.set_patient_member(uuid, text, text) from public, anon;
grant execute on function public.create_patient(text, integer, text, numeric, numeric, numeric, integer) to authenticated;
grant execute on function public.create_caregiver_invite(uuid, text) to authenticated;
grant execute on function public.accept_caregiver_invite(text) to authenticated;
grant execute on function public.list_patient_members(uuid) to authenticated;
grant execute on function public.set_patient_member(uuid, text, text) to authenticated;
