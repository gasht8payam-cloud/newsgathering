# Newsroom Command Dashboard

News-gathering dashboard for a TV newsroom (150+ journalists): live incoming feed, verification queue, story pipeline (Lead → Assigned → Filming → Editing → On air), and team status. Static front-end + Supabase (Postgres, Auth, Realtime).

## Architecture
- `index.html`, `app.js`, `config.js` – static front-end (host anywhere: Netlify, Vercel, GitHub Pages, Nginx)
- Supabase – tables `profiles`, `feed_items`, `stories`, `audit_log`; Row Level Security on every table; Realtime on feed/stories/profiles
- Roles: `editor` (full control, audit log, deletes), `producer` (adds feed items, audit log), `reporter` (verify, claim, create/advance stories)

## Setup
1. Open `index.html` through any static server (`npx serve .`).
2. Sign up in the app. New users are `reporter` by default.
3. Promote the first editor in the Supabase SQL editor:
   `update public.profiles set role = 'editor' where id = '<user uuid>';`
4. For production: enable email confirmation, set the site URL in Supabase Auth, and add a rate limit.

## Roadmap
Wire/social ingestion workers (service-role key, server-side only), map view, rundown integration (ENPS/iNews), push notifications, RTL (Arabic/Kurdish) layout, per-desk views.
