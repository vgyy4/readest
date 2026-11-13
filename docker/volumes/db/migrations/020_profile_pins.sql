-- Migration 020: a PIN of its own for each profile.
--
-- The master PIN stays in profile_pins (one row per account). A profile's PIN
-- (salted scrypt hash) lives here, set and cleared by the master through the
-- API. Service role only: RLS is on with no policy, and the default privileges
-- Supabase grants on new public tables are revoked.

CREATE TABLE IF NOT EXISTS public.profile_user_pins (
  profile_user_id uuid NOT NULL,
  pin_hash text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profile_user_pins_pkey PRIMARY KEY (profile_user_id),
  CONSTRAINT profile_user_pins_profile_user_id_fkey FOREIGN KEY (profile_user_id) REFERENCES public.profiles (profile_user_id) ON DELETE CASCADE
);

ALTER TABLE public.profile_user_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_user_pins FROM anon, authenticated;
