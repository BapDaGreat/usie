/* Usie: a tiny private world for two.
 * Everything is stored in this browser (IndexedDB), encrypted with AES-GCM using a key
 * derived from the couple passcode (PBKDF2). GitHub Pages is static hosting, so there is
 * no server: two phones do NOT sync. Real two-device private sync needs a backend
 * (e.g. Supabase or Firebase with auth + row-level security). See README.md.
 */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];

/* ---------- tiny IndexedDB key-value ---------- */
const idb = (() => {
  let dbp;
  const open = () => dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open("usie", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => {
    const t = db.transaction("kv", mode); const req = fn(t.objectStore("kv"));
    t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); }); };
  return { get: k => tx("readonly", s => s.get(k)), set: (k, v) => tx("readwrite", s => s.put(v, k)), del: k => tx("readwrite", s => s.delete(k)) };
})();

/* ---------- crypto ---------- */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function sealState(key, salt, obj) {
  // chunked base64 to avoid call-stack limits on big photos
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, salt: b64(salt), iv: b64(iv), ct: new Uint8Array(ct) };
}
async function openState(key, vault) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(vault.iv) }, key, vault.ct);
  return JSON.parse(dec.decode(pt));
}

/* ---------- images ---------- */
function compress(file, max = 1280, q = 0.82) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", q));
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
let KEY = null, SALT = null, S = null, saveT = null;
const fresh = () => ({ v: 1, created: Date.now(), her: null, him: null, posts: [], notes: [], checks: [], jar: [], bucket: [],
  wyr: { i: 0, a: {} }, ui: { who: "her" } });
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try { await idb.set("vault", await sealState(KEY, SALT, S)); }
    catch (e) { toast("Couldn't save. Your browser storage might be full."); console.error(e); }
  }, 250);
}
const nameOf = w => S?.[w]?.nick || S?.[w]?.name || (w === "her" ? "Her" : "Him");
const photoOf = w => S?.[w]?.photo || placeholder(w);

