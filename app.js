/* Usie: a tiny private world for two, synced with Supabase.
 * Each partner has their own Supabase Auth account. One creates a couple and shares the
 * invite code, the other joins with it (max 2). Row Level Security (supabase/schema.sql)
 * makes every row and photo readable only by the two members of that couple.
 */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];
const other = r => r === "her" ? "him" : "her";

const CFG = window.USIE_CONFIG || {};
const sb = window.supabase?.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const BUCKET = "usie-photos";

/* ---------- images ---------- */
function compress(file, max = 1280, q = 0.82) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b ? res({ blob: b, url: URL.createObjectURL(b) }) : rej(new Error("Couldn't read that photo.")), "image/jpeg", q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("That file didn't look like a photo.")); };
    img.src = url;
  });
}
const placeholder = who => "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${who === "her" ? "#FFE3E8" : "#DCEBE4"}"/><circle cx="50" cy="42" r="20" fill="${who === "her" ? "#FFD7BF" : "#E9B48F"}"/><path d="M18 100c2-26 16-38 32-38s30 12 32 38z" fill="${who === "her" ? "#E2455C" : "#5B8C7A"}"/></svg>`);

/* ---------- content ---------- */
const QUESTIONS = [
  { k: "time", q: "Morning person or night owl?", o: ["Sunrise club", "Midnight gremlin"] },
  { k: "date", q: "Perfect date", o: ["Food trip", "Movie night in", "Long drive", "Arcade battle", "Picnic"] },
  { k: "trip", q: "Dream getaway", o: ["Beach", "Mountains", "Big city", "Bed, honestly"] },
  { k: "drink", q: "Pick your poison", o: ["Coffee", "Milk tea", "Both, obviously"] },
  { k: "text", q: "Texting style", o: ["Paragraphs", "Voice notes", "Memes only", "k."] },
  { k: "fight", q: "After a fight you need", o: ["Space first", "A hug", "Talk it out now"] },
  { k: "pda", q: "PDA level", o: ["Hand-holding only", "A little cheeky", "Kiss me anywhere"] },
];
const LANG_TIPS = {
  "Words of affirmation": "say it out loud. Compliments, voice notes, a sticky note on the mirror.",
  "Quality time": "phones face down. Full attention is the love letter.",
  "Physical touch": "hold hands longer than necessary. Forehead kisses count double.",
  "Acts of service": "do the thing before being asked. Yes, even the dishes.",
  "Receiving gifts": "it's the thought. The tiny 'saw this and thought of you' stuff wins.",
};
const MATCH_LINES = [
  "Same answer. Are you two sharing a brain cell? Adorable.",
  "Twinning. Someone call the matching hoodie people.",
  "Perfectly in sync. This is how duets happen.",
];
const DIFF_LINES = [
  "Different picks. Take turns and nobody gets bored.",
  "Opposites. Great for spicy debates, better for making up.",
  "You'll balance each other out. Like sweet and salty popcorn.",
];
const GREETS = [
  "Missed you. Even if it's only been an hour.",
  "Welcome back to the only feed that matters.",
  "Two of you, zero strangers. Perfect ratio.",
  "Somebody here thinks you're cute. Scroll and find out who.",
];
const POST_PROMPTS = [
  "Post the last photo you took of them without them knowing.",
  "Finish this: \"I knew I liked you when...\"",
  "Three words that describe today's version of us.",
  "Share a song that sounds like the two of you.",
  "Describe their laugh. Badly.",
  "Something they did this week that made you go soft.",
  "Rate your last date out of 10 and defend it.",
  "Our next date idea, but make it oddly specific.",
];
const CAP_PROMPTS = [
  "Us trying to pick where to eat for 45 minutes",
  "Him pretending he's not tired at 9:30pm",
  "Her 'I'm almost ready' at the door, still in one shoe",
  "Us when the waiter says 'enjoy your meal' and we both say 'you too'",
  "The face you make when they steal your fries",
  "Our two brain cells fighting for custody",
];
const WYR = [
  ["only text in emojis for a week", "only talk in song lyrics for a day"],
  ["a surprise picnic", "a surprise road trip with no destination"],
  ["always know what they're thinking", "always know what they're about to order"],
  ["slow dance in the kitchen", "karaoke duet in public"],
  ["cuddle through a horror movie", "laugh through a terrible rom-com"],
  ["give up dessert forever", "give up good morning texts forever"],
  ["matching outfits on every date", "matching tattoos, once"],
  ["re-live your first date", "fast-forward to your 10th anniversary"],
  ["have them cook for you", "cook together and argue about salt"],
  ["get a love letter", "get a voice note you can replay"],
  ["be the big spoon forever", "be the little spoon forever"],
  ["fight over the thermostat", "fight over the blanket"],
];
const STICKERS = [
  { k: "heart", label: "Heart", svg: `<svg viewBox="0 0 40 40"><use href="#heart" color="#E2455C"/></svg>` },
  { k: "spark", label: "Sparkle", svg: `<svg viewBox="0 0 40 40"><use href="#spark" color="#F2B84B"/></svg>` },
  { k: "lol", label: "Haha", svg: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#FFD25E"/><path d="M11 17q3-4 6 0M23 17q3-4 6 0" stroke="#3B1F2B" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M11 23q9 10 18 0z" fill="#3B1F2B"/></svg>` },
  { k: "hot", label: "Hot", svg: `<svg viewBox="0 0 40 40"><path d="M20 3c2 8 12 12 12 23a12 12 0 0 1-24 0c0-6 3-9 5-11 0 4 2 6 4 6-2-7 1-13 3-18z" fill="#F26B3A"/><path d="M20 22c1 4 6 5 6 10a6 6 0 0 1-12 0c0-3 2-4 3-5 0 2 1 3 2 3-1-3 0-6 1-8z" fill="#FFD25E"/></svg>` },
  { k: "kiss", label: "Kiss", svg: `<svg viewBox="0 0 40 40"><path d="M4 20c6-9 11-9 16-5 5-4 10-4 16 5-6 9-11 11-16 11S10 29 4 20z" fill="#E2455C"/><path d="M4 20c10 3 22 3 32 0" stroke="#B8293F" stroke-width="2" fill="none"/></svg>` },
];

/* ---------- state ---------- */
let USER = null, S = null, channel = null, curView = "landing", photoUrls = {}, schemaOk = true;
const myRole = () => S?.me?.role;
const nameOf = w => S?.[w]?.nick || S?.[w]?.name || (w === "her" ? "Her" : "Him");
const photoOf = w => (S?.[w]?.photo_path && photoUrls[S[w].photo_path]) || placeholder(w);
const urlOf = path => path ? photoUrls[path] || "" : "";

function friendly(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || "");
  if (/PGRST205|schema cache|does not exist/i.test(m)) return "Usie's database isn't set up yet. Run supabase/schema.sql in the Supabase SQL Editor first.";
  if (/Invalid login credentials/i.test(m)) return "That email and password don't match. Try again, cutie.";
  if (/Email not confirmed/i.test(m)) return "Your account needs a quick confirm. Tap \"Create my key\" again with the same email and password.";
  if (/email looks|at least 6/i.test(m)) return m;
  if (/already registered/i.test(m)) return "You already have an account. Tap \"Sign in\" below.";
  if (/rate limit|too many/i.test(m)) return "Too many tries in a row. Take a breath and try again in a minute.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Can't reach the love server. Check your internet.";
  return m.replace(/^.*?:\s(?=[A-Z])/, "") || "Something went wrong.";
}
const must = r => { if (r.error) throw r.error; return r.data; };

