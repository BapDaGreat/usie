# Usie 💌

**A tiny private world for just the two of you.**

Usie is a cute, couples-only web app: two profiles (her + him), a "synergy" reading, a private shared feed with editable captions and sticker reactions, silly games (caption-this, would-you-rather, open-when notes) and growth tools (weekly check-in, gratitude jar, shared bucket list).

Live: https://bapdagreat.github.io/usie/

## How privacy works (first build)

- No server, no accounts, no analytics. It's plain HTML/CSS/JS on GitHub Pages.
- Everything is stored in **this browser's IndexedDB**, encrypted with **AES-GCM**. The key is derived from your couple passcode with PBKDF2 (150k iterations). Lock = key forgotten from memory.
- Photos are resized and compressed in the browser before saving.
- You can download an encrypted backup and restore it on another device (same passcode).

### Honest limitation
Because GitHub Pages is static, **two phones don't sync**. Usie works on one shared device (or by moving backups). Real two-device private sync needs a backend as a next step, e.g. **Supabase** (auth + Postgres row-level security + storage) or **Firebase** (Auth + Firestore security rules), ideally with end-to-end encryption using the same passcode-derived key.

## Files
- `index.html` – all screens (landing, passcode, onboarding, synergy, feed, play, grow, us)
- `styles.css` – design, animations, `prefers-reduced-motion` support
- `app.js` – storage, crypto, and all features
