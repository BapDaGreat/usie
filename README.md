# Usie 💌

**A tiny private world for just the two of you.**

Live: https://bapdagreat.github.io/usie/

Couples-only web app: each partner signs in on their own phone, one creates a couple and shares a 6-letter invite code, the other joins (max 2). Then: her + him profiles and a synergy reading, a shared feed (photos, inline-editable captions with an "edited" flag, sticker reactions, live updates), caption-offs, would-you-rather, open-when notes, weekly check-ins, a gratitude jar and a shared bucket list.

## Stack
- Static site on GitHub Pages (`index.html`, `styles.css`, `app.js`, `config.js`)
- [Supabase](https://supabase.com): Auth (email + password or magic link), Postgres with Row Level Security, private Storage bucket `usie-photos`, Realtime
- `config.js` holds the project URL and the **publishable** key, which is safe in the browser. No secret keys live in this repo.

## Database
`supabase/schema.sql` is idempotent. Paste it into Supabase → SQL Editor → Run (safe to re-run).
- `couples` (invite code), `couple_members` (one couple per user, unique role per couple → max 2)
- `profiles`, `posts`, `reactions`, `notes`, `wyr_answers`, `checkins`, `gratitude`, `bucket_items`
- RPCs: `create_couple(role)`, `join_couple(code)`, `leave_couple()` (security definer)
- RLS: only the two members of a couple can read/write its rows; photos live at `<couple_id>/<file>.jpg` and storage policies check membership too. Anonymous users get nothing.

## Supabase dashboard settings
- Authentication → URL Configuration: Site URL `https://bapdagreat.github.io/usie/`, and add the same URL to Redirect URLs.
- Authentication → Sign In / Providers → Email: "Confirm email" is on by default (partners must tap the email link). Turn it off for instant sign-up.
- Supabase's built-in email sender is rate limited; add custom SMTP (Authentication → Emails → SMTP) before real use.
