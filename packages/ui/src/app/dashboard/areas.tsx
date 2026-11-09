import { RotateCcw, Box, ChartLine, CornerDownLeft, Database, type IconComponent, MessagesSquare, ShoppingBag, Ticket, Truck, Workflow } from "../../icons";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Glyph } from "../common/glyph";
import { useHeardNotes } from "../notifications/heard";
import { supplierFollowUps } from "../lib/home/day";
import { pulse } from "../lib/home/pulse";
import { automations } from "../../data-source";
import { conversations } from "../../data-source";
import { products } from "../../data-source";
import { suppliers } from "../../data-source";
import { dayGroup } from "../lib/notifications";
import { SCENARIO } from "../../data-source";
import { cn } from "../lib/utils";
import { useChatStore } from "../stores/chat-store";
import { useHome } from "../stores/home-store";
import { useWorkspace } from "../stores/workspace-store";
import { useQueueRows } from "../orders/forwarding-demo";
import { overdue } from "../lib/forwarding";
import { pastDeadline } from "../lib/returns";
import { useReturns } from "../stores/returns-store";

/**
 * "Overal in Insyte": every area of the console as one small tile with one live number and the one
 * thing worth knowing about it — "3 vertraagd", "2 wachten op bewijs" — like ClickUp's folders row,
 * but each tile is a reading of the workspace rather than a link with a name on it. The state is a
 * signal ink and a word, never the colour alone.
 */

type Tile = { to: string; label: string; icon: IconComponent; value: string; state: string; tone: "red" | "amber" | "green" | "ink" };

const TONE: Record<Tile["tone"], string> = {
	red: "text-signal-red",
	amber: "text-signal-amber",
	green: "text-signal-green",
	ink: "text-ink-3",
};
const DOT: Record<Tile["tone"], string> = {
	red: "bg-signal-red",
	amber: "bg-signal-amber",
	green: "bg-signal-green",
	ink: "bg-ink-4",
};

