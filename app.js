const sb = supabase.createClient(APP_CONFIG.url, APP_CONFIG.key);
const STAGES = ["Lead","Assigned","Filming","Editing","On air"];
const PRI = ["All","P1","P2","P3"];
let me = null, feed = [], stories = [], people = [], filt = { pri: "All" }, timer;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || "");
const name = id => (people.find(p => p.id === id) || {}).full_name || "—";
const ago = t => { const m = Math.max(0, (Date.now() - new Date(t)) / 6e4 | 0); return m < 1 ? "now" : m < 60 ? m + "m ago" : (m / 60 | 0) + "h ago"; };

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  session ? start(session.user) : ($("login").classList.remove("hide"), $("app").classList.add("hide"));
}
async function auth(signup) {
  const email = $("em").value, password = $("pw").value;
  const { data, error } = signup ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
  if (error) return $("msg").textContent = error.message;
  if (!data.session) return $("msg").textContent = "Check your email to confirm, then sign in.";
  start(data.user);
}
async function start(user) {
  $("login").classList.add("hide"); $("app").classList.remove("hide");
  await load();
  me = people.find(p => p.id === user.id) || { id: user.id, full_name: user.email, role: "reporter", status: "available" };
  $("who").textContent = `${me.full_name} · ${me.role}`; $("mystatus").value = me.status;
  sb.channel("newsroom").on("postgres_changes", { event: "*", schema: "public" }, () => { clearTimeout(timer); timer = setTimeout(async () => { await load(); }, 400); }).subscribe();
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
  if (a === "adv") { await sb.from("stories").update({ stage: s.stage + 1 }).eq("id", id); log("advance", "story", +id, { to: STAGES[s.stage + 1] }); }
  load();
}
function render() {
  const q = $("q").value.toLowerCase();
  const v = feed.filter(f => (filt.pri === "All" || f.priority === filt.pri) && (!q || (f.title + f.source + f.category).toLowerCase().includes(q)));
  const onAir = stories.filter(s => s.stage === 4).length;
  $("kpis").innerHTML = [["Feed items", feed.length], ["Breaking (P1)", feed.filter(f => f.priority === "P1").length], ["Awaiting verification", feed.filter(f => !f.verified).length], ["In progress", stories.length - onAir], ["On air", onAir], ["Staff online", people.filter(p => p.status !== "break").length]]
    .map(k => `<div class="card"><div class="n">${k[1]}</div><div class="l">${k[0]}</div></div>`).join("");
  $("fl").innerHTML = PRI.map(p => `<button class="${filt.pri === p ? "on" : ""}" data-pri="${p}">${p}</button>`).join("");
  $("feed").innerHTML = v.map(f => `<div class="item"><b>${safeUrl(f.url) ? `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer" style="color:inherit">${esc(f.title)} ↗</a>` : esc(f.title)}</b><div class="meta"><span class="${f.priority}">${f.priority}</span><span>${esc(f.source)}</span>${f.scope ? `<span>${esc(f.scope)}</span>` : ""}<span>${esc(f.category)}</span><span>${ago(f.published_at || f.created_at)}</span><span class="${f.verified ? "v" : "u"}">${f.verified ? "✓ Verified" : "⚠ Unverified"}</span>${f.claimed_by ? `<span>→ ${esc(name(f.claimed_by))}</span>` : ""}</div>
    ${f.verified ? "" : `<button data-a="verify" data-id="${f.id}">Mark verified</button> `}${f.claimed_by ? "" : `<button data-a="claim" data-id="${f.id}">Claim</button> `}<button class="p" data-a="story" data-id="${f.id}">Create story</button></div>`).join("") || '<div class="meta">No items.</div>';
  $("kan").innerHTML = STAGES.map((n, i) => `<div class="col"><h3>${n} (${stories.filter(s => s.stage === i).length})</h3>${stories.filter(s => s.stage === i).map(s => `<div class="st"><b>${esc(s.title)}</b><div class="meta">${esc(s.category)} · ${esc(name(s.assignee))}</div>${i < 4 ? `<button data-a="adv" data-id="${s.id}">Advance →</button>` : ""}</div>`).join("")}</div>`).join("");
  $("crew").innerHTML = "<tr><th>Name</th><th>Role</th><th>Location</th><th>Status</th></tr>" + people.map(p => `<tr><td>${esc(p.full_name)}</td><td>${p.role}</td><td>${esc(p.location || "—")}</td><td>${p.status.replace("_", " ")}</td></tr>`).join("");
}
document.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.pri) { filt.pri = b.dataset.pri; return render(); }
  if (b.dataset.a) act(b.dataset.a, b.dataset.id); });
$("in").onclick = () => auth(false); $("up").onclick = () => auth(true);
$("out").onclick = async () => { await sb.auth.signOut(); location.reload(); };
$("q").oninput = render;
$("mystatus").onchange = async e => { await sb.from("profiles").update({ status: e.target.value }).eq("id", me.id); load(); };
boot();
