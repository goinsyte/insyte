/*
 * The staff page (M18): plain HTML, one script and one stylesheet, all from this Worker, in Dutch. No design port:
 * it is for the team, behind Access. Everything it shows is set as text (`textContent`), never as markup, so a
 * workspace's name cannot write into the page. Its own CSP allows nothing but itself.
 */

export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; " +
  "form-action 'none'; frame-ancestors 'none'"

export const PAGE = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Insyte-support</title>
<link rel="stylesheet" href="/api/__admin/staff.css">
</head>
<body>
<header>
  <h1>Insyte-support</h1>
  <p id="me" class="muted"></p>
</header>
<main>
  <section>
    <h2>Werkruimte zoeken</h2>
    <form id="search">
      <input name="q" required minlength="2" maxlength="200" autocomplete="off"
        placeholder="Naam, winkeldomein, e-mailadres van de eigenaar of id" aria-label="Zoeken">
      <button type="submit">Zoeken</button>
    </form>
    <p id="search-state" class="muted"></p>
    <table id="results" hidden>
      <thead><tr><th>Naam</th><th>Abonnement</th><th>Aangemaakt</th><th>Winkels</th><th>Leden</th><th>Gezondheid</th><th>Meekijken</th><th></th></tr></thead>
      <tbody></tbody>
    </table>
  </section>
  <section id="health" hidden>
    <h2 id="health-title">Gezondheid</h2>
    <div id="health-body"></div>
    <h3>Meekijken, alleen lezen</h3>
    <p id="consent" class="muted"></p>
    <form id="start">
      <input name="reason" required minlength="3" maxlength="500" autocomplete="off"
        placeholder="Reden, bijvoorbeeld het ticketnummer" aria-label="Reden">
      <button type="submit">Meekijken starten</button>
    </form>
  </section>
  <section id="session" hidden>
    <h2>Meekijken</h2>
    <p id="session-state"></p>
    <form id="read">
      <select name="rpc" aria-label="Wat je wilt lezen"></select>
      <textarea name="payload" rows="3" aria-label="Invoer (JSON)">{}</textarea>
      <button type="submit">Lezen</button>
    </form>
    <p><button type="button" id="end">Meekijken beëindigen</button></p>
    <pre id="output"></pre>
  </section>
