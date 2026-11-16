-- Migration 022: the SHA-256 of every stored file.
--
-- The app records the SHA-256 of a file when it starts to upload it. When the upload is done the
-- server reads the stored copy back and compares (sha256_checked_at says when that last agreed),
-- and a device that downloads the file compares what it received with the same value.
-- Files uploaded before this have no value and are not checked.

ALTER TABLE public.files ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS sha256_checked_at timestamp with time zone;
