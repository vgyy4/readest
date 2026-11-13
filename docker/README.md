# Self-Hosting with Docker/Podman with Compose

## Stack

| service         | Image                       | Description                                       |
| --------------- | --------------------------- | ------------------------------------------------- |
| **client**      | `ghcr.io/readest/readest`   | readest frontend                                  |
| **db**          | `supabase/postgres`         | psql db with supabase extensions                  |
| **kong**        | `kong:2.8.1`                | api gateway routing requests to supabase services |
| **auth**        | `supabase/gotrue:v2.185.0`  | auth service (email, JWT)                         |
| **rest**        | `postgrest/postgrest:v14.3` | psql rest api                                     |
| **minio**       | `pgsty/minio`               | s3 storage (maintained fork of MinIO)             |
| **minio-setup** | `pgsty/mc`                  | helper container to create s3 buckets             |

### Exposed ports

| Port   | Service          |
| ------ | ---------------- |
| `3000` | readest          |
| `8000` | kong API gateway |
| `9000` | MinIO S3 API     |
| `9001` | MinIO console UI |

---

## Running with Docker/Podman Compose

### 1. setup .env

```bash
cp docker/.env.example docker/.env
```

update `docker/.env`:

- update `POSTGRES_PASSWORD` to a strong password (32+ chars)
- update `JWT_SECRET` to a random secret (32+ chars)
- regenerate `ANON_KEY` and `SERVICE_ROLE_KEY` as HS256 JWTs signed with your `JWT_SECRET` (use [jwt.io](https://jwt.io/) or a similar tool):
  - `ANON_KEY` payload: `{"role": "anon"}`
  - `SERVICE_ROLE_KEY` payload: `{"role": "service_role"}`
- set `MINIO_ROOT_PASSWORD` to a strong password

### 2. Start the Stack (pull prebuilt client image)

run from the `docker/` directory:

```bash
cd docker
docker compose up -d
```

this pulls `${READEST_IMAGE}` (default: `ghcr.io/readest/readest:latest`) instead of building the client locally.
the web client now reads `SUPABASE_PUBLIC_URL`, `SUPABASE_ANON_KEY`, `API_BASE_URL`, `OBJECT_STORAGE_TYPE`, `STORAGE_FIXED_QUOTA`, and `TRANSLATION_FIXED_QUOTA` from runtime
container env, so custom self-hosted values work with pulled images.

if you prefer Docker Hub, set `READEST_IMAGE` in `docker/.env`, for example:

```env
READEST_IMAGE=docker.io/your-dockerhub-username/readest:latest
```

replace `your-dockerhub-username` with the Docker Hub namespace that publishes your `readest` image.
for official images, use the namespace configured for this repository's Docker Hub publishing secrets.

published tags:
- `latest`: rolling image from the default branch and from release events
- `<release-tag>` (for example `v1.2.3`): published from release events
- `main`: rolling image from the default branch
- `sha-<commit>`: immutable commit tag

### Build locally instead of pulling

> **Prerequisites for local builds**: the `packages/foliate-js` and `packages/simplecc-wasm` git submodules must be initialized before building:
> ```bash
> git submodule update --init packages/foliate-js packages/simplecc-wasm
> ```
> In GitHub Codespaces this is done automatically via `.devcontainer/devcontainer.json`.

```bash
cd docker
docker compose -f compose.yaml -f compose.build.yaml up --build -d
```

### 3. Access

- Readest app: `http://localhost:3000`
- MinIO console: `http://localhost:9001` (login with `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`)

### Upgrading an existing deployment

pulling a newer client image does not touch the database volume, and the first-boot
hook only runs when that volume is empty. so after an upgrade, apply any new
migrations yourself:

```bash
cd docker
docker compose pull
docker compose up -d
docker compose exec db /docker-entrypoint-initdb.d/zz-readest-migrations.sh
```

the script records what it applied in `readest_meta.migrations` and skips those
next time, so it is safe to repeat after every upgrade.

if you had previously patched your database by hand, the script may stop on an
`already exists` error. record that file as applied and run it again:

```bash
docker compose exec db psql -U supabase_admin -c \
  "INSERT INTO readest_meta.migrations (name) VALUES ('002_add_book_shares.sql') ON CONFLICT DO NOTHING"
```

### Hot Reload (development)

> **Prerequisites**: submodules must be initialized (see above).

to develop using the compose stack, use `compose.dev.yaml` which sets the build target to `development-stage` (Next.js dev server) and mounts your local repo for hot reload:

```bash
cd docker
docker compose -f compose.yaml -f compose.dev.yaml up --build -d
```

the first mount overlays your local repo into the container. the remaining anonymous volumes shadow the directories that were pre-built inside the image, so the container's installed deps and vendor assets are used instead of what's on your host.

### Small hosts (2 GB LXC, Raspberry Pi, tiny VPS)

`compose.lowmem.yaml` keeps every service and feature but shrinks Postgres' caches and
connection count, pins the Go/Node runtimes to small heaps, and caps each container's memory:

```bash
cd docker
docker compose -f compose.yaml -f compose.lowmem.yaml up -d
```

Use the same two `-f` flags for `pull`, `up`, `down` and `exec`. Also cap Docker's own logs
(by default they grow without limit) in `/etc/docker/daemon.json`, then `systemctl restart docker`:

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
```

### Stop the Stack

```bash
cd docker
docker compose down
```

to also remove volumes (database and storage data):

```bash
cd docker
docker compose down -v
```

---

## Profiles (this fork)

One account can hold several profiles: the account itself is the **main**
profile; every other profile is a hidden, login-less user owned by it, so each
keeps its own library, reading progress, notes and stats. The main profile
chooses which of its books each profile can see (**Settings menu → Profiles…**)
and may give itself and every profile a 4-digit PIN. A profile's PIN is asked
when opening it from another profile, and the master PIN opens any of them.
A book shared with several profiles is stored once, under the main profile: each
profile only gets its own small catalog entry and its own progress and notes,
and the shared file is never copied.

Server requirements:

- Apply `volumes/db/migrations/019_profiles.sql` and `020_profile_pins.sql` (the
  migration runner does it on first boot, or run `zz-readest-migrations.sh` by
  hand when upgrading).
- The client must be built from this fork, not the upstream
  `ghcr.io/readest/readest` image. The fork's `Publish Docker image` workflow
  (run it from Actions on this branch) publishes `ghcr.io/<you>/readest:profiles`;
  set `READEST_IMAGE` to that in `docker/.env` (make the package public, or
  `docker login ghcr.io`), or build locally with `compose.build.yaml`. Why: the profile API routes live in the
  app, and they use `SUPABASE_ADMIN_KEY` (the service role key, already passed
  by `compose.yaml`) to create and read the profiles' users.

The main profile is the **admin**: once the account has a profile it does not read
(opening a book shows which profiles can see it, and lets you change that), but
it still adds books, creates and deletes profiles, sets every PIN, and chooses
each profile's books, either per profile (Profiles… → Books) or per book. The
switch under Settings → Profiles → "Main profile is for administration only"
turns this off for an account that wants to read on the main profile too.

Limits worth knowing: a profile shares the main account's sign-in on the device,
so profiles separate data and gate management behind the PIN, but are not a
security boundary against someone who deliberately crafts API requests as the
main profile. Profiles cannot upload books or manage storage, and do not sync
account-level settings, fonts, dictionaries or catalogs. Because the file is
shared, the main profile cannot delete a book from storage while a profile can
still see it (the server answers 409 until it is removed from that profile), and
deleting a book in one profile leaves the files on the device while another
profile still has it.

### Pointing the mobile and desktop apps at your server

The apps are not built for one server. On the sign-in screen, tap **Server: Readest cloud**,
type your server's address (for example `books.example.com`) and **Connect**. The app asks
`https://<address>/api/server-info` for the Supabase address and key, remembers them on the
device, and reloads. **Use Readest cloud** switches back. If the server is behind Cloudflare
Access, open **Cloudflare Access (optional)** on the same panel and enter a service token.
Switching servers signs the device out of the old one. iOS requires `https://` for a
non-local server.

The `API_BASE_URL`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` repository variables of the
iOS/Android workflows are now optional: they only set the server a build starts with.

## Audiobooks (this fork)

Audio files import like books: m4b, m4a, mp3, aac, ogg, opus, flac and wav, one
file per audiobook. Readest reads the title, author, cover art and chapters from
the file's tags (m4b and ID3 chapters included) and opens it in a player modelled
on [Voice](https://github.com/PaulWoitaschek/Voice): colors taken from the cover,
a cover you tap to play and swipe to change chapter, book progress as one pill per
chapter, a chapter switcher, a wavy seek bar with a "Back to" chip after a big
jump, rewind/fast forward (20 s by default, 5-60 s in the menu), sleep timer
(5/15/30/60 min, custom, or end of chapter), speed 0.5-3x and bookmarks (tap the
bookmark button to open them, hold it to save the current moment).

## App style (this fork)

The whole app (library, menus, dialogs, settings, reader toolbars and sidebars, and the
audiobook player) has three looks, chosen per device from the menu (☰ → **Style**, or the
reader's View menu, or the audiobook player's ⋮ menu):

- **Material** (default): the Voice look, with Material 3 Expressive shapes: big rounded
  corners, pill buttons, tonal surfaces tinted by the theme's color.
- **Liquid glass**: the same shapes with frosted, translucent surfaces and a bright rim
  over a soft colored background. It uses `backdrop-filter` (with the `-webkit-` prefix),
  which iOS 15 and Android WebView support; where it is missing the surfaces turn solid.
- **Classic**: the original Readest look.

The book text and the reader's own themes are not restyled, and e-ink mode is never touched.

The same player runs on Android, iOS and desktop, with lock screen and
notification controls and background playback. Progress is kept per profile and
synced like any book's (the position is stored in whole seconds).

Not yet: audiobooks made of many files (join them into one m4b first), skip
silence, volume boost, listening history, and streaming from a server (the file
is stored on the device like any book).

## Behind Cloudflare Tunnel and Cloudflare Access

Serve everything from one hostname (for example `books.yourdomain.com`) and give the tunnel
three public-hostname rules, most specific first: path `^/(auth|rest)/v1/` to
`http://localhost:8000`, path `^/readest-files/` to `http://localhost:9000`, and no path to
`http://localhost:3000`. Leave the HTTP Host Header empty. Cloudflare caps one request at
100 MB on the Free plan, which limits uploads of very large books.

If an **Access** application (Google sign-in, one-time PIN, ...) protects the hostname, a
browser signs in once and carries on. The mobile and desktop apps cannot do that login, so
pick one:

1. **Bypass policy (simplest).** Add an Access policy with action **Bypass** for the paths
   `/auth/v1/*`, `/rest/v1/*`, `/readest-files/*` and `/api/*` of that hostname. They are
   still protected by the app's own login (JWT) and signed storage links; only the web page
   at `/` stays behind Google. Nothing to build into the apps.
2. **Service token.** Create a service token (Zero Trust, Access, Service Auth) and a policy
   with action **Service Auth** for it. Set the repository variable `CF_ACCESS_CLIENT_ID` and
   the secret `CF_ACCESS_CLIENT_SECRET` before running the iOS/Android workflows; the apps
   then send `CF-Access-Client-Id/Secret` with every request to your server (and only to it).
   The secret is inside the app, so keep that app private. In the Access application's CORS
   settings also turn on **Bypass options requests to origin**, because browsers send
   preflight requests without credentials.

Access signs users in before they reach the server, so a one-time-PIN or Google login at
Access works with either option. The app's own account login (email and password) is
separate; email one-time codes in the app itself would need SMTP set up for the auth service.

## Database schema

| path                          | role                                                                       |
| ----------------------------- | -------------------------------------------------------------------------- |
| `volumes/db/init/schema.sql`  | base schema (books, book_configs, book_notes, files)                         |
| `volumes/db/migrations/*.sql` | every schema change since, applied in filename order                         |
| `volumes/db/apply-migrations.sh` | applies the migrations and records them in `readest_meta.migrations`      |

on an empty database volume the supabase image runs everything under
`/docker-entrypoint-initdb.d` in glob order: its own `migrate.sh` (supabase core
schema plus `init-scripts/100-schema.sql`, which is `schema.sql`), then
`zz-readest-migrations.sh`, which is `apply-migrations.sh`. it globs the mounted
migrations directory, so adding a migration file needs no compose change.

---

## Serving from a custom domain

the browser talks to three of these services directly, so each needs a URL that
resolves from outside the docker network:

| variable              | what the browser uses it for                                   |
| --------------------- | -------------------------------------------------------------- |
| `SITE_URL`            | the readest client itself                                        |
| `SUPABASE_PUBLIC_URL` | kong, which routes `/auth/v1/…` and `/rest/v1/…`                 |
| `S3_PUBLIC_ENDPOINT`  | minio, reached through path-style presigned URLs                 |

`SUPABASE_PUBLIC_URL` and `S3_PUBLIC_ENDPOINT` default to `http://${HOST_IP}:<port>`,
which suits a plain IP/port deployment; set them in `docker/.env` to override that.
putting everything on one origin also means no cross-origin requests at all:

```env
HOST_IP=your-domain.com
SITE_URL=https://your-domain.com
API_EXTERNAL_URL=https://your-domain.com
ADDITIONAL_REDIRECT_URLS=https://your-domain.com/**
SUPABASE_PUBLIC_URL=https://your-domain.com
S3_PUBLIC_ENDPOINT=https://your-domain.com
```

`nginx.conf.example` is a working starting point for terminating TLS in front of
the stack. two things it gets right that are easy to miss: the `Host` header has
to reach minio unchanged or the presigned signatures will not verify, and the
request body limit has to be lifted on the bucket location or large book uploads
are truncated.

### CJK fonts on a custom domain

the reader loads a few CJK webfont bundles from Readest's CDN, which only sends
`Access-Control-Allow-Origin` for readest.com origins, so the browser blocks them
on a self-hosted domain. mirror
`https://storage.readest.com/public/font/dist/<Family>/` (and the `.woff2` files it
references) onto a path your proxy serves, then point the client at it:

```env
FONT_BASE_URL=https://your-domain.com/fonts
```

leaving `FONT_BASE_URL` empty keeps the default CDN. system and Google fonts are
unaffected either way.

---

## Building the Dockerfile standalone

```bash
docker build \
  --target production-stage \
  --build-arg NEXT_PUBLIC_APP_PLATFORM=web \
  -t readest-client \
  .
```

run the built image:

```bash
docker run -p 3000:3000 \
  -e SUPABASE_URL=http://host.docker.internal:8000 \
  -e SUPABASE_PUBLIC_URL=http://localhost:8000 \
  -e SUPABASE_ANON_KEY=<anon-key> \
  -e SUPABASE_ADMIN_KEY=<service-role-key> \
  -e API_BASE_URL=http://localhost:3000 \
  -e OBJECT_STORAGE_TYPE=s3 \
  -e S3_ENDPOINT=http://host.docker.internal:9000 \
  -e S3_PUBLIC_ENDPOINT=http://localhost:9000 \
  -e S3_REGION=us-east-1 \
  -e S3_BUCKET_NAME=readest-files \
  -e S3_ACCESS_KEY_ID=<minio-user> \
  -e S3_SECRET_ACCESS_KEY=<minio-password> \
  -e STORAGE_FIXED_QUOTA=1073741824 \
  -e TRANSLATION_FIXED_QUOTA=50000 \
  readest-client
```

on Linux, some Docker setups do not resolve `host.docker.internal` by default.
in that case, either replace it with your host IP or run with:
`--add-host=host.docker.internal:host-gateway`.
