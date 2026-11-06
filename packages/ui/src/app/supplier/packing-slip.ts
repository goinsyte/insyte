import type { SupplierOrderRow } from "../hooks/use-supplier-orders";
import { countryName } from "../lib/format-flag";

/**
 * A packing slip, as a file the supplier prints: the brand's name, where it goes, what is in the
 * box. No prices — a packing slip travels with the parcel and the customer reads it.
 */
export function downloadPackingSlips(rows: ReadonlyArray<SupplierOrderRow>, brand: string) {
	const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
	const page = (r: SupplierOrderRow) => {
		const a = r.order.shipping_address;
		const lines = r.lines
			.map((l) => `<tr><td>${l.quantity}×</td><td>${esc(l.title)}${l.variant_title ? ` · ${esc(l.variant_title)}` : ""}</td><td class="sku">${esc(l.variant_id)}</td></tr>`)
			.join("");
		return `<section><header><h1>${esc(brand)}</h1><p>Pakbon · ${esc(r.number)}</p></header>
<div class="to"><strong>${esc(r.order.customer_name)}</strong><br>${esc(a?.line1 ?? "")}<br>${esc(a?.postal_code ?? "")} ${esc(a?.city ?? "")}<br>${esc(countryName(a?.country ?? ""))}</div>
<table><thead><tr><th>Aantal</th><th>Artikel</th><th>SKU</th></tr></thead><tbody>${lines}</tbody></table>
<footer>Vragen over je bestelling? Antwoord op de bevestigingsmail van ${esc(brand)}.</footer></section>`;
	};
	const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Pakbonnen</title><style>
body{font:14px/1.5 system-ui,sans-serif;color:#111;margin:0}section{padding:40px;page-break-after:always}h1{font-size:20px;margin:0}
header p{color:#555;margin:4px 0 24px}.to{margin-bottom:24px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 0;border-bottom:1px solid #ddd}
.sku{color:#666;font-size:12px}footer{margin-top:32px;color:#555;font-size:12px}</style></head><body>${rows.map(page).join("")}<script>window.print()</script></body></html>`;
	const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = rows.length === 1 ? `pakbon-${rows[0]!.number}.html` : `pakbonnen-${rows.length}.html`;
	a.click();
	URL.revokeObjectURL(url);
}
