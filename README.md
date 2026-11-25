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

## Sign-up
Sign-up is instant: the client calls the `register(email, password)` RPC, which creates an already-confirmed email/password user (no confirmation email, so Supabase's built-in mailer rate limit can't block anyone), then signs in with `signInWithPassword`. If the email already exists it only answers `exists` and never changes the password. Trade-off: email addresses aren't verified.

## Supabase dashboard settings (optional)
- Authentication → URL Configuration: Site URL `https://bapdagreat.github.io/usie/` (only matters for password-reset emails).
- Add custom SMTP (Authentication → Emails → SMTP) if you later want password resets or magic links.
