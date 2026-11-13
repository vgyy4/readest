-- Migration 021: a picture for each profile.
--
-- The picture is one of the app's stock avatars, stored by id ('av-07'). A child
-- profile keeps it on its own row; the main profile has no row there (it is the
-- account itself), so its picture lives in profile_main_meta. Service role only for
-- the new table: RLS is on with no policy, and the default privileges Supabase grants
-- on new public tables are revoked.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar text;

CREATE TABLE IF NOT EXISTS public.profile_main_meta (
  owner_id uuid NOT NULL,
  avatar text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profile_main_meta_pkey PRIMARY KEY (owner_id),
  CONSTRAINT profile_main_meta_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

ALTER TABLE public.profile_main_meta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_main_meta FROM anon, authenticated;