/* ---------- ui helpers ---------- */
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2800); }
function show(id) {
  curView = id;
  $$(".view").forEach(v => v.hidden = v.id !== "v-" + id);
  const inApp = ["feed", "play", "grow", "us"].includes(id);
  $("#topbar").hidden = !inApp;
  $$(".tab").forEach(t => t.dataset.tab === id ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current"));
  window.scrollTo(0, 0); $("#app").focus({ preventScroll: true });
  renderCurrent();
}
function renderCurrent() {
  if (curView === "feed") renderFeed(); if (curView === "play") renderPlay(); if (curView === "grow") renderGrow(); if (curView === "us") renderUs();
}
async function busy(btn, fn) {
  btn && (btn.disabled = true, btn.classList.add("loading"));
  try { return await fn(); } catch (e) { console.warn(e); toast(friendly(e)); } finally { btn && (btn.disabled = false, btn.classList.remove("loading")); }
}
const ago = ts => { const t = new Date(ts).getTime(), m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now"; if (m < 60) return m + "m ago"; const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
const mePill = () => `<img class="mini" src="${photoOf(myRole())}" alt="">${esc(nameOf(myRole()))}`;

/* ---------- boot ---------- */
async function boot() {
  if (!sb) { $("#setupNote").hidden = false; $("#setupNote").textContent = "Couldn't load the love server library. Check your connection and refresh."; $("#startBtn").hidden = $("#unlockBtn").hidden = true; show("landing"); return; }
  const { data: { session } } = await sb.auth.getSession();
  USER = session?.user || null;
  // Probe tables only when signed in (anon is locked out by design, so an anon probe would 401).
  if (USER) {
    const probe = await sb.from("couples").select("id", { head: true, count: "exact" }).limit(1);
    schemaOk = !(probe.error && /PGRST205|schema cache|42P01/i.test((probe.error.code || "") + (probe.error.message || "")));
  }
  if (!schemaOk) {
    $("#setupNote").hidden = false;
    $("#setupNote").textContent = "Almost ready! Usie's database tables haven't been created yet. (Owner: paste supabase/schema.sql into Supabase > SQL Editor and press Run.)";
    $("#startBtn").hidden = $("#unlockBtn").hidden = true; show("landing"); return;
  }
  if (USER) return enterApp();
  show("landing");
}
let entering = false;
async function enterApp() {
  if (entering) return; entering = true;
  try {
    const mem = must(await sb.from("couple_members").select("couple_id, role").eq("user_id", USER.id).maybeSingle());
    if (!mem) { S = null; $("#coupleErr").textContent = ""; show("couple"); return; }
    S = { me: { id: USER.id, role: mem.role }, coupleId: mem.couple_id };
    await loadAll(); subscribe();
    if (!S[myRole()]) startOnboard(); else show("feed");
  } catch (e) { toast(friendly(e)); show("landing"); }
  finally { entering = false; }
}
sb?.auth.onAuthStateChange((ev, session) => {
  const was = USER?.id; USER = session?.user || null;
  if (ev === "SIGNED_IN" && USER && USER.id !== was && schemaOk) enterApp();
  if (ev === "SIGNED_OUT") { teardown(); }
});
function teardown() { if (channel) { sb.removeChannel(channel); channel = null; } S = null; photoUrls = {}; }

/* ---------- data ---------- */
async function loadAll() {
  const cid = S.coupleId, q = t => sb.from(t).select("*").eq("couple_id", cid);
  const [couple, members, profiles, posts, reacts, notes, wyr, checks, jar, bucket] = await Promise.all([
    sb.from("couples").select("*").eq("id", cid).single(), sb.from("couple_members").select("*").eq("couple_id", cid),
    q("profiles"), q("posts").order("created_at", { ascending: false }).limit(200), q("reactions"),
    q("notes").order("created_at", { ascending: false }), q("wyr_answers"),
    q("checkins").order("created_at", { ascending: false }).limit(20), q("gratitude").order("created_at"), q("bucket_items").order("created_at"),
  ]).then(rs => rs.map(must));
  S.couple = couple; S.members = members;
  S.her = profiles.find(p => p.role === "her") || null; S.him = profiles.find(p => p.role === "him") || null;
  const rx = {}; reacts.forEach(r => ((rx[r.post_id] ||= {})[r.sticker] ||= []).push(r));
  S.posts = posts.map(p => ({ ...p, reacts: rx[p.id] || {} }));
  S.notes = notes; S.checks = checks; S.jar = jar; S.bucket = bucket;
  S.wyr = { i: couple.wyr_index || 0, a: {} }; wyr.forEach(w => (S.wyr.a[w.question] ||= {})[w.role] = w.choice);
  await signPhotos([S.her?.photo_path, S.him?.photo_path, ...S.posts.map(p => p.photo_path)]);
}
async function signPhotos(paths) {
  const need = [...new Set(paths.filter(p => p && !photoUrls[p]))]; if (!need.length) return;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(need, 60 * 60 * 6);
  if (error) { console.warn(error); return; }
  data.forEach(d => { if (d.signedUrl) photoUrls[d.path] = d.signedUrl; });
}
async function upload(blob) {
  const path = `${S.coupleId}/${crypto.randomUUID()}.jpg`;
  must(await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false }));
  return path;
}
let refreshT = null;
function subscribe() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel("usie-" + S.coupleId);
  ["posts", "reactions", "notes", "profiles", "wyr_answers", "checkins", "gratitude", "bucket_items"].forEach(table =>
    channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `couple_id=eq.${S.coupleId}` }, payload => {
      const who = payload.new?.author || payload.new?.user_id;
      if (payload.eventType === "INSERT" && who && who !== USER.id) toast(`${nameOf(other(myRole()))} just added something`);
      refreshSoon();
    }));
  channel.subscribe();
}
function refreshSoon() {
  clearTimeout(refreshT);
  refreshT = setTimeout(async () => {
    if (!S) return;
    const a = document.activeElement;
    if (a && (a.isContentEditable || /INPUT|TEXTAREA/.test(a.tagName)) && curView === "feed") return refreshSoon(); // don't clobber typing
    try { await loadAll(); renderCurrent(); } catch (e) { console.warn(e); }
  }, 400);
}
async function reload() { await loadAll(); renderCurrent(); }