/* ---------- ui helpers ---------- */
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600); }
function show(id) {
  $$(".view").forEach(v => v.hidden = v.id !== "v-" + id);
  const inApp = ["feed", "play", "grow", "us"].includes(id);
  $("#topbar").hidden = !inApp;
  $$(".tab").forEach(t => t.toggleAttribute("aria-current", false) || (t.dataset.tab === id && t.setAttribute("aria-current", "page")));
  window.scrollTo(0, 0); $("#app").focus({ preventScroll: true });
  if (id === "feed") renderFeed(); if (id === "play") renderPlay(); if (id === "grow") renderGrow(); if (id === "us") renderUs();
}
function seg(el, value, onPick) {
  el.innerHTML = ["her", "him"].map(w => `<button type="button" role="radio" aria-checked="${w === value}" data-w="${w}"><img src="${photoOf(w)}" alt="">${esc(nameOf(w))}</button>`).join("");
  el.onclick = e => { const b = e.target.closest("button"); if (!b) return; $$("button", el).forEach(x => x.setAttribute("aria-checked", x === b)); onPick(b.dataset.w); };
}
const ago = ts => { const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now"; if (m < 60) return m + "m ago"; const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }); };

/* ---------- landing + lock ---------- */
let lockMode = "create";
async function boot() {
  const has = await idb.get("vault").catch(() => null);
  $("#startBtn").hidden = !!has; $("#unlockBtn").hidden = !has;
  show("landing");
}
$("#startBtn").onclick = () => openLock("create");
$("#unlockBtn").onclick = () => openLock("unlock");
$("#backToLanding").onclick = boot;
function openLock(mode) {
  lockMode = mode;
  const c = mode === "create";
  $("#lockTitle").textContent = c ? "Make your secret handshake" : "Knock knock. Who's cute?";
  $("#lockSub").textContent = c ? "Pick a couple passcode only you two know. Your anniversary, your first pet together, the word he always mispronounces. It locks and encrypts everything in here."
    : "Enter your couple passcode. If you're not one of the two, this is awkward. Please leave.";
  $("#pass2").hidden = !c; $("#pass2").required = c;
  $("#lockSubmit").textContent = c ? "Lock it in" : "Let us in";
  $("#lockErr").textContent = ""; $("#lockForm").reset();
  show("lock"); setTimeout(() => $("#pass1").focus(), 50);
}
$("#lockForm").onsubmit = async e => {
  e.preventDefault();
  const p1 = $("#pass1").value, err = $("#lockErr");
  if (p1.length < 4) return (err.textContent = "At least 4 characters, lovebirds.");
  $("#lockSubmit").disabled = true;
  try {
    if (lockMode === "create") {
      if (p1 !== $("#pass2").value) { err.textContent = "Those don't match. Communication is key, huh?"; return; }
      SALT = crypto.getRandomValues(new Uint8Array(16)); KEY = await deriveKey(p1, SALT); S = fresh();
      await idb.set("vault", await sealState(KEY, SALT, S));
      startOnboard(0);
    } else {
      const vault = await idb.get("vault"); SALT = unb64(vault.salt); KEY = await deriveKey(p1, SALT);
      try { S = await openState(KEY, vault); } catch { KEY = null; err.textContent = "Nope. Try the passcode, not your ex's birthday."; $(".lockcard").classList.add("shake"); setTimeout(() => $(".lockcard").classList.remove("shake"), 450); return; }
      if (!S.her) startOnboard(0); else if (!S.him) startOnboard(1); else show("feed");
    }
  } finally { $("#lockSubmit").disabled = false; }
};
$("#lockNow").onclick = () => { KEY = null; S = null; toast("Locked. See you two soon."); boot(); };

/* ---------- onboarding ---------- */
let step = 0, pendingPhoto = null;
const COPY = {
  her: { eye: "Ladies first", title: "Let's meet <em>her</em>", sub: "The one who laughs at her own jokes before the punchline. Answer honestly. He'll see this.", next: "Next up: him", name: "Her actual name", nick: "what he calls you" },
  him: { eye: "Your turn, handsome", title: "Now, <em>him</em>", sub: "The one who says he's not hungry and then eats half her fries. Be real. She's reading.", next: "Show us our synergy", name: "His actual name", nick: "what she calls you" },
};
function startOnboard(s) {
  step = s; const w = s === 0 ? "her" : "him", c = COPY[w], p = S[w] || {}, f = $("#profileForm");
  f.reset(); pendingPhoto = p.photo || null;
  f.classList.toggle("him-mode", w === "him");
  $("#pfEyebrow").textContent = c.eye; $("#pfTitle").innerHTML = c.title; $("#pfSub").textContent = c.sub; $("#pfNext").textContent = c.next;
  f.name.placeholder = c.name; f.nick.placeholder = c.nick;
  $("#pfBack").hidden = s === 0;
  $("#pfQuestions").innerHTML = QUESTIONS.map(q => `<fieldset class="q"><legend>${esc(q.q)}</legend><div class="chips">${
    q.o.map((o, i) => `<label class="chip"><input type="radio" name="q_${q.k}" value="${i}" ${p.q?.[q.k] === i ? "checked" : ""} required><span>${esc(o)}</span></label>`).join("")}</div></fieldset>`).join("");
  ["name", "nick", "bday", "lang", "noticed", "food"].forEach(k => { if (p[k]) f[k].value = p[k]; });
  setPreview(pendingPhoto);
  $$(".dot").forEach(d => d.classList.toggle("on", +d.dataset.s === s));
  show("onboard");
}
function setPreview(src) { $("#pfPreview").hidden = !src; if (src) $("#pfPreview").src = src; $("#pfEmpty").hidden = !!src; }
$("#pfPhoto").onchange = async e => { const f = e.target.files[0]; if (!f) return;
  try { pendingPhoto = await compress(f, 480, 0.85); setPreview(pendingPhoto); toast("Cute. Very cute."); } catch (er) { toast(er.message); } };
$("#pfBack").onclick = () => startOnboard(0);
$("#profileForm").onsubmit = e => {
  e.preventDefault(); const f = e.target, w = step === 0 ? "her" : "him";
  const q = {}; QUESTIONS.forEach(x => { const v = f["q_" + x.k].value; q[x.k] = v === "" ? null : +v; });
  S[w] = { name: f.name.value.trim(), nick: f.nick.value.trim(), bday: f.bday.value, lang: f.lang.value, noticed: f.noticed.value.trim(), food: f.food.value.trim(), photo: pendingPhoto, q };
  save();
  if (step === 0) startOnboard(1); else showSynergy();
};

/* ---------- synergy ---------- */
function showSynergy() {
  const h = S.her, m = S.him; let matches = 0;
  const rows = QUESTIONS.map((q, i) => { const same = h.q[q.k] === m.q[q.k]; if (same) matches++;
    return `<li class="${same ? "match" : ""}"><span class="tag">${same ? "match" : "balance"}</span><div><b>${esc(q.q.replace(/\?$/, ""))}:</b> ${esc(nameOf("her"))} said ${esc(q.o[h.q[q.k]])}, ${esc(nameOf("him"))} said ${esc(q.o[m.q[q.k]])}. <span class="muted">${same ? MATCH_LINES[i % 3] : DIFF_LINES[i % 3]}</span></div></li>`; });
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
$("#synRedo").onclick = () => startOnboard(0);

/* ---------- feed ---------- */
let postPhoto = null;
$$(".tab").forEach(t => t.onclick = () => show(t.dataset.tab));
function renderFeed() {
  const days = Math.max(1, Math.ceil((Date.now() - S.created) / 864e5));
  $("#greet").innerHTML = `Hey <span class="hand">${esc(nameOf("her"))} &amp; ${esc(nameOf("him"))}</span>. ${esc(pick(GREETS))} <span class="tiny">Day ${days} of Usie.</span>`;
  seg($("#whoSeg"), S.ui.who, w => { S.ui.who = w; save(); });
  $("#promptChip").textContent = "Need a nudge? " + pick(POST_PROMPTS);
  const feed = $("#feed");
  feed.innerHTML = S.posts.slice().sort((a, b) => b.ts - a.ts).map(postHTML).join("");
}
function postHTML(p) {
  const r = p.reacts || {};
  const body = p.type === "cap"
    ? `${p.photo ? `<img class="post-photo" src="${p.photo}" alt="Caption-this photo">` : `<p class="caption" style="cursor:default">${esc(p.prompt)}</p>`}
       <div class="capduo"><div><small>${esc(nameOf("her"))}</small>${esc(p.capHer)}</div><div><small>${esc(nameOf("him"))}</small>${esc(p.capHim)}</div></div>`
    : `${p.photo ? `<img class="post-photo" src="${p.photo}" alt="Photo posted by ${esc(nameOf(p.by))}" loading="lazy">` : ""}
       <p class="caption" contenteditable="true" spellcheck="true" data-id="${p.id}" aria-label="Caption, tap to edit">${esc(p.caption)}</p>
       ${p.edited ? `<p class="edited">edited ${ago(p.edited)}</p>` : ""}`;
  return `<li class="post" data-id="${p.id}">
    <div class="post-head"><img src="${photoOf(p.by)}" alt=""><div><b>${esc(nameOf(p.by))}${p.type === "cap" ? " started a caption-off" : ""}</b><time>${ago(p.ts)}</time></div>
    <button class="del" data-del="${p.id}" aria-label="Delete post">delete</button></div>
    ${body}
    <div class="reacts">${STICKERS.map(s => { const who = r[s.k] || []; return `<button class="react ${who.includes(S.ui.who) ? "on" : ""}" data-r="${s.k}" data-id="${p.id}" aria-label="${s.label} sticker, ${who.length}" aria-pressed="${who.includes(S.ui.who)}">${s.svg}${who.length ? `<span>${who.length}</span>` : ""}</button>`; }).join("")}</div>
  </li>`;
}
$("#postPhoto").onchange = async e => { const f = e.target.files[0]; if (!f) return;
  try { postPhoto = await compress(f); $("#postPreview").src = postPhoto; $("#postPreview").hidden = false; $("#attachName").textContent = "photo ready"; } catch (er) { toast(er.message); } };
$("#composer").onsubmit = e => {
  e.preventDefault(); const text = $("#postText").value.trim();
  if (!text && !postPhoto) return toast("Say something sweet first. Or at least a photo.");
  S.posts.push({ id: uid(), by: S.ui.who, caption: text, photo: postPhoto, ts: Date.now(), reacts: {} });
  postPhoto = null; e.target.reset(); $("#postPreview").hidden = true; $("#attachName").textContent = "";
  save(); renderFeed(); toast(pick(["Posted. They're gonna love it.", "Delivered with a kiss.", "Into the feed it goes."]));
};
$("#promptChip").onclick = () => { $("#postText").value = $("#promptChip").textContent.replace("Need a nudge? ", "") + "\n"; $("#postText").focus(); };
$("#feed").addEventListener("click", e => {
  const r = e.target.closest(".react");
  if (r) { const p = S.posts.find(x => x.id === r.dataset.id); p.reacts ||= {}; const arr = p.reacts[r.dataset.r] ||= [];
    const i = arr.indexOf(S.ui.who); i >= 0 ? arr.splice(i, 1) : arr.push(S.ui.who); save();
    const li = r.closest(".post"); li.outerHTML = postHTML(p);
    const nr = $(`.post[data-id="${p.id}"] .react[data-r="${r.dataset.r}"]`); nr?.classList.add("bump"); nr?.focus(); return; }
  const d = e.target.closest("[data-del]");
  if (d && confirm("Delete this post? No take-backs.")) { S.posts = S.posts.filter(x => x.id !== d.dataset.del); save(); renderFeed(); }
});
$("#feed").addEventListener("keydown", e => { if (e.target.classList.contains("caption") && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.blur(); } });
$("#feed").addEventListener("focusout", e => {
  const c = e.target; if (!c.classList?.contains("caption") || !c.dataset.id) return;
  const p = S.posts.find(x => x.id === c.dataset.id); const v = c.innerText.trim();
  if (p && v !== p.caption) { p.caption = v; p.edited = Date.now(); save(); toast("Caption updated. Much punnier."); }
});

/* ---------- play ---------- */
let capItem = null;
function renderPlay() {
  $$("[data-cap]").forEach(x => x.textContent = nameOf(x.dataset.cap) + "'s caption");
  if (!capItem) shuffleCap();
  renderWyr(); renderNotes();
}
function shuffleCap() {
  const photos = S.posts.filter(p => p.photo && p.type !== "cap");
  capItem = photos.length && Math.random() < 0.6 ? { photo: pick(photos).photo } : { prompt: pick(CAP_PROMPTS) };
  $("#capStage").innerHTML = capItem.photo ? `<img src="${capItem.photo}" alt="A photo from your feed">` : `<p>"${esc(capItem.prompt)}"</p>`;
  $("#capHer").value = ""; $("#capHim").value = "";
}
$("#capShuffle").onclick = shuffleCap;
$("#capSave").onclick = () => {
  const h = $("#capHer").value.trim(), m = $("#capHim").value.trim();
  if (!h || !m) return toast("Both of you need a caption. No hiding.");
  S.posts.push({ id: uid(), type: "cap", by: S.ui.who, ts: Date.now(), photo: capItem.photo || null, prompt: capItem.prompt || "", capHer: h, capHim: m, reacts: {} });
  save(); capItem = null; shuffleCap(); toast("Saved to your feed. Now vote with stickers.");
};
function renderWyr() {
  const i = S.wyr.i % WYR.length, a = S.wyr.a[i] || {};
  $("#wyrQ").textContent = `Question ${i + 1} of ${WYR.length}. Both of you pick, no peeking.`;
  $("#wyrOpts").innerHTML = WYR[i].map((o, n) => `<div class="wyr-opt">${esc(o)}<div class="pick">
    <button class="her ${a.her === n ? "on" : ""}" data-w="her" data-n="${n}" aria-pressed="${a.her === n}">${esc(nameOf("her"))}</button>
    <button class="him ${a.him === n ? "on" : ""}" data-w="him" data-n="${n}" aria-pressed="${a.him === n}">${esc(nameOf("him"))}</button></div></div>`).join("");
  $("#wyrRes").textContent = a.her == null || a.him == null ? "" : a.her === a.him ? "Same pick! Great minds, cute faces." : "Split decision. Loser of the next rock-paper-scissors explains themselves.";
}
$("#wyrOpts").onclick = e => { const b = e.target.closest("button"); if (!b) return; const i = S.wyr.i % WYR.length;
  (S.wyr.a[i] ||= {})[b.dataset.w] = +b.dataset.n; save(); renderWyr(); };
$("#wyrNext").onclick = () => { S.wyr.i++; save(); renderWyr(); };
let noteFrom = "her";
function renderNotes() {
  seg($("#noteFrom"), noteFrom, w => noteFrom = w);
  $("#envelopes").innerHTML = S.notes.slice().reverse().map(n => n.opened
    ? `<li><div class="env open"><span class="lbl">Open when ${esc(n.when.replace(/^open when\s*/i, ""))}<small>from ${esc(nameOf(n.from))}</small></span><span class="body">${esc(n.body)}</span></div></li>`
    : `<li><button class="env" data-note="${n.id}" aria-label="Sealed note: open when ${esc(n.when)}"><span class="flap"></span><svg class="seal"><use href="#heart"/></svg><span class="lbl">Open when ${esc(n.when.replace(/^open when\s*/i, ""))}<small>from ${esc(nameOf(n.from))} · sealed</small></span></button></li>`).join("")
    || `<li class="tiny">No envelopes yet. Write the first one, romantic.</li>`;
}
$("#noteForm").onsubmit = e => { e.preventDefault();
  S.notes.push({ id: uid(), from: noteFrom, when: $("#noteWhen").value.trim(), body: $("#noteBody").value.trim(), ts: Date.now(), opened: false });
  e.target.reset(); save(); renderNotes(); toast("Sealed. Mwah."); };
$("#envelopes").onclick = e => { const b = e.target.closest("[data-note]"); if (!b) return; const n = S.notes.find(x => x.id === b.dataset.note);
  if (confirm(`Is it really time? Open when ${n.when.replace(/^open when\s*/i, "")}`)) { n.opened = Date.now(); save(); renderNotes(); } };

/* ---------- grow ---------- */
let checkWho = "her";
function renderGrow() {
  seg($("#checkWho"), checkWho, w => checkWho = w);
  $("#checks").innerHTML = S.checks.slice().reverse().slice(0, 8).map(c =>
    `<li><b>${esc(nameOf(c.who))}</b> · ${new Date(c.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · felt loved <b>${c.loved}/10</b>, quality time <b>${c.time}/10</b>
     ${c.liked ? `<br>Loved: ${esc(c.liked)}` : ""}${c.more ? `<br>More of: ${esc(c.more)}` : ""}</li>`).join("");
  renderJar(false); renderBucket();
}
["1", "2"].forEach(n => $("#c" + n).oninput = e => $("#o" + n).textContent = e.target.value);
$("#checkForm").onsubmit = e => { e.preventDefault();
  S.checks.push({ id: uid(), who: checkWho, loved: +$("#c1").value, time: +$("#c2").value, liked: $("#c3").value.trim(), more: $("#c4").value.trim(), ts: Date.now() });
  $("#c3").value = ""; $("#c4").value = ""; save(); renderGrow(); toast("Check-in saved. Proud of you two."); };
function renderJar(animLast) {
  const g = $("#jarHearts"), cols = ["#E2455C", "#F7A1AE", "#F2B84B", "#5B8C7A", "#B8293F"];
  g.innerHTML = S.jar.slice(-24).map((j, i) => { const x = 40 + (i * 37) % 70, y = 150 - Math.floor(i / 3) * 14;
    return `<use href="#heart" x="${x}" y="${y}" width="20" height="20" color="${cols[i % 5]}" ${animLast && i === Math.min(S.jar.length, 24) - 1 ? "" : 'style="animation:none"'}/>`; }).join("");
  $("#jarCount").textContent = S.jar.length;
}
$("#jarForm").onsubmit = e => { e.preventDefault(); S.jar.push({ id: uid(), text: $("#jarText").value.trim(), ts: Date.now() }); e.target.reset(); save(); renderJar(true); toast("Plop. Into the jar."); };
$("#jarPull").onclick = () => { $("#jarPulled").textContent = S.jar.length ? "\u201C" + pick(S.jar).text + "\u201D" : "The jar is empty. Fill it with tiny thank-yous first."; };
function renderBucket() {
  $("#bucket").innerHTML = S.bucket.map(b => `<li class="${b.done ? "done" : ""}"><input type="checkbox" id="b_${b.id}" data-b="${b.id}" ${b.done ? "checked" : ""}><label for="b_${b.id}" style="font-weight:700;flex-direction:row"><span>${esc(b.text)}</span></label><button class="x" data-bx="${b.id}" aria-label="Remove">×</button></li>`).join("");
  const d = S.bucket.filter(b => b.done).length;
  $("#bucketMeta").textContent = S.bucket.length ? `${d} of ${S.bucket.length} done. ${d === S.bucket.length ? "Time to dream bigger." : "Keep going, adventurers."}` : "Start with something small. Then something wild.";
}
$("#bucketForm").onsubmit = e => { e.preventDefault(); S.bucket.push({ id: uid(), text: $("#bucketText").value.trim(), done: false }); e.target.reset(); save(); renderBucket(); };
$("#bucket").onclick = e => { const x = e.target.closest("[data-bx]"); if (x) { S.bucket = S.bucket.filter(b => b.id !== x.dataset.bx); save(); renderBucket(); } };
$("#bucket").onchange = e => { const b = S.bucket.find(x => x.id === e.target.dataset.b); if (b) { b.done = e.target.checked; save(); renderBucket(); if (b.done) toast("Look at you two, checking things off."); } };

/* ---------- us ---------- */
function renderUs() {
  $("#usCards").innerHTML = ["her", "him"].map(w => { const p = S[w]; return `<article class="card us-card"><img src="${photoOf(w)}" alt="${esc(nameOf(w))}">
    <h3>${esc(p.name)}${p.nick ? ` <em>"${esc(p.nick)}"</em>` : ""}</h3>
    <dl><dt>Love language</dt><dd>${esc(p.lang)}</dd>${p.bday ? `<dt>Birthday</dt><dd>${esc(new Date(p.bday + "T00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" }))}</dd>` : ""}
    ${QUESTIONS.map(q => `<dt>${esc(q.q)}</dt><dd>${esc(q.o[p.q[q.k]] ?? "-")}</dd>`).join("")}
    ${p.food ? `<dt>Comfort food</dt><dd>${esc(p.food)}</dd>` : ""}${p.noticed ? `<dt>First noticed</dt><dd>${esc(p.noticed)}</dd>` : ""}</dl></article>`; }).join("");
}
$("#editProfiles").onclick = () => startOnboard(0);
$("#seeSynergy").onclick = showSynergy;
$("#exportBtn").onclick = async () => {
  const v = await sealState(KEY, SALT, S);
  const blob = new Blob([JSON.stringify({ app: "usie", ...v, ct: b64chunk(v.ct) })], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `usie-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  toast("Backup downloaded. It's encrypted with your passcode.");
};
function b64chunk(u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }
$("#importFile").onchange = async e => { const f = e.target.files[0]; if (!f) return;
  try { const j = JSON.parse(await f.text()); if (j.app !== "usie") throw 0;
    const vault = { v: 1, salt: j.salt, iv: j.iv, ct: unb64(j.ct) };
    const key = j.salt === b64(SALT) ? KEY : await deriveKey(prompt("Passcode for this backup?") || "", unb64(j.salt));
    S = await openState(key, vault); KEY = key; SALT = unb64(j.salt); await idb.set("vault", vault); toast("Restored. Welcome back."); show("feed");
  } catch { toast("Couldn't restore that file (wrong file or passcode)."); } };
$("#resetBtn").onclick = async () => { if (!confirm("Start over? This erases every post, note and profile on this device.")) return;
  await idb.del("vault"); KEY = S = null; toast("Fresh start."); boot(); };

boot();
})();
