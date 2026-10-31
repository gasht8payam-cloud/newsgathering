const sb = supabase.createClient(APP_CONFIG.url, APP_CONFIG.key);
const PRI = ["All", "P1", "P2", "P3"];
const I18N = {
  en: { signin:"Sign in", email:"Email", password:"Password (min 6)", search:"Search feed…", signout:"Sign out", all:"All",
    k_feed:"Feed items", k_p1:"Breaking (P1)", k_unver:"Awaiting verification", k_prog:"In progress", k_air:"On air", k_staff:"Staff online",
    incoming:"Incoming feed", pipeline:"Story pipeline", team:"Team on duty",
    s0:"Lead", s1:"Assigned", s2:"Filming", s3:"Editing", s4:"On air",
    verified:"✓ Verified", unverified:"⚠ Unverified", verify:"Mark verified", claim:"Claim", story:"Create story", adv:"Advance →", none:"No items.",
    available:"Available", on_assignment:"On assignment", live:"Live", break:"Break",
    role_editor:"Editor", role_producer:"Producer", role_reporter:"Reporter",
    h_name:"Name", h_role:"Role", h_loc:"Location", h_status:"Status",
    local:"local", national:"national", international:"international", now:"now", min:"{n}m ago", hr:"{n}h ago" },
  ckb: { signin:"چوونەژوورەوە", email:"ئیمەیڵ", password:"وشەی نهێنی (لانیکەم ٦ پیت)", search:"گەڕان لە هەواڵەکان…", signout:"چوونەدەرەوە", all:"هەموو",
    k_feed:"هەواڵەکان", k_p1:"هەواڵی لەناکاو (P1)", k_unver:"چاوەڕێی پشتڕاستکردنەوە", k_prog:"لە پڕۆسەدا", k_air:"لەسەر شاشە", k_staff:"ستافی چالاک",
    incoming:"هەواڵە هاتووەکان", pipeline:"ڕێڕەوی هەواڵ", team:"تیمی ئامادە",
    s0:"بیرۆکە", s1:"دیاریکراو", s2:"فیلمگرتن", s3:"مۆنتاژ", s4:"بڵاوکراوە",
    verified:"✓ پشتڕاستکراوە", unverified:"⚠ پشتڕاستنەکراوە", verify:"پشتڕاستکردنەوە", claim:"وەرگرتنی ئەرک", story:"دروستکردنی هەواڵ", adv:"پێشخستن ←", none:"هیچ هەواڵێک نییە.",
    available:"ئامادە", on_assignment:"لەسەر ئەرک", live:"ڕاستەوخۆ", break:"پشوو",
    role_editor:"سەرنووسەر", role_producer:"پرۆدیوسەر", role_reporter:"ڕۆژنامەنووس",
    h_name:"ناو", h_role:"ڕۆڵ", h_loc:"شوێن", h_status:"دۆخ",
    local:"ناوخۆیی", national:"نیشتمانی", international:"نێودەوڵەتی", now:"ئێستا", min:"{n} خولەک لەمەوبەر", hr:"{n} کاتژمێر لەمەوبەر",
    cat_Politics:"سیاسی", cat_Security:"ئاسایش", cat_Economy:"ئابووری", cat_Health:"تەندروستی", cat_Sport:"وەرزش", cat_Weather:"کەشوهەوا", cat_General:"گشتی" }
};
let lang = (() => { try { return localStorage.getItem("lang") || "ckb"; } catch { return "ckb"; } })();
let me = null, feed = [], stories = [], people = [], filt = { pri: "All" }, timer;
const $ = id => document.getElementById(id);
const t = k => (I18N[lang] && I18N[lang][k]) ?? I18N.en[k] ?? k;
const tc = c => (I18N[lang] && I18N[lang]["cat_" + c]) || c;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || "");
const name = id => (people.find(p => p.id === id) || {}).full_name || "—";
const ago = d => { const m = Math.max(0, (Date.now() - new Date(d)) / 6e4 | 0); return m < 1 ? t("now") : m < 60 ? t("min").replace("{n}", m) : t("hr").replace("{n}", m / 60 | 0); };

