import type { SupplierOrder } from "./Forwarding.ts"

/*
 * A packing slip (M8.5), as the design draws it for a supplier (`supplier/packing-slip.ts`): the brand, the order, where
 * it goes, what is in the box. No prices, no email or phone: it travels with the parcel and the customer reads it.
 */

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c] ?? c)

const country = (code: string | null) => {
  if (code === null || code === "") return ""
  try {
    return new Intl.DisplayNames(["nl"], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

/** The leg's packing slip as a whole HTML page, ready to print or render. */
export const packingSlipHtml = (brand: string, order: SupplierOrder) => {
  const to = order.ship_to
  const lines = order.lines
    .map((l) =>
      `<tr><td>${l.quantity}×</td><td>${esc(l.title)}${
        l.variant_title ? ` · ${esc(l.variant_title)}` : ""
      }</td><td class="sku">${esc(l.sku ?? "")}</td></tr>`
    )
    .join("")
  const address = [to.name, to.line1, to.line2, [to.postcode, to.city].filter(Boolean).join(" "), country(to.country)]
    .filter((part): part is string => part !== null && part !== "")
    .map((part, i) => (i === 0 ? `<strong>${esc(part)}</strong>` : esc(part)))
    .join("<br>")
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Pakbon ${
    esc(order.order.number)
  }</title><style>
body{font:14px/1.5 system-ui,sans-serif;color:#111;margin:0}section{padding:40px;page-break-after:always}h1{font-size:20px;margin:0}
header p{color:#555;margin:4px 0 24px}.to{margin-bottom:24px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 0;border-bottom:1px solid #ddd}
.sku{color:#666;font-size:12px}footer{margin-top:32px;color:#555;font-size:12px}</style></head><body><section><header><h1>${
    esc(brand)
  }</h1><p>Pakbon · ${esc(order.order.number)}</p></header>
<div class="to">${address}</div>
<table><thead><tr><th>Aantal</th><th>Artikel</th><th>SKU</th></tr></thead><tbody>${lines}</tbody></table>
<footer>Vragen over je bestelling? Antwoord op de bevestigingsmail van ${esc(brand)}.</footer></section></body></html>`
}
