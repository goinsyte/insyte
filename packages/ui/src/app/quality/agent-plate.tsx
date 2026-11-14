import { AgentSuggestion } from "../ask/agent-demo";
import { RecentAgentRow } from "../ask/agent-parts";
import { PHASE_LABEL, shouldWatch } from "../lib/quality";
import { pct } from "../lib/returns";
import type { Product } from "../lib/types/domain";
import { useQuality } from "../stores/quality-store";
import type { QualityPicture } from "./source";

/**
 * Over the threshold, the agent's proposal to ask the supplier for a batch check and watch the product; otherwise its
 * last check request on this product. The design app's: the console has no agents yet.
 */
export function QualityAgents({ product, picture: q }: { product: Product; picture: QualityPicture }) {
	const supplier = q.supplier;
	if (!shouldWatch(q.rate, q.threshold, q.phase) || !supplier) {
		return <RecentAgentRow action="RequestQualityCheck" recordId={product.id} within={24 * 60 * 60_000} />;
	}
	return (
		<AgentSuggestion
			id={`watch:${product.id}:${q.complaints.length}`}
			action="RequestQualityCheck"
			level={2}
			proposal={{
				title: `Batchcontrole vragen bij ${supplier.name} en ${product.title} onder toezicht zetten`,
				body: `${q.complaints.length} klachten op ${q.sold} verkochte stuks in 90 dagen: ${pct(q.rate)}, boven je drempel van ${pct(q.threshold)}. De meeste gaan over dezelfde plek.`,
				confidence: 86,
				why: "Klachten uit retouren en berichten, gemeten tegen de verkopen van 90 dagen.",
				fileLabel: "Controle aanvragen",
				action: { kind: "open", to: `/products/${product.id}` },
			}}
			evidence={
				<ul className="flex flex-col gap-1 text-mesh-ink text-sm">
					{q.complaints.slice(0, 3).map((cm) => (
						<li key={`${cm.at}-${cm.text}`} className="truncate">“{cm.text}”</li>
					))}
				</ul>
			}
			draft={{
				sentence: `Batchcontrole gevraagd bij ${supplier.name} voor ${product.title}`,
				record: { kind: "product", label: product.title, to: `/products/${product.id}`, search: { tab: "quality" }, id: product.id },
				trigger: "Klachtpercentage boven de drempel",
				sources: q.complaints.slice(0, 3).map((cm) => ({ kind: cm.returnId ? ("return" as const) : ("customer" as const), title: cm.customer ?? "Klant", detail: cm.text })),
				reason: `${pct(q.rate)} klachten, drempel ${pct(q.threshold)}.`,
			}}
			perform={() => {
				useQuality.getState().request({ productId: product.id, supplierId: supplier.id, kind: "batch", variants: [], deliver: ["photos", "batch", "video"], due: new Date(Date.now() + 4 * 86_400_000).toISOString(), requestedBy: "Insyte", note: `Batchcontrole na ${q.complaints.length} klachten: foto's van de naden en het batchnummer.` });
				useQuality.getState().setPhase(product.id, "watch");
				return { before: PHASE_LABEL[q.phase], after: "Onder toezicht, controle aangevraagd" };
			}}
		/>
	);
}
