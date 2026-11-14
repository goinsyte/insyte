import { Check } from "../../icons";
import { AgentSuggestion } from "../ask/agent-demo";
import { RecordAgentRows } from "../ask/agent-parts";
import { RESOLUTION_LABEL } from "../lib/returns";
import { useReturns } from "../stores/returns-store";
import type { ReturnView } from "./source";

const day = (d: Date | string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" }).format(typeof d === "string" ? new Date(d) : d);

/**
 * At Eerst vragen, the agent's approval of a return that fits the rules, as a plate on top of its page; and the
 * agents' rows in its history. The design app's: the console has no agents yet.
 */
export function ReturnProposal({ view }: { view: ReturnView }) {
	const { record: r, window: win, rule, earlier } = view;
	return (
		<AgentSuggestion
			id={`approve:${r.id}`}
			action="ApproveReturn"
			level={2}
			proposal={{
				title: `Goedkeuren en ${r.requested === "exchange" && r.exchangeTo ? `ruilen naar ${r.exchangeTo}` : RESOLUTION_LABEL[r.requested].toLowerCase()}`,
				body: `${r.customerName} stuurt ${r.items.map((i) => `${i.qty}× ${i.title} (${i.variantTitle})`).join(", ")} terug: ${view.reasonLabel.toLowerCase()}. Alles past binnen je regels.`,
				confidence: earlier === 0 ? 93 : 81,
				why: `Binnen de termijn (dag ${win.daysSince} van ${win.days}), het artikel is retourneerbaar en ${earlier === 0 ? "dit is de eerste retour van deze klant" : `deze klant deed eerder ${earlier} ${earlier === 1 ? "retour" : "retouren"}`}.`,
				fileLabel: "Goedkeuren",
				action: { kind: "open", to: `/returns/${r.id}` },
			}}
			evidence={
				<ul className="flex flex-col gap-1 text-mesh-ink text-sm">
					<li className="flex items-center gap-2"><Check className="size-3.5 text-mesh-ink-2" strokeWidth={2} />Binnen de termijn: bezorgd {win.daysSince} {win.daysSince === 1 ? "dag" : "dagen"} geleden</li>
					<li className="flex items-center gap-2"><Check className="size-3.5 text-mesh-ink-2" strokeWidth={2} />{rule ? `Regel: ${rule.note}` : "Geen uitzondering op dit artikel"}</li>
					<li className="flex items-center gap-2"><Check className="size-3.5 text-mesh-ink-2" strokeWidth={2} />{earlier === 0 ? "Eerste retour van deze klant" : `${earlier} eerdere ${earlier === 1 ? "retour" : "retouren"}`}</li>
				</ul>
			}
			draft={{
				sentence: `${r.number} goedgekeurd: ${r.requested === "exchange" && r.exchangeTo ? `ruilen naar ${r.exchangeTo}` : RESOLUTION_LABEL[r.requested].toLowerCase()}`,
				record: { kind: "return", label: r.number, to: `/returns/${r.id}`, id: r.id },
				trigger: "Retourportaal",
				sources: [
					{ kind: "order", title: r.orderNumber, detail: `Bezorgd ${day(r.deliveredAt)}`, to: `/orders/${r.orderId}` },
					{ kind: "policy", title: "Retourinstellingen", detail: `Termijn ${win.days} dagen`, to: "/settings/returns" },
				],
				reason: "Binnen de termijn, retourneerbaar en zonder eerdere retouren.",
				compensation: "Terugzetten naar Te beoordelen",
			}}
			perform={() => {
				useReturns.getState().approve([r.id], "Insyte");
				return { effect: { kind: "return.status", returnId: r.id, from: "review", to: "awaiting_parcel" }, before: "Te beoordelen", after: "Wacht op pakket" };
			}}
		/>
	);
}

export function ReturnAgentRows({ id }: { id: string }) {
	return <RecordAgentRows kind="return" id={id} />;
}