/* ---------- landing + auth ---------- */
let authMode = "signup";
$("#startBtn").onclick = () => openAuth("signup");
$("#unlockBtn").onclick = () => openAuth("signin");
$("#backToLanding").onclick = () => show("landing");
$("#authToggle").onclick = () => openAuth(authMode === "signup" ? "signin" : "signup");
function openAuth(mode) {
  authMode = mode; const up = mode === "signup";
  $("#lockTitle").textContent = up ? "Get your own key" : "Knock knock. Who's cute?";
  $("#lockSub").textContent = up ? "Each of you makes your own little account, then you link up with a secret code. No confirmation email, you're in right away."
    : "Sign in with your email and password. If you're not one of the two, this is awkward. Please leave.";
  $("#lockSubmit").textContent = up ? "Create my key" : "Let me in";
  $("#authToggle").textContent = up ? "Already have an account? Sign in" : "New here? Create an account";
  $("#pass1").autocomplete = up ? "new-password" : "current-password";
  $("#lockErr").textContent = "";
  show("lock"); setTimeout(() => $("#email").focus(), 50);
}
const redirectTo = () => location.origin + location.pathname;
$("#lockForm").onsubmit = async e => {
  e.preventDefault(); const email = $("#email").value.trim(), password = $("#pass1").value, err = $("#lockErr");
  err.textContent = "";
  await busy($("#lockSubmit"), async () => {
    if (authMode === "signup") {
      // Instant sign-up via the register() RPC (account is created already confirmed, no email needed)
      const reg = await sb.rpc("register", { p_email: email, p_password: password });
      if (reg.error) { err.textContent = friendly(reg.error); return; }
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        if (reg.data === "exists") { openAuth("signin"); $("#email").value = email;
          $("#lockErr").textContent = "You already have an account with this email. Sign in with the password you used before."; return; }
        err.textContent = friendly(error); return;
      }
      toast(reg.data === "exists" ? "Welcome back! You already had a key." : "Key made. Welcome to Usie!");
      USER = data.user; enterApp();
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { err.textContent = friendly(error); $(".lockcard").classList.add("shake"); setTimeout(() => $(".lockcard").classList.remove("shake"), 450); return; }
      USER = data.user; enterApp();
    }
  });
};
$("#magicBtn").onclick = async () => {
  const email = $("#email").value.trim(); if (!email) { $("#lockErr").textContent = "Type your email first, then tap the magic link."; $("#email").focus(); return; }
  await busy($("#magicBtn"), async () => {
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    if (error) { $("#lockErr").textContent = friendly(error); return; }
    $("#lockErr").textContent = ""; $("#lockSub").textContent = `Magic link sent to ${email}. Open it on this phone and poof, you're in.`; toast("Magic link sent!");
  });
};
async function signOut() { await sb.auth.signOut(); teardown(); USER = null; toast("Signed out. See you soon, lovebird."); show("landing"); }
$("#lockNow").onclick = signOut; $("#signOutBtn").onclick = signOut; $("#signOut2").onclick = signOut;

