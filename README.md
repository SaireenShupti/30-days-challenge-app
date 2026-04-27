# 30 Days Together — SPA

A single-page web app for two people to share a 30-day challenge with editable daily tasks, daily check-ins (workout / home food / ate out / mood / notes), shared progress, and gentle nudges.

## File layout

```
spa/
├── index.html      ← single-page shell, loads CSS + JS
├── styles.css      ← pastel, mobile-first styles
├── app.js          ← router, state, all rendering
├── supabase.js     ← data adapter; mock fallback when no creds
├── schema.sql      ← run once in Supabase to create tables + seed
└── README.md       ← this file
```

Just drop the whole `spa/` folder on any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, or open `index.html` directly).

## 1 · Run it locally (zero config — demo mode)

Open `spa/index.html` in a browser. With no Supabase credentials, it runs in **demo mode** using an in-memory mock — perfect for trying the UI. A yellow banner reminds you nothing is being saved.

> Demo mode does NOT use `localStorage` for progress. Data lives in memory and resets on reload.

## 2 · Connect Supabase (real sync)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard → **SQL Editor** → paste the contents of `schema.sql` → **Run**. This creates the tables and seeds one challenge with two members: **Saireen** and **Kaisu**.
3. In **Project Settings → API**, copy:
   - **Project URL**
   - **anon public** key
4. Open `spa/supabase.js` and fill in:
   ```js
   const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```
5. Reload the app. The yellow banner disappears — you're live. Both phones now sync through the same Supabase project.

### Auth

The schema enables RLS but uses an open policy (`using (true)`) so any client with the anon key can read/write. That's fine for a private 2-person app where you don't share the URL publicly. To lock it down, swap the policies in `schema.sql` for ones based on `auth.uid()` and add Supabase email auth.

## 3 · How it works

- **Two members** live in the `members` table — Saireen 🌸 and Kaisu ⚡.
- The dropdown in the top-right ("Viewing as") switches which person the device represents. The choice is saved in `sessionStorage` (UI-only — not progress data).
- **Editable tasks** live in `tasks` — every member gets their own list per day, fully editable inline.
- **Check-ins** live in `checkins`, one row per `(member_id, day)`, upserted on save. Stores: `workout_done`, `home_food_done`, `ate_out`, `mood`, `notes`, plus `task_state` (jsonb map of taskId → done).
- **Nudges** live in `nudges` and show up on the Together tab.
- The 30-day grid uses two dots per cell (one per member) so you can see at a glance who's done what.

## 4 · Deploying

### Netlify drop
- Drag the `spa/` folder onto [app.netlify.com/drop](https://app.netlify.com/drop). Done.

### Vercel
```bash
cd spa
npx vercel --prod
```

### GitHub Pages
- Commit the `spa/` folder, set Pages source to that folder.

## 5 · Customising

- **Member names / emoji / colors:** edit the seed at the bottom of `schema.sql`, or run `update members set ...` in Supabase.
- **Default tasks:** edit the `defaults` map inside `seedTasks()` in `supabase.js` (used in demo mode), and/or insert real rows into `tasks` for each member × day.
- **Challenge length:** `update challenges set total_days = 60`.
- **Pastel palette:** tweak the CSS custom properties at the top of `styles.css`.

## 6 · Roadmap ideas

- Realtime updates via `supabase.channel(...).on('postgres_changes', ...)`
- Push notifications for nudges (Web Push)
- Photo attachments per check-in (Supabase Storage)
- Season 2 unlock with a co-authored ritual list