</main>
<script src="/api/__admin/staff.js"></script>
</body>
</html>
`

export const STYLE = `
:root { color-scheme: light dark; font: 15px/1.5 system-ui, sans-serif; }
body { margin: 0 auto; max-width: 72rem; padding: 1rem; }
h1 { font-size: 1.4rem; margin: 0; }
h2 { font-size: 1.1rem; margin-top: 2rem; }
h3 { font-size: 1rem; margin-top: 1.5rem; }
.muted { opacity: 0.7; }
.warn { color: #b45309; }
form { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: flex-start; }
input, select, textarea { font: inherit; padding: 0.35rem 0.5rem; min-width: 18rem; flex: 1; }
textarea { font-family: ui-monospace, monospace; }
button { font: inherit; padding: 0.35rem 0.8rem; cursor: pointer; }
table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
th, td { text-align: left; padding: 0.3rem 0.5rem; border-bottom: 1px solid rgb(128 128 128 / 0.3); vertical-align: top; }
pre { white-space: pre-wrap; word-break: break-word; background: rgb(128 128 128 / 0.1); padding: 0.75rem; max-height: 60vh; overflow: auto; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.2rem 1rem; }
dt { font-weight: 600; }
dd { margin: 0; }
`

export const SCRIPT = `"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, text) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = String(text); return e; };
  const when = (iso) => iso ? new Date(iso).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" }) : "—";
  const CODES = {
    no_consent: "De eigenaar heeft meekijken niet aangezet.",
    consent_expired: "De toestemming van de eigenaar is verlopen.",
    no_session: "Deze sessie bestaat niet (of is niet van jou).",
    session_ended: "Deze sessie is beëindigd.",
    session_expired: "Deze sessie is verlopen (60 minuten).",
    reason_required: "Geef een reden van 3 tot 500 tekens.",
    not_readable: "Dit kan niet gelezen worden tijdens meekijken.",
    never_for_staff: "Exporteren, wissen, verwijderen en geheimen zijn nooit beschikbaar voor support.",
    workspace_not_found: "Deze werkruimte bestaat niet.",
    invalid_payload: "De invoer klopt niet voor deze weergave.",
    read_only: "Deze weergave probeerde iets te schrijven en is geweigerd: meekijken is alleen lezen.",
    Forbidden: "Geweigerd: meekijken is alleen lezen.",
    forbidden: "Geen toegang."
  };
  const say = (code) => CODES[code] || ("Mislukt (" + code + ")");
  const api = async (path, body) => {
    const response = await fetch("/api/__admin" + path, body === undefined
      ? { headers: { "x-insyte-staff": "1" } }
      : { method: "POST", headers: { "x-insyte-staff": "1", "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((data.error && data.error.code) || String(response.status));
    return data;
  };
  let workspace = null;
  let session = null;

  api("/me").then((me) => {
    $("me").textContent = "Ingelogd als " + me.email + ". Elke zoekopdracht, weergave en sessie wordt vastgelegd.";
    const select = document.querySelector("#read select");
    for (const read of me.reads) { const o = el("option", read.label + " (" + read.rpc + ")"); o.value = read.rpc; select.append(o); }
  }).catch((e) => { $("me").textContent = say(e.message); });

  $("search").addEventListener("submit", async (event) => {
    event.preventDefault();
    const q = new FormData(event.target).get("q");
    $("search-state").textContent = "Zoeken…";
    try {
      const { workspaces } = await api("/workspaces?q=" + encodeURIComponent(q));
      $("search-state").textContent = workspaces.length === 0 ? "Niets gevonden." : workspaces.length + " gevonden.";
      const body = document.querySelector("#results tbody");
      body.replaceChildren();
      for (const w of workspaces) {
        const row = el("tr");
        row.append(el("td", w.name), el("td", w.plan + (w.billing ? " · " + w.billing : "")), el("td", when(w.createdAt)),
          el("td", w.stores), el("td", w.members),
          el("td", w.health === "ok" ? "In orde" : "Aandacht (" + w.openIncidents + " open)"),
          el("td", w.consentUntil ? "Mag tot " + when(w.consentUntil) : "Geen toestemming"));
        const cell = el("td"); const open = el("button", "Bekijken"); open.type = "button";
        open.addEventListener("click", () => showHealth(w.id)); cell.append(open); row.append(cell); body.append(row);
      }
      $("results").hidden = workspaces.length === 0;
    } catch (e) { $("search-state").textContent = say(e.message); }
  });

  const list = (title, items) => { const box = el("div"); box.append(el("h3", title)); const ul = el("ul");
    if (items.length === 0) ul.append(el("li", "Niets."));
    for (const item of items) ul.append(el("li", item)); box.append(ul); return box; };

  const showHealth = async (id) => {
    try {
      const h = await api("/workspaces/" + encodeURIComponent(id) + "/health");
      workspace = h.workspace;
      $("health").hidden = false;
      $("health-title").textContent = "Gezondheid van " + h.workspace.name;
      const body = $("health-body"); body.replaceChildren();
      const facts = el("dl");
      const fact = (k, v) => facts.append(el("dt", k), el("dd", v));
      fact("Id", h.workspace.id);
      fact("Abonnement", h.billing.plan + (h.billing.status ? " · " + h.billing.status : "") +
        (h.billing.trialEndsAt ? " · proef tot " + when(h.billing.trialEndsAt) : "") +
        (h.billing.cancelAt ? " · stopt " + when(h.billing.cancelAt) : ""));
      fact("Outbox", h.outbox.pending + " wachtend" + (h.outbox.lagSeconds !== null ? ", oudste " + h.outbox.lagSeconds + " s" : "") +
        (h.outbox.stuck > 0 ? ", " + h.outbox.stuck + " vastgelopen (retries of DLQ)" : ""));
      fact("AI deze maand", "€ " + h.ai.usedEuros.toFixed(2) + (h.ai.limitEuros === null ? " (geen limiet)" : " van € " + h.ai.limitEuros));
      body.append(facts);
      body.append(list("Koppelingen", h.connections.map((c) => c.provider + " · " + c.status +
        (c.failures > 0 ? " · " + c.failures + " mislukt" + (c.failure ? " (" + c.failure + ")" : "") : "") +
        " · laatst gesynchroniseerd " + when(c.lastSyncedAt) +
        (c.incidents.length > 0 ? " · open: " + c.incidents.map((i) => i.kind).join(", ") : ""))));
      body.append(list("Webhooks per winkel", h.webhookGaps.map((g) => g.shopDomain + " · laatste bestelwebhook " +
        when(g.lastOrderHookAt) + (g.open ? " · gat open" : ""))));
      body.append(list("Fouten, laatste 7 dagen", h.errors.map((e) => e.source + " · " + e.code + " · " + e.count + "× · laatst " + when(e.lastAt))));
      $("consent").textContent = h.workspace.consentUntil
        ? "De eigenaar staat meekijken toe tot " + when(h.workspace.consentUntil) + ". Een sessie duurt hoogstens 60 minuten."
        : "De eigenaar heeft meekijken niet aangezet. Vraag het via Instellingen → Gegevens en privacy.";
      $("start").hidden = !h.workspace.consentUntil;
    } catch (e) { alert(say(e.message)); }
  };

  $("start").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!workspace) return;
    try {
      session = (await api("/sessions", { workspaceId: workspace.id, reason: new FormData(event.target).get("reason") })).session;
      $("session").hidden = false;
      $("session-state").textContent = "Je kijkt mee in " + workspace.name + " tot " + when(session.expiresAt) + ". Alleen lezen; de leden zien dat je meekijkt.";
      $("output").textContent = "";
    } catch (e) { alert(say(e.message)); }
  });

  $("read").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session) return;
    const form = new FormData(event.target);
    let payload;
    try { const text = String(form.get("payload") || "").trim(); payload = text === "" ? undefined : JSON.parse(text); }
    catch { $("output").textContent = "De invoer is geen JSON."; return; }
    try {
      const result = await api("/sessions/" + encodeURIComponent(session.id) + "/read", { rpc: form.get("rpc"), payload });
      $("output").textContent = result.ok ? JSON.stringify(result.value, null, 2) : say(result.code);
    } catch (e) { $("output").textContent = say(e.message); }
  });

  $("end").addEventListener("click", async () => {
    if (!session) return;
    try { await api("/sessions/" + encodeURIComponent(session.id) + "/end", {}); } catch (e) { alert(say(e.message)); }
    session = null; $("session").hidden = true;
  });
})();
`
