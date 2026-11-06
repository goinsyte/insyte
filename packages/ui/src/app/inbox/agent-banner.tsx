import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkle, UserPlus } from "../../icons";
import { AgentSuggestion, useMyName } from "../ask/agent-parts";
import { InsyteMark } from "../ask/parts";
import { ME } from "../lib/assignees";
import { formatCurrency } from "../lib/format";
import { undoable } from "../lib/undo";
import { type ThreadState, useInbox } from "../stores/inbox-store";
import { useWorkspace } from "../stores/workspace-store";

/**
 * What the customer agent did on a chat (PLAN 28, ADR-0027 "handover is a first-class result"). A
 * handover is a band at the head of the letter: why, the summary it left, and Overnemen or Teruggeven
 * aan Insyte. A conversation it handled is one quiet line. When the shopper asked for money, the
 * agent's refund is a plate — Eerst vragen, locked — that asks again before it is filed.
 */
export function AgentBanner({ thread }: { thread: ThreadState }) {
	const me = useMyName();
	const update = useInbox((s) => s.update);
	const order = useWorkspace((s) => (thread.orderRef ? s.orders.find((o) => o.number === thread.orderRef) : undefined));
	const a = thread.agent;
	if (!a) return null;

	if (a.state === "handled") {
		return (
			<p className="mb-2 flex items-start gap-2 rounded-lg bg-mist px-3 py-2 text-ink-2 text-sm">
				<InsyteMark size={18} />
				<span>
					<span className="font-medium text-ink">Door Insyte afgehandeld.</span> {a.summary}
				</span>
			</p>
		);
	}

	const taken = a.state === "handed_over" && thread.assignee !== undefined;
	const takeOver = () => {
		const before = { assignee: thread.assignee, agent: a };
		update(thread.id, { assignee: ME, agent: { ...a, state: "handed_over" } });
		undoable("Jij hebt het gesprek overgenomen", () => update(thread.id, before), "Insyte antwoordt niet meer tot je het teruggeeft.");
	};
	const giveBack = () => {
		const before = { assignee: thread.assignee, agent: a };
		update(thread.id, { assignee: undefined, agent: { ...a, state: "active", at: new Date().toISOString() } });
		undoable("Teruggegeven aan Insyte", () => update(thread.id, before), "Insyte antwoordt weer op nieuwe berichten.");
	};
	const refund = order && /terugbetal|geld terug/i.test(`${a.reason ?? ""} ${a.summary ?? ""}`);
	const line = order?.line_items.find((l) => l.product_id === "prod_2013") ?? order?.line_items[0];
	const amount = line ? line.unit_price : 0;

	return (
		<div className="mb-3 flex flex-col gap-3">
			<section aria-label="Overdracht" className="flex flex-col gap-2 rounded-lg bg-arc-tint px-4 py-3">
				<p className="flex items-start gap-2 text-ink text-sm">
					<InsyteMark size={18} />
					<span>
						{a.state === "active" ? (
							<span className="font-medium">Insyte voert dit gesprek weer.</span>
						) : (
							<>
								<span className="font-medium">Insyte heeft dit overgedragen:</span> {a.reason?.toLowerCase()}
							</>
						)}
					</span>
				</p>
				{a.summary ? <p className="pl-[26px] text-ink-2 text-sm leading-relaxed">{a.summary}</p> : null}
				<div className="flex flex-wrap gap-2 pl-[26px]">
					{a.state === "active" || !taken ? (
						<button type="button" onClick={takeOver} className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2">
							<UserPlus className="size-3.5" strokeWidth={1.75} />
							Overnemen
						</button>
					) : (
						<span className="flex h-8 items-center text-ink-2 text-sm">Jij hebt het overgenomen, {me.split(" ")[0]}.</span>
					)}
					{a.state !== "active" ? (
						<button type="button" onClick={giveBack} className="flex h-8 items-center gap-1.5 rounded-md bg-paper px-3 font-medium text-ink text-sm hover:bg-paper/80">
							<Sparkle className="size-3.5" strokeWidth={1.75} />
							Teruggeven aan Insyte
						</button>
					) : null}
				</div>
			</section>
			{refund && order && line && a.state !== "active" ? (
				<AgentSuggestion
					id={`refund:${thread.id}`}
					action="RefundOrder"
					level={2}
					proposal={{
						title: `${formatCurrency(amount, order.currency)} terugbetalen voor ${order.number}`,
						body: `${line.title} voor ${order.customer_name}. Buiten je regels: bezorgd 27 dagen geleden en een sale-artikel. Een goodwill-terugbetaling is aan jou.`,
						confidence: 62,
						why: "De klant vroeg in de chat om geld terug. Insyte belooft nooit geld; het legt het aan jou voor.",
						fileLabel: "Terugbetalen",
						action: { kind: "open", to: `/orders/${order.id}` },
					}}
					confirmFirst={{
						title: `${formatCurrency(amount, order.currency)} terugbetalen aan ${order.customer_name}?`,
						description: `Het geld gaat terug op de betaalmethode van ${order.number}. Dit kan niet worden teruggedraaid.`,
						confirmLabel: "Terugbetalen",
					}}
					draft={{
						sentence: `${formatCurrency(amount, order.currency)} terugbetaald voor ${order.number}`,
						record: { kind: "order", label: order.number, to: `/orders/${order.id}`, id: order.id },
						trigger: "Websitechat op Northwind EU",
						sources: [{ kind: "thread", title: `Websitechat · ${order.customer_name}`, detail: "“Ik wil mijn geld terug”" }, { kind: "order", title: order.number, detail: line.title, to: `/orders/${order.id}` }],
						reason: "Goodwill buiten de retourregels, na goedkeuring.",
					}}
					perform={() => {
						useWorkspace.getState().addOrderNote(order.id, `${formatCurrency(amount, order.currency)} terugbetaald (goodwill) na een overdracht in de websitechat`);
						return { after: "Terugbetaald" };
					}}
				/>
			) : null}
			<span className="flex items-center gap-1 text-ink-3 text-xs">
				<ArrowRight className="size-3" strokeWidth={2} />
				<Link to="/ask/activity" className="text-arc-ink hover:underline">
					Wat Insyte las en waarom
				</Link>
			</span>
		</div>
	);
}