/* ---------- couple link ---------- */
$("#createCouple").onclick = () => busy($("#createCouple"), async () => {
  const role = $("input[name=myrole]:checked").value;
  const c = must(await sb.rpc("create_couple", { p_role: role }));
  S = { me: { id: USER.id, role }, coupleId: c.id }; await loadAll(); subscribe(); showInvite(true);
});
$("#joinForm").onsubmit = e => { e.preventDefault(); busy($("#joinForm button"), async () => {
  $("#coupleErr").textContent = "";
  const r = await sb.rpc("join_couple", { p_code: $("#joinCode").value.trim().toUpperCase() });
  if (r.error) { $("#coupleErr").textContent = r.error.message.includes("third") || r.error.message.includes("code") ? r.error.message : friendly(r.error); return; }
  entering = false; await enterApp(); toast("Linked! It's official official.");
}); };
function showInvite(fresh) {
  $("#invCode").textContent = S.couple.invite_code;
  $("#invEyebrow").textContent = fresh ? "Step 2 of 3 · your secret code" : "Your secret code";
  $("#invNext").textContent = S[myRole()] ? "Back to us" : "Now, my profile";
  show("invite");
}
$("#copyCode").onclick = async () => {
  const text = `Join me on Usie, our tiny private world for two 💌 ${redirectTo()}  Our secret code: ${S.couple.invite_code}`;
  try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast("Copied! Now send it to your person."); } } catch {}
};
$("#invNext").onclick = () => S[myRole()] ? show("us") : startOnboard();
$("#showCode").onclick = () => showInvite(false);

/* ---------- onboarding (each partner fills their own) ---------- */
let pendingPhoto = null;
const COPY = {
  her: { eye: "Ladies first (always)", title: "Let's meet <em>her</em>", sub: "The one who laughs at her own jokes before the punchline. Answer honestly. He'll see this.", name: "Your actual name", nick: "what he calls you" },
  him: { eye: "Your turn, handsome", title: "Now, <em>him</em>", sub: "The one who says he's not hungry and then eats half her fries. Be real. She's reading.", name: "Your actual name", nick: "what she calls you" },
};
function startOnboard() {
  const w = myRole(), c = COPY[w], p = S[w] || {}, f = $("#profileForm");
  f.reset(); pendingPhoto = null;
  f.classList.toggle("him-mode", w === "him");
  $("#pfEyebrow").textContent = c.eye; $("#pfTitle").innerHTML = c.title; $("#pfSub").textContent = c.sub;
  $("#pfNext").textContent = S[other(w)] ? "Show us our synergy" : "Save my profile";
  f.name.placeholder = c.name; f.nick.placeholder = c.nick; $("#pfBack").hidden = true;
  const ans = p.answers || {};
  $("#pfQuestions").innerHTML = QUESTIONS.map(q => `<fieldset class="q"><legend>${esc(q.q)}</legend><div class="chips">${
    q.o.map((o, i) => `<label class="chip"><input type="radio" name="q_${q.k}" value="${i}" ${ans[q.k] === i ? "checked" : ""} required><span>${esc(o)}</span></label>`).join("")}</div></fieldset>`).join("");
  ["name", "nick", "bday", "lang", "noticed", "food"].forEach(k => { if (p[k]) f[k].value = p[k]; });
  setPreview(p.photo_path ? photoOf(w) : null);
  show("onboard");
}
function setPreview(src) { $("#pfPreview").hidden = !src; if (src) $("#pfPreview").src = src; $("#pfEmpty").hidden = !!src; }
$("#pfPhoto").onchange = async e => { const f = e.target.files[0]; if (!f) return;
  try { pendingPhoto = await compress(f, 480, 0.85); setPreview(pendingPhoto.url); toast("Cute. Very cute."); } catch (er) { toast(er.message); } };
$("#profileForm").onsubmit = e => { e.preventDefault(); busy($("#pfNext"), async () => {
  const f = e.target, w = myRole(), answers = {};
  QUESTIONS.forEach(x => { const v = f["q_" + x.k].value; answers[x.k] = v === "" ? null : +v; });
  let photo_path = S[w]?.photo_path || null;
  if (pendingPhoto) { photo_path = await upload(pendingPhoto.blob); photoUrls[photo_path] = pendingPhoto.url; }
  must(await sb.from("profiles").upsert({ couple_id: S.coupleId, role: w, user_id: USER.id, name: f.name.value.trim(), nick: f.nick.value.trim(),
    bday: f.bday.value || null, lang: f.lang.value, noticed: f.noticed.value.trim(), food: f.food.value.trim(), photo_path, answers, updated_at: new Date().toISOString() }));
  await loadAll();
  if (S[other(w)]) showSynergy();
  else { toast("Saved! Now we wait for your person."); show("feed"); }
}); };

