-- SwasthTrack: let a caregiver who has JUST joined trigger the "X joined your care team"
-- e-mail to the patient's owner, without a service-role key.
--
-- Run AFTER 20261004000000_secure_auth_rls_soie.sql (needs profiles, patient_members and
-- is_patient_member). Idempotent: safe to run more than once.
--
-- Why an RPC: under RLS a caregiver cannot read the owner's profile, and the server must not
-- use a service-role key (docs/deployment.md). This function hands the owner's address to the
-- server only while the caller's own membership is brand new (10 minutes), which is exactly
-- the moment the notification is wanted. The address is used to send the mail and is never
-- returned to the browser by /api/email/send.

create or replace function public.get_patient_owner_contacts(p_patient uuid)
returns table (
  owner_user_id uuid,
  owner_email text,
  owner_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1
      from public.patient_members m
     where m.patient_id = p_patient
       and m.user_id = auth.uid()
       and m.status = 'active'
       and m.role <> 'owner'
       and m.created_at > now() - interval '10 minutes'
  ) then
    raise exception 'no recent join to announce for this patient' using errcode = '42501';
  end if;

  return query
    select m.user_id, p.email, p.display_name
      from public.patient_members m
      left join public.profiles p on p.id = m.user_id
     where m.patient_id = p_patient
       and m.role = 'owner'
       and m.status = 'active';
end;
$$;

revoke all on function public.get_patient_owner_contacts(uuid) from public, anon;
grant execute on function public.get_patient_owner_contacts(uuid) to authenticated;