export function Areas() {
	const orders = useWorkspace((s) => s.orders);
	const tickets = useWorkspace((s) => s.tickets);
	const chargebacks = useWorkspace((s) => s.chargebacks);
	const integrations = useWorkspace((s) => s.integrations);
	const edits = useWorkspace((s) => s.productEdits);
	const muted = useChatStore((s) => s.muted);
	const created = useChatStore((s) => s.created);
	const range = useHome((s) => s.range);
	const currency = useHome((s) => s.currency);
	const notes = useHeardNotes("admin");
	const first = SCENARIO === "empty";
	const returns = useReturns((s) => s.records);
	const openReturns = returns.filter((r) => r.status !== "resolved" && r.status !== "rejected").length;
	const reviewReturns = returns.filter((r) => r.status === "review").length;
	const lateReturns = returns.filter((r) => pastDeadline(r.status, r.deadline, Date.now())).length;
	const legs = useQueueRows(Math.floor(Date.now() / 60_000) * 60_000);
	const toForward = legs.filter((l) => l.effective === "to_forward").length;
	const waitingLong = legs.filter((l) => overdue(l.effective, l.since, Date.now())).length;

	const tiles = useMemo((): Tile[] => {
		const live = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled" && o.status !== "refunded");
		const late = live.filter((o) => o.tags.includes("at_risk")).length;
		const open = tickets.filter((t) => t.status !== "done" && !t.archived_at && !t.deleted_at && !t.spam_at);
		const urgent = open.filter((t) => t.priority === "high").length;
		const chats = [...created, ...conversations].filter((c) => !muted.includes(c.id));
		const unread = chats.reduce((n, c) => n + c.unread_count, 0);
		const evidence = chargebacks.filter((c) => c.status === "open" || c.status === "awaiting_evidence").length;
		const submitted = chargebacks.filter((c) => c.status === "submitted").length;
		const active = products.filter((p) => p.status === "active");
		const low = products.filter((p) => p.variants.some((v) => (edits[p.id]?.variantStock?.[v.id] ?? v.inventory_level) <= 12)).length;
		const slow = supplierFollowUps(orders).length;
		const running = automations.filter((a) => a.status === "active").length;
		const failed = notes.filter((n) => n.event === "automation.failed" && dayGroup(n.at, Date.now()) === "Vandaag").length;
		const revenue = first ? null : pulse(range, currency, { tickets, chargebacks })[0]?.delta;
		const connected = integrations.filter((i) => i.status === "connected").length;
		const attention = integrations.filter((i) => i.status === "action_required").length;

		return [
			{
				to: "/orders",
				label: "Bestellingen",
				icon: ShoppingBag,
				value: String(live.length),
				state: first ? "Komen binnen via Shopify" : [late > 0 ? `${late} vertraagd` : "", toForward > 0 ? `${toForward} te versturen` : "", waitingLong > 0 ? `${waitingLong} wacht >24 u` : ""].filter(Boolean).join(" · ") || "Alles op schema",
				tone: late > 0 || waitingLong > 0 ? "red" : toForward > 0 ? "amber" : first ? "ink" : "green",
			},
			{
				to: "/returns",
				label: "Retouren",
				icon: RotateCcw,
				value: String(openReturns),
				state: first ? "Zet je retourportaal aan" : reviewReturns > 0 ? `${reviewReturns} te beoordelen${lateReturns ? `, ${lateReturns} te laat` : ""}` : "Niets te beoordelen",
				tone: lateReturns > 0 ? "red" : reviewReturns > 0 ? "amber" : "ink",
			},
			{ to: "/tickets", label: "Klantenservice", icon: Ticket, value: String(open.length), state: first ? "Nog geen vragen" : urgent > 0 ? `${urgent} urgent` : "Niets urgent", tone: urgent > 0 ? "amber" : "ink" },
			{ to: "/chats", label: "Chats", icon: MessagesSquare, value: String(unread), state: unread > 0 ? `ongelezen in ${chats.filter((c) => c.unread_count > 0).length} ${chats.filter((c) => c.unread_count > 0).length === 1 ? "gesprek" : "gesprekken"}` : first ? "#algemeen staat klaar" : "Je bent bij", tone: unread > 0 ? "amber" : "ink" },
			{ to: "/chargebacks", label: "Chargebacks", icon: CornerDownLeft, value: String(evidence + submitted), state: evidence > 0 ? `${evidence} ${evidence === 1 ? "wacht" : "wachten"} op bewijs` : first ? "Insyte verzamelt het bewijs" : "Niets open", tone: evidence > 0 ? "amber" : "ink" },
			{ to: "/products", label: "Producten", icon: Box, value: String(active.length), state: first ? "Importeer je catalogus" : low > 0 ? `${low} bijna op` : "Voorraad op peil", tone: low > 0 ? "amber" : "ink" },
			{ to: "/suppliers", label: "Leveranciers", icon: Truck, value: String(suppliers.length), state: first ? "Koppel je eerste" : slow > 0 ? `${slow} met vertraging` : "Iedereen op tijd", tone: slow > 0 ? "red" : "ink" },
			{ to: "/automations", label: "Automatiseringen", icon: Workflow, value: `${running}`, state: first ? "Zet een startflow aan" : failed > 0 ? `${failed} mislukt vandaag` : "Alles draait", tone: failed > 0 ? "red" : first ? "ink" : "green" },
			{ to: "/analytics", label: "Analyse", icon: ChartLine, value: revenue ? revenue.text : "—", state: first ? "Na de eerste week" : "omzet t.o.v. de periode ervoor", tone: revenue?.good === false ? "red" : revenue?.good ? "green" : "ink" },
			{ to: "/data", label: "Data", icon: Database, value: String(connected), state: attention > 0 ? `${attention} ${attention === 1 ? "vraagt" : "vragen"} actie` : "koppelingen actief", tone: attention > 0 ? "amber" : "ink" },
		];
	}, [orders, tickets, chargebacks, integrations, edits, muted, created, range, currency, notes, first, toForward, waitingLong, openReturns, reviewReturns, lateReturns]);

	return (
		<section aria-labelledby="areas-title" className="@container/areas flex flex-col gap-2">
			<h2 id="areas-title" className="px-1 font-medium text-md text-ink">
				Overal in Insyte
			</h2>
			<ul className="grid grid-cols-1 gap-1.5 @md/areas:grid-cols-2 @3xl/areas:grid-cols-3 @[94rem]/areas:grid-cols-5 @[120rem]/areas:grid-cols-10">
				{tiles.map((t) => (
					<li key={t.to + t.label}>
						<Link
							to={t.to}
							className="glyph-host group/area flex h-full items-center gap-3 rounded-xl bg-paper px-3 py-2.5 transition-colors hover:bg-paper/70 @[94rem]/areas:flex-col @[94rem]/areas:items-start @[94rem]/areas:gap-2"
						>
							<span className="flex items-center gap-2 @[94rem]/areas:w-full">
								<Glyph icon={t.icon} tile="mist" size={15} draw={false} />
								<data value={t.value} className="ml-auto hidden font-medium text-lg text-ink tabular-nums @[94rem]/areas:block">
									{t.value}
								</data>
							</span>
							<span className="flex min-w-0 flex-1 flex-col leading-tight @[94rem]/areas:w-full">
								<span className="truncate text-base text-ink">{t.label}</span>
								<span className={cn("flex items-center gap-1.5 truncate text-xs", TONE[t.tone])}>
									<span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[t.tone])} />
									<span className="truncate">{t.state}</span>
								</span>
							</span>
							<data value={t.value} className="shrink-0 font-medium text-lg text-ink tabular-nums @[94rem]/areas:hidden">
								{t.value}
							</data>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