/* ---------- synergy ---------- */
function showSynergy() {
  const h = S.her, m = S.him; if (!h || !m) return toast(`Waiting for ${h ? "him" : "her"} to fill in their profile first.`);
  let matches = 0; const ha = h.answers || {}, ma = m.answers || {};
  const rows = QUESTIONS.map((q, i) => { const same = ha[q.k] === ma[q.k]; if (same) matches++;
    return `<li class="${same ? "match" : ""}"><span class="tag">${same ? "match" : "balance"}</span><div><b>${esc(q.q.replace(/\?$/, ""))}:</b> ${esc(nameOf("her"))} said ${esc(q.o[ha[q.k]] ?? "-")}, ${esc(nameOf("him"))} said ${esc(q.o[ma[q.k]] ?? "-")}. <span class="muted">${same ? MATCH_LINES[i % 3] : DIFF_LINES[i % 3]}</span></div></li>`; });
  const sameLang = h.lang === m.lang;
  rows.push(`<li class="${sameLang ? "match" : ""}"><span class="tag">love</span><div><b>Love languages:</b> to love ${esc(nameOf("her"))} well, ${esc(LANG_TIPS[h.lang] || "")} To love ${esc(nameOf("him"))} well, ${esc(LANG_TIPS[m.lang] || "")}</div></li>`);
  const score = Math.min(99, Math.round(62 + (matches / QUESTIONS.length) * 33 + (sameLang ? 4 : 0)));
  $("#synHer").src = photoOf("her"); $("#synHim").src = photoOf("him");
  $("#synHerName").textContent = nameOf("her"); $("#synHimName").textContent = nameOf("him");
  $("#synHeadline").innerHTML = score >= 88 ? "Okay, <em>soulmates</em>. Calm down." : score >= 76 ? "A seriously <em>cute</em> combo." : "Opposites, <em>very</em> attracted.";
  $("#synBlurb").textContent = `${matches} of ${QUESTIONS.length} answers matched. The rest is where the fun is: you get to keep surprising each other.`;
  $("#synList").innerHTML = rows.join("");
  $("#synMeter").setAttribute("aria-label", `Synergy ${score} percent`);
  show("synergy");
  const arc = $("#synArc"), out = $("#synScore"); arc.style.strokeDashoffset = 314;
  requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = 314 * (1 - score / 100); }));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; let n = reduce ? score : 0;
  out.textContent = n + "%"; if (!reduce) { const t = setInterval(() => { n = Math.min(score, n + 2); out.textContent = n + "%"; if (n >= score) clearInterval(t); }, 25); }
}
$("#synGo").onclick = () => show("feed");
$("#synRedo").textContent = "Edit my profile";
$("#synRedo").onclick = startOnboard;

/* ---------- feed ---------- */
let postPhoto = null;
$$(".tab").forEach(t => t.onclick = () => show(t.dataset.tab));
function waitingBanner() {
  const o = other(myRole());
  if (S.members.length < 2) return `<div class="waiting">Your person hasn't joined yet. Send them your code <b>${esc(S.couple.invite_code)}</b> <button class="linkish" data-act="code">share it</button></div>`;
  if (!S[o]) return `<div class="waiting">${o === "her" ? "She" : "He"} joined but hasn't filled in a profile yet. Gently nag. Lovingly.</div>`;
  return "";
}
function renderFeed() {
  const days = Math.max(1, Math.ceil((Date.now() - new Date(S.couple.created_at)) / 864e5));
  const names = S[other(myRole())] ? `${esc(nameOf("her"))} &amp; ${esc(nameOf("him"))}` : esc(nameOf(myRole()));
  $("#greet").innerHTML = `${waitingBanner()}Hey <span class="hand">${names}</span>. ${esc(pick(GREETS))} <span class="tiny">Day ${days} of Usie.</span>`;
  $("#whoMe").innerHTML = mePill();
  $("#promptChip").textContent = "Need a nudge? " + pick(POST_PROMPTS);
  $("#feed").innerHTML = S.posts.map(postHTML).join("");
}
$("#greet").addEventListener("click", e => { if (e.target.closest("[data-act=code]")) showInvite(false); });
function postHTML(p) {
  const r = p.reacts || {}, mine = p.author === USER.id;
  let body;
  if (p.kind === "cap") {
    const missing = !p.cap_her ? "her" : !p.cap_him ? "him" : null;
    const cell = w => { const v = w === "her" ? p.cap_her : p.cap_him;
      return v ? `<div><small>${esc(nameOf(w))}</small>${esc(v)}</div>` : `<div class="pending"><small>${esc(nameOf(w))}</small>${w === myRole() ? "your turn!" : "thinking..."}</div>`; };
    body = `${p.photo_path ? `<img class="post-photo" src="${urlOf(p.photo_path)}" alt="Caption-this photo">` : `<p class="caption" style="cursor:default">${esc(p.prompt)}</p>`}
      <div class="capduo">${cell("her")}${cell("him")}</div>
      ${missing === myRole() ? `<form class="cap-reply" data-cap="${p.id}"><label class="sr" for="cr_${p.id}">Your caption</label><input id="cr_${p.id}" maxlength="120" required placeholder="your comeback"><button class="btn primary small">Add mine</button></form>` : ""}`;
  } else {
    body = `${p.photo_path ? `<img class="post-photo" src="${urlOf(p.photo_path)}" alt="Photo posted by ${esc(nameOf(p.by_role))}" loading="lazy">` : ""}
      <p class="caption" contenteditable="true" spellcheck="true" data-id="${p.id}" aria-label="Caption, tap to edit">${esc(p.caption)}</p>
      ${p.edited ? `<p class="edited">edited ${ago(p.edited_at)}</p>` : ""}`;
  }
  return `<li class="post" data-id="${p.id}">
    <div class="post-head"><img src="${photoOf(p.by_role)}" alt=""><div><b>${esc(nameOf(p.by_role))}${p.kind === "cap" ? " started a caption-off" : ""}</b><time>${ago(p.created_at)}</time></div>
    ${mine ? `<button class="del" data-del="${p.id}" aria-label="Delete post">delete</button>` : ""}</div>
    ${body}
    <div class="reacts">${STICKERS.map(s => { const list = r[s.k] || [], on = list.some(x => x.user_id === USER.id);
      return `<button class="react ${on ? "on" : ""}" data-r="${s.k}" data-id="${p.id}" aria-label="${s.label} sticker, ${list.length}" aria-pressed="${on}">${s.svg}${list.length ? `<span>${list.length}</span>` : ""}</button>`; }).join("")}</div>
  </li>`;
}
$("#postPhoto").onchange = async e => { const f = e.target.files[0]; if (!f) return;
  try { postPhoto = await compress(f); $("#postPreview").src = postPhoto.url; $("#postPreview").hidden = false; $("#attachName").textContent = "photo ready"; } catch (er) { toast(er.message); } };
