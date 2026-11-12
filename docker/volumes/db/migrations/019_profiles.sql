-- Migration 019: multiple profiles under one account.
--
-- A child profile is a hidden "shadow" auth user owned by the real account, so
-- every per-user table (books, book_configs, book_notes, files, stats, ...)
-- already separates its progress with no schema change. The API maps a request
-- carrying `X-Readest-Profile` to that shadow user after checking this table.
-- The real account is the master profile and sees its own rows as before.

CREATE TABLE IF NOT EXISTS public.profiles (
  profile_user_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (profile_user_id),
  CONSTRAINT profiles_profile_user_id_fkey FOREIGN KEY (profile_user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT profiles_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_profiles_owner_id ON public.profiles (owner_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- The owner may read the list; every write goes through the API's service role,
-- which also creates the shadow auth user.
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);

-- Master PIN (salted scrypt hash). Service role only: RLS is on with no policy,
-- and the default privileges Supabase grants on new public tables are revoked.
CREATE TABLE IF NOT EXISTS public.profile_pins (
  owner_id uuid NOT NULL,
  pin_hash text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profile_pins_pkey PRIMARY KEY (owner_id),
  CONSTRAINT profile_pins_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

ALTER TABLE public.profile_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_pins FROM anon, authenticated;
