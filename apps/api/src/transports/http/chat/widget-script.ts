/*
 * The website chat's widget (M15 step 8), as the storefront loads it from the theme's app embed
 * (`shopify/extensions/insyte-chat`): `<script src=".../api/public/chat/widget.js" data-shop="…" defer>`. Plain
 * JavaScript with no dependencies, in a closed shadow root so the theme's styles and the widget's do not meet.
 *
 * Everything the shopper or the store wrote is put in with `textContent`, never as markup. The session's token is kept
 * in the storefront's `localStorage` under one key (and only there): it names the conversation and nothing else, and
 * lasts a day from the last page that opened it. "Gesprek beëindigen" ends the session with the conversation: the
 * widget forgets what was said and keeps only the new session the server answers with. While
 * the panel is open the widget asks for news every 4 seconds, and every 30 while a conversation exists and the panel is
 * closed, with the last answer's ETag, so "nothing new" costs a 304. It stops asking once the tab is hidden.
 *
 * The bubble is put on the page only once the session opened: where the store's chat is off, or the page is not one
 * of its storefronts, the widget shows nothing at all rather than a button that does nothing.
 *
 * Dutch only, as the console is.
 */
export const WIDGET_SCRIPT = String.raw`(() => {
  "use strict";
  const me = document.currentScript;
  if (!me || window.__insyteChat) return;
  window.__insyteChat = true;
  const shop = me.getAttribute("data-shop") || "";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) return;
  const api = new URL(me.src).origin + "/api/public/chat";
  const KEY = "insyte-chat:" + shop;
  const MAX = 1000;
  let session = null;
  try { session = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { session = null; }
  let etag = null, messages = [], openPanel = false, timer = 0, busy = false, threadOpen = true;

  const save = () => {
    try { session ? localStorage.setItem(KEY, JSON.stringify(session)) : localStorage.removeItem(KEY); } catch (e) {}
  };
  const headers = (extra) => Object.assign({ "content-type": "application/json" },
    session ? { authorization: "Bearer " + session.token } : {}, extra || {});

  async function start() {
    const res = await fetch(api + "/session", {
      method: "POST", headers: headers(),
      body: JSON.stringify(session ? { storeId: session.storeId } : { shop })
    }).catch(() => null);
    if (!res || !res.ok) return false;
    const body = await res.json();
    session = { token: body.token, storeId: body.storeId };
    save();
    render(body);
    return true;
  }

  const host = document.createElement("div");
  host.setAttribute("data-insyte-chat", "");
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = [
    ":host{all:initial}",
    "*{box-sizing:border-box;font:14px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif}",
    ".b{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:56px;height:56px;border-radius:50%;border:0;",
    "cursor:pointer;color:#fff;background:var(--c);box-shadow:0 6px 20px rgba(0,0,0,.2)}",
    ".b svg{width:26px;height:26px;fill:currentColor}",
    ".p{position:fixed;right:20px;bottom:88px;z-index:2147483000;width:min(360px,calc(100vw - 32px));",
    "height:min(520px,calc(100vh - 120px));display:none;flex-direction:column;background:#fff;color:#111;",
    "border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.22);overflow:hidden}",
    ".p.o{display:flex}",
    ".h{padding:14px 16px;color:#fff;background:var(--c);display:flex;align-items:center;gap:8px}",
    ".h strong{flex:1;font-weight:600}",
    ".h button{background:transparent;border:0;color:#fff;cursor:pointer;font-size:12px;opacity:.85}",
    ".l{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f6f7f9}",
    ".m{max-width:80%;padding:8px 11px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}",
    ".m.s{align-self:flex-end;background:var(--c);color:#fff;border-bottom-right-radius:4px}",
    ".m.t{align-self:flex-start;background:#fff;border:1px solid #e3e5e8;border-bottom-left-radius:4px}",
    ".n{font-size:12px;color:#6b7280;text-align:center;padding:4px}",
    "form{display:flex;gap:8px;padding:10px;border-top:1px solid #e3e5e8;background:#fff}",
    "textarea{flex:1;resize:none;height:40px;padding:9px 10px;border:1px solid #d1d5db;border-radius:9px;color:#111}",
    "form button{border:0;border-radius:9px;padding:0 14px;color:#fff;background:var(--c);cursor:pointer}",
    "form button:disabled{opacity:.5;cursor:default}"
  ].join("");
  root.appendChild(style);

  const bubble = document.createElement("button");
  bubble.className = "b";
  bubble.setAttribute("aria-label", "Chat met ons");
  bubble.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z"/></svg>';
  const panel = document.createElement("div");
  panel.className = "p";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Chat");
  const head = document.createElement("div");
  head.className = "h";
  const title = document.createElement("strong");
  const end = document.createElement("button");
  end.type = "button";
  end.textContent = "Gesprek beëindigen";
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Sluiten");
  close.textContent = "✕";
  head.append(title, end, close);
  const list = document.createElement("div");
  list.className = "l";
  list.setAttribute("aria-live", "polite");
  const form = document.createElement("form");
  const input = document.createElement("textarea");
  input.maxLength = MAX;
  input.placeholder = "Stel je vraag…";
  input.setAttribute("aria-label", "Je bericht");
  const send = document.createElement("button");
  send.type = "submit";
  send.textContent = "Verstuur";
  form.append(input, send);
  panel.append(head, list, form);
  root.append(bubble, panel);

  let greeting = "";
  function render(info) {
    if (info) {
      title.textContent = info.storeName || "Chat";
      greeting = info.greeting || "";
      host.style.setProperty("--c", /^#[0-9a-f]{6}$/i.test(info.color || "") ? info.color : "#1f2937");
    }
    list.replaceChildren();
    if (greeting) {
      const g = document.createElement("div");
      g.className = "m t";
      g.textContent = greeting;
      list.append(g);
    }
    for (const m of messages) {
      const el = document.createElement("div");
      el.className = "m " + (m.from === "shopper" ? "s" : "t");
      el.textContent = m.text;
      list.append(el);
    }
    if (!threadOpen) {
      const n = document.createElement("div");
      n.className = "n";
      n.textContent = "Dit gesprek is beëindigd. Stuur een bericht om een nieuw gesprek te beginnen.";
      list.append(n);
    }
    end.style.display = messages.length > 0 && threadOpen ? "" : "none";
    list.scrollTop = list.scrollHeight;
  }

  async function poll() {
    clearTimeout(timer);
    if (!session || document.hidden) return;
    const res = await fetch(api + "/" + encodeURIComponent(session.storeId) + "/messages", {
      headers: headers(etag ? { "if-none-match": etag } : {})
    }).catch(() => null);
    if (res && res.status === 401) { session = null; save(); }
    if (res && res.status === 200) {
      const body = await res.json();
      etag = body.etag;
      messages = body.messages;
      threadOpen = body.open;
      render();
    }
    schedule();
  }
  const schedule = () => {
    clearTimeout(timer);
    if (!session || document.hidden) return;
    if (openPanel || messages.length > 0) timer = setTimeout(poll, openPanel ? 4000 : 30000);
  };

  bubble.addEventListener("click", async () => {
    openPanel = !openPanel;
    panel.classList.toggle("o", openPanel);
    if (openPanel) {
      if (!session || !title.textContent) await start();
      poll();
      input.focus();
    } else schedule();
  });
  close.addEventListener("click", () => { openPanel = false; panel.classList.remove("o"); schedule(); });
  end.addEventListener("click", async () => {
    if (!session) return;
    const res = await fetch(api + "/" + encodeURIComponent(session.storeId) + "/close", {
      method: "POST", headers: headers()
    }).catch(() => null);
    const body = res && res.ok ? await res.json().catch(() => null) : null;
    // The old session is over: only the new one is kept, and nothing of what was said.
    session = body && body.token ? { token: body.token, storeId: body.storeId } : null;
    save();
    etag = null; messages = []; threadOpen = false;
    render();
    schedule();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true; send.disabled = true;
    if (!session && !(await start())) { busy = false; send.disabled = false; return; }
    let res = await fetch(api + "/" + encodeURIComponent(session.storeId) + "/messages", {
      method: "POST", headers: headers(), body: JSON.stringify({ text: text.slice(0, MAX) })
    }).catch(() => null);
    if (res && res.status === 401 && (await start())) {
      res = await fetch(api + "/" + encodeURIComponent(session.storeId) + "/messages", {
        method: "POST", headers: headers(), body: JSON.stringify({ text: text.slice(0, MAX) })
      }).catch(() => null);
    }
    busy = false; send.disabled = false;
    if (res && res.ok) {
      input.value = "";
      messages = messages.concat([await res.json()]);
      threadOpen = true;
      render();
      etag = null;
      schedule();
    } else {
      const n = document.createElement("div");
      n.className = "n";
      n.textContent = res && res.status === 429 ? "Even geduld: je stuurt veel berichten achter elkaar." : "Versturen lukte niet. Probeer het zo nog eens.";
      list.append(n);
    }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });

  // The bubble only once the store's chat answers: a chat switched off, or not this storefront's, shows nothing.
  const had = !!session;
  const mount = () => document.body.appendChild(host);
  host.style.setProperty("--c", "#1f2937");
  start().then((ok) => {
    if (!ok) return;
    if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
    if (had) poll();
  });
})();
`