$("#composer").onsubmit = e => { e.preventDefault(); busy($("#composer .btn.primary"), async () => {
  const text = $("#postText").value.trim();
  if (!text && !postPhoto) return toast("Say something sweet first. Or at least a photo.");
  let photo_path = null;
  if (postPhoto) { photo_path = await upload(postPhoto.blob); photoUrls[photo_path] = postPhoto.url; }
  must(await sb.from("posts").insert({ couple_id: S.coupleId, by_role: myRole(), caption: text, photo_path }));
  postPhoto = null; e.target.reset(); $("#postPreview").hidden = true; $("#attachName").textContent = "";
  await reload(); toast(pick(["Posted. They're gonna love it.", "Delivered with a kiss.", "Into the feed it goes."]));
}); };
$("#promptChip").onclick = () => { $("#postText").value = $("#promptChip").textContent.replace("Need a nudge? ", "") + "\n"; $("#postText").focus(); };
$("#feed").addEventListener("click", e => {
  const r = e.target.closest(".react");
  if (r) return busy(null, async () => {
    const p = S.posts.find(x => x.id === r.dataset.id), k = r.dataset.r, on = (p.reacts[k] || []).some(x => x.user_id === USER.id);
    if (on) must(await sb.from("reactions").delete().match({ post_id: p.id, user_id: USER.id, sticker: k }));
    else must(await sb.from("reactions").insert({ post_id: p.id, couple_id: S.coupleId, role: myRole(), sticker: k }));
    await reload(); const nr = $(`.post[data-id="${p.id}"] .react[data-r="${k}"]`); nr?.classList.add("bump"); nr?.focus();
  });
  const d = e.target.closest("[data-del]");
  if (d && confirm("Delete this post? No take-backs.")) busy(d, async () => {
    const p = S.posts.find(x => x.id === d.dataset.del);
    must(await sb.from("posts").delete().eq("id", p.id));
    if (p.photo_path && !S.posts.some(x => x.id !== p.id && x.photo_path === p.photo_path)) await sb.storage.from(BUCKET).remove([p.photo_path]);
    await reload();
  });
});
$("#feed").addEventListener("submit", e => { const f = e.target.closest("[data-cap]"); if (!f) return; e.preventDefault();
  busy(f.querySelector("button"), async () => {
    const col = myRole() === "her" ? "cap_her" : "cap_him";
    must(await sb.from("posts").update({ [col]: f.querySelector("input").value.trim() }).eq("id", f.dataset.cap));
    await reload(); toast("Caption-off complete. Vote with stickers!");
  }); });
$("#feed").addEventListener("keydown", e => { if (e.target.classList.contains("caption") && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.blur(); } });
$("#feed").addEventListener("focusout", e => {
  const c = e.target; if (!c.classList?.contains("caption") || !c.dataset.id) return;
  const p = S.posts.find(x => x.id === c.dataset.id); const v = c.innerText.trim();
  if (p && v !== (p.caption || "")) busy(null, async () => {
    must(await sb.from("posts").update({ caption: v, edited: true, edited_at: new Date().toISOString() }).eq("id", p.id));
    p.caption = v; p.edited = true; p.edited_at = new Date().toISOString(); toast("Caption updated. Much punnier."); setTimeout(reload, 50);
  });
});

