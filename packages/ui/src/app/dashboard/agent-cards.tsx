import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { pastDeadline, STATUS_LABEL } from "../lib/returns";
import { SCENARIO } from "../../data-source";
import { AGENT_TODAY, useCustomerAgent } from "../stores/customer-agent-store";
import { useInbox } from "../stores/inbox-store";
import { useReturns } from "../stores/returns-store";
import { ReturnStatusBadge } from "../returns/parts";

/*
 * Two cards for Kaart toevoegen (PLAN 28, PLAN 25): the customer agent's day, and the returns waiting
 * on the team. Each reads the same store as its own page.
 */

const Quiet = ({ children }: { children: React.ReactNode }) => <p className="px-2 py-1 text-ink-3 text-sm">{children}</p>;

export function CustomerAgentCard() {
	const on = useCustomerAgent((s) => s.settings.on);
	const threads = useInbox((s) => s.threads);
	const handed = threads.filter((t) => t.agent?.state === "handed_over" && !t.assignee).length;
	if (!on || SCENARIO === "empty") return <Quiet>De klantagent staat uit.</Quiet>;
	const rows: ReadonlyArray<readonly [string, string | number]> = [
		["Gesprekken", AGENT_TODAY.conversations],
		["Zelf afgehandeld", AGENT_TODAY.handled],
		["Overgedragen", AGENT_TODAY.handedOver],
		["Eerste reactie", `${AGENT_TODAY.avgSeconds} s`],
	];
	return (
		<div className="flex flex-col gap-2">
			<dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-2">
				{rows.map(([k, v]) => (
					<div key={k} className="flex flex-col">
						<dt className="text-ink-3 text-xs">{k}</dt>
						<dd className="font-medium text-ink text-lg tabular-nums">{v}</dd>
					</div>
				))}
			</dl>
			<Link to="/inbox" search={{ view: "handed_over" } as never} className="mx-2 flex h-8 items-center justify-between rounded-md bg-paper/70 px-2.5 text-sm hover:bg-paper">
				<span className="text-ink">Wacht op een collega</span>
				<span className="font-medium text-ink tabular-nums">{handed}</span>
			</Link>
		</div>
	);
}

export function ReturnsCard() {
	const records = useReturns((s) => s.records);
	const now = Date.now();
	const open = useMemo(() => records.filter((r) => r.status === "review" || r.status === "ready").slice(0, 5), [records]);
	if (open.length === 0) return <Quiet>Niets te beoordelen of af te handelen.</Quiet>;
	return (
		<ul className="flex flex-col">
			{open.map((r) => (
				<li key={r.id}>
					<Link to="/returns/$returnId" params={{ returnId: r.id }} className="flex h-9 min-w-0 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-ink/[0.045]" title={STATUS_LABEL[r.status]}>
						<span className="font-medium text-ink text-sm tabular-nums">{r.number}</span>
						<span className="min-w-0 flex-1 truncate text-ink-2 text-sm">{r.customerName}</span>
						<ReturnStatusBadge status={r.status} late={pastDeadline(r.status, r.deadline, now)} />
					</Link>
				</li>
			))}
		</ul>
	);
}