function applyLang() {
  const r = document.documentElement; r.lang = lang === "ckb" ? "ckb" : "en"; r.dir = lang === "ckb" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i]").forEach(e => e.textContent = t(e.dataset.i));
  document.querySelectorAll("[data-ph]").forEach(e => e.placeholder = t(e.dataset.ph));
  document.querySelectorAll("#mystatus option").forEach(o => o.textContent = t(o.value));
  document.querySelectorAll(".langsel").forEach(s => s.value = lang);
}
async function boot() {
  applyLang();
  const { data: { session } } = await sb.auth.getSession();
  session ? start(session.user) : ($("login").classList.remove("hide"), $("app").classList.add("hide"));
}
async function signIn() {
  const { data, error } = await sb.auth.signInWithPassword({ email: $("em").value, password: $("pw").value });
  if (error) return $("msg").textContent = error.message;
  start(data.user);
}
async function start(user) {
  $("login").classList.add("hide"); $("app").classList.remove("hide");
  await load();
  me = people.find(p => p.id === user.id) || { id: user.id, full_name: user.email, role: "reporter", status: "available" };
  $("who").textContent = `${me.full_name} · ${t("role_" + me.role)}`; $("mystatus").value = me.status;
  sb.channel("newsroom").on("postgres_changes", { event: "*", schema: "public" }, () => { clearTimeout(timer); timer = setTimeout(load, 400); }).subscribe();
}
async function load() {
  const [f, s, p] = await Promise.all([
    sb.from("feed_items").select("*").order("created_at", { ascending: false }).limit(200),
    sb.from("stories").select("*").order("created_at", { ascending: false }),
    sb.from("profiles").select("*").order("full_name")]);
  feed = f.data || []; stories = s.data || []; people = p.data || []; render();
}
const log = (action, entity, entity_id, details) => sb.from("audit_log").insert({ action, entity, entity_id, details });
async function act(a, id) {
  const f = feed.find(x => x.id == id), s = stories.find(x => x.id == id);
  if (a === "verify") { await sb.from("feed_items").update({ verified: true, verified_by: me.id }).eq("id", id); log("verify", "feed_item", +id); }
  if (a === "claim") { await sb.from("feed_items").update({ claimed_by: me.id }).eq("id", id).is("claimed_by", null); log("claim", "feed_item", +id); }
  if (a === "story") { await sb.from("stories").insert({ title: f.title, category: f.category, feed_item_id: f.id, assignee: f.claimed_by, stage: f.claimed_by ? 1 : 0, created_by: me.id }); log("create_story", "feed_item", +id); }
  if (a === "adv") { await sb.from("stories").update({ stage: s.stage + 1 }).eq("id", id); log("advance", "story", +id, { to: s.stage + 1 }); }
  load();
}
function render() {
  if (!me) return;
  $("who").textContent = `${me.full_name} · ${t("role_" + me.role)}`;
  const q = $("q").value.toLowerCase();
  const v = feed.filter(f => (filt.pri === "All" || f.priority === filt.pri) && (!q || (f.title + f.source + f.category).toLowerCase().includes(q)));
  const onAir = stories.filter(s => s.stage === 4).length;
  $("kpis").innerHTML = [["k_feed", feed.length], ["k_p1", feed.filter(f => f.priority === "P1").length], ["k_unver", feed.filter(f => !f.verified).length], ["k_prog", stories.length - onAir], ["k_air", onAir], ["k_staff", people.filter(p => p.status !== "break").length]]
    .map(k => `<div class="card"><div class="n">${k[1]}</div><div class="l">${t(k[0])}</div></div>`).join("");
  $("fl").innerHTML = PRI.map(p => `<button class="${filt.pri === p ? "on" : ""}" data-pri="${p}">${p === "All" ? t("all") : p}</button>`).join("");
  $("feed").innerHTML = v.map(f => `<div class="item"><b>${safeUrl(f.url) ? `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer" style="color:inherit">${esc(f.title)} ↗</a>` : esc(f.title)}</b><div class="meta"><span class="${f.priority}">${f.priority}</span><span>${esc(f.source)}</span>${f.scope ? `<span>${esc(t(f.scope))}</span>` : ""}<span>${esc(tc(f.category))}</span><span>${ago(f.published_at || f.created_at)}</span><span class="${f.verified ? "v" : "u"}">${f.verified ? t("verified") : t("unverified")}</span>${f.claimed_by ? `<span>→ ${esc(name(f.claimed_by))}</span>` : ""}</div>
    ${f.verified ? "" : `<button data-a="verify" data-id="${f.id}">${t("verify")}</button> `}${f.claimed_by ? "" : `<button data-a="claim" data-id="${f.id}">${t("claim")}</button> `}<button class="p" data-a="story" data-id="${f.id}">${t("story")}</button></div>`).join("") || `<div class="meta">${t("none")}</div>`;
  $("kan").innerHTML = [0, 1, 2, 3, 4].map(i => `<div class="col"><h3>${t("s" + i)} (${stories.filter(s => s.stage === i).length})</h3>${stories.filter(s => s.stage === i).map(s => `<div class="st"><b>${esc(s.title)}</b><div class="meta">${esc(tc(s.category))} · ${esc(name(s.assignee))}</div>${i < 4 ? `<button data-a="adv" data-id="${s.id}">${t("adv")}</button>` : ""}</div>`).join("")}</div>`).join("");
  $("crew").innerHTML = `<tr><th>${t("h_name")}</th><th>${t("h_role")}</th><th>${t("h_loc")}</th><th>${t("h_status")}</th></tr>` + people.map(p => `<tr><td>${esc(p.full_name)}</td><td>${t("role_" + p.role)}</td><td>${esc(p.location || "—")}</td><td>${t(p.status)}</td></tr>`).join("");
}
document.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.pri) { filt.pri = b.dataset.pri; return render(); }
  if (b.dataset.a) act(b.dataset.a, b.dataset.id); });
document.querySelectorAll(".langsel").forEach(s => s.onchange = e => { lang = e.target.value; try { localStorage.setItem("lang", lang); } catch {} applyLang(); render(); });
$("in").onclick = signIn;
$("out").onclick = async () => { await sb.auth.signOut(); location.reload(); };
$("q").oninput = render;
$("mystatus").onchange = async e => { await sb.from("profiles").update({ status: e.target.value }).eq("id", me.id); load(); };
boot();