/* ---------- play ---------- */
let capItem = null;
function renderPlay() {
  $$("[data-cap=me]").forEach(x => x.textContent = `Your caption, ${nameOf(myRole())}`);
  if (!capItem) shuffleCap();
  renderWyr(); renderNotes();
}
function shuffleCap() {
  const photos = S.posts.filter(p => p.photo_path && p.kind !== "cap");
  capItem = photos.length && Math.random() < 0.6 ? { photo_path: pick(photos).photo_path } : { prompt: pick(CAP_PROMPTS) };
  $("#capStage").innerHTML = capItem.photo_path ? `<img src="${urlOf(capItem.photo_path)}" alt="A photo from your feed">` : `<p>"${esc(capItem.prompt)}"</p>`;
  $("#capMine").value = "";
}
$("#capShuffle").onclick = shuffleCap;
$("#capSave").onclick = () => busy($("#capSave"), async () => {
  const v = $("#capMine").value.trim(); if (!v) return toast("Write your caption first. No hiding.");
  must(await sb.from("posts").insert({ couple_id: S.coupleId, by_role: myRole(), kind: "cap", photo_path: capItem.photo_path || null, prompt: capItem.prompt || "",
    [myRole() === "her" ? "cap_her" : "cap_him"]: v }));
  capItem = null; await loadAll(); shuffleCap(); toast(`Posted! Now ${nameOf(other(myRole()))} adds theirs.`);
});
function renderWyr() {
  const i = S.wyr.i % WYR.length, a = S.wyr.a[i] || {}, me = myRole(), o = other(me), iPicked = a[me] != null;
  $("#wyrQ").textContent = `Question ${i + 1} of ${WYR.length}. Pick yours. Theirs shows after you choose.`;
  $("#wyrOpts").innerHTML = WYR[i].map((opt, n) => `<div class="wyr-opt">${esc(opt)}<div class="pick">
    <button class="${me} ${a[me] === n ? "on" : ""}" data-n="${n}" aria-pressed="${a[me] === n}">${a[me] === n ? "My pick" : "Pick this"}</button>
    ${iPicked && a[o] === n ? `<button class="${o} on" disabled>${esc(nameOf(o))}</button>` : ""}</div></div>`).join("");
  $("#wyrRes").textContent = !iPicked ? "" : a[o] == null ? `Waiting for ${nameOf(o)} to pick...` : a[me] === a[o] ? "Same pick! Great minds, cute faces." : "Split decision. Loser of the next rock-paper-scissors explains themselves.";
}
$("#wyrOpts").onclick = e => { const b = e.target.closest("button[data-n]"); if (!b) return; busy(null, async () => {
  const i = S.wyr.i % WYR.length;
  must(await sb.from("wyr_answers").upsert({ couple_id: S.coupleId, question: i, role: myRole(), choice: +b.dataset.n, updated_at: new Date().toISOString() }));
  (S.wyr.a[i] ||= {})[myRole()] = +b.dataset.n; renderWyr();
}); };
$("#wyrNext").onclick = () => busy($("#wyrNext"), async () => {
  must(await sb.from("couples").update({ wyr_index: S.wyr.i + 1 }).eq("id", S.coupleId)); S.wyr.i++; S.couple.wyr_index = S.wyr.i; renderWyr();
});
function renderNotes() {
  const me = myRole();
  $("#envelopes").innerHTML = S.notes.map(n => {
    const when = esc(n.open_when.replace(/^open when\s*/i, ""));
    if (n.opened_at) return `<li><div class="env open"><span class="lbl">Open when ${when}<small>from ${esc(nameOf(n.from_role))} · opened ${ago(n.opened_at)}</small></span><span class="body">${esc(n.body)}</span></div></li>`;
    if (n.from_role === me) return `<li><div class="env mine"><span class="flap"></span><svg class="seal"><use href="#heart"/></svg><span class="lbl">Open when ${when}<small>from you · still sealed</small></span></div></li>`;
    return `<li><button class="env" data-note="${n.id}" aria-label="Sealed note: open when ${when}"><span class="flap"></span><svg class="seal"><use href="#heart"/></svg><span class="lbl">Open when ${when}<small>from ${esc(nameOf(n.from_role))} · for you</small></span></button></li>`;
  }).join("") || `<li class="tiny">No envelopes yet. Write the first one, romantic.</li>`;
}
$("#noteForm").onsubmit = e => { e.preventDefault(); busy($("#noteForm .btn"), async () => {
  must(await sb.from("notes").insert({ couple_id: S.coupleId, from_role: myRole(), open_when: $("#noteWhen").value.trim(), body: $("#noteBody").value.trim() }));
  e.target.reset(); await reload(); toast("Sealed. Mwah.");
}); };
$("#envelopes").onclick = e => { const b = e.target.closest("[data-note]"); if (!b) return; const n = S.notes.find(x => x.id === b.dataset.note);
  if (confirm(`Is it really time? Open when ${n.open_when.replace(/^open when\s*/i, "")}`)) busy(null, async () => {
    must(await sb.from("notes").update({ opened_at: new Date().toISOString() }).eq("id", n.id)); await reload(); }); };

/* ---------- grow ---------- */
function renderGrow() {
  $("#checkWho").innerHTML = `Checking in as ${mePill()}`;
  $("#checks").innerHTML = S.checks.slice(0, 8).map(c =>
    `<li><b>${esc(nameOf(c.role))}</b> · ${new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · felt loved <b>${c.loved}/10</b>, quality time <b>${c.quality}/10</b>
     ${c.liked ? `<br>Loved: ${esc(c.liked)}` : ""}${c.more ? `<br>More of: ${esc(c.more)}` : ""}</li>`).join("");
  renderJar(false); renderBucket();
}
["1", "2"].forEach(n => $("#c" + n).oninput = e => $("#o" + n).textContent = e.target.value);
$("#checkForm").onsubmit = e => { e.preventDefault(); busy($("#checkForm .btn"), async () => {
  must(await sb.from("checkins").insert({ couple_id: S.coupleId, role: myRole(), loved: +$("#c1").value, quality: +$("#c2").value, liked: $("#c3").value.trim(), more: $("#c4").value.trim() }));
  $("#c3").value = ""; $("#c4").value = ""; await reload(); toast("Check-in saved. Proud of you two.");
}); };
function renderJar(animLast) {
  const g = $("#jarHearts"), cols = ["#E2455C", "#F7A1AE", "#F2B84B", "#5B8C7A", "#B8293F"], list = S.jar.slice(-24);
  g.innerHTML = list.map((j, i) => { const x = 40 + (i * 37) % 70, y = 150 - Math.floor(i / 3) * 14;
    return `<use href="#heart" x="${x}" y="${y}" width="20" height="20" color="${cols[i % 5]}" ${animLast && i === list.length - 1 ? "" : 'style="animation:none"'}/>`; }).join("");
  $("#jarCount").textContent = S.jar.length;
}
$("#jarForm").onsubmit = e => { e.preventDefault(); busy($("#jarForm .btn"), async () => {
  must(await sb.from("gratitude").insert({ couple_id: S.coupleId, text: $("#jarText").value.trim() })); e.target.reset(); await loadAll(); renderJar(true); toast("Plop. Into the jar.");
}); };
$("#jarPull").onclick = () => { $("#jarPulled").textContent = S.jar.length ? "\u201C" + pick(S.jar).text + "\u201D" : "The jar is empty. Fill it with tiny thank-yous first."; };
function renderBucket() {
  $("#bucket").innerHTML = S.bucket.map(b => `<li class="${b.done ? "done" : ""}"><input type="checkbox" id="b_${b.id}" data-b="${b.id}" ${b.done ? "checked" : ""}><label for="b_${b.id}" style="font-weight:700;flex-direction:row"><span>${esc(b.text)}</span></label><button class="x" data-bx="${b.id}" aria-label="Remove">×</button></li>`).join("");
  const d = S.bucket.filter(b => b.done).length;
  $("#bucketMeta").textContent = S.bucket.length ? `${d} of ${S.bucket.length} done. ${d === S.bucket.length ? "Time to dream bigger." : "Keep going, adventurers."}` : "Start with something small. Then something wild.";
}
$("#bucketForm").onsubmit = e => { e.preventDefault(); busy($("#bucketForm .btn"), async () => {
  must(await sb.from("bucket_items").insert({ couple_id: S.coupleId, text: $("#bucketText").value.trim() })); e.target.reset(); await reload();
}); };
$("#bucket").onclick = e => { const x = e.target.closest("[data-bx]"); if (x) busy(null, async () => { must(await sb.from("bucket_items").delete().eq("id", x.dataset.bx)); await reload(); }); };
$("#bucket").onchange = e => { const b = S.bucket.find(x => x.id === e.target.dataset.b); if (b) busy(null, async () => {
  must(await sb.from("bucket_items").update({ done: e.target.checked }).eq("id", b.id)); await reload(); if (e.target.checked) toast("Look at you two, checking things off."); }); };

/* ---------- us ---------- */
function renderUs() {
  $("#usCards").innerHTML = ["her", "him"].map(w => { const p = S[w];
    if (!p) return `<article class="card us-card"><img src="${placeholder(w)}" alt=""><h3>${w === "her" ? "Her" : "Him"}</h3><p class="muted">${S.members.length < 2 ? "Hasn't joined yet. Share your code!" : "Joined, profile coming soon."}</p></article>`;
    const a = p.answers || {};
    return `<article class="card us-card"><img src="${photoOf(w)}" alt="${esc(nameOf(w))}">
    <h3>${esc(p.name)}${p.nick ? ` <em>"${esc(p.nick)}"</em>` : ""}</h3>
    <dl><dt>Love language</dt><dd>${esc(p.lang)}</dd>${p.bday ? `<dt>Birthday</dt><dd>${esc(new Date(p.bday + "T00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" }))}</dd>` : ""}
    ${QUESTIONS.map(q => `<dt>${esc(q.q)}</dt><dd>${esc(q.o[a[q.k]] ?? "-")}</dd>`).join("")}
    ${p.food ? `<dt>Comfort food</dt><dd>${esc(p.food)}</dd>` : ""}${p.noticed ? `<dt>First noticed</dt><dd>${esc(p.noticed)}</dd>` : ""}</dl></article>`; }).join("");
  $("#hkInfo").textContent = `Signed in as ${USER.email}. Invite code: ${S.couple.invite_code}. Everything syncs between your two phones and only your two accounts can see it.`;
}
$("#editProfiles").onclick = startOnboard;
$("#seeSynergy").onclick = showSynergy;
$("#leaveBtn").onclick = () => { if (!confirm("Leave this Usie? If you're the last one out, everything is deleted for good.")) return;
  busy($("#leaveBtn"), async () => { must(await sb.rpc("leave_couple")); teardown(); toast("You left. Hope it was just to rejoin."); entering = false; enterApp(); }); };

boot();
})();
