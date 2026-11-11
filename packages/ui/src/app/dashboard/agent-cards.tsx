import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { pastDeadline } from "../lib/returns";
import { SCENARIO } from "../../data-source";
import { AGENT_TODAY, useCustomerAgent } from "../stores/customer-agent-store";
import { useInbox } from "../stores/inbox-store";
import { useReturns } from "../stores/returns-store";

import { ReturnsView } from "./card-views";
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
			<Link to={"/inbox" as string} search={{ view: "handed_over" } as never} className="mx-2 flex h-8 items-center justify-between rounded-md bg-paper/70 px-2.5 text-sm hover:bg-paper">
				<span className="text-ink">Wacht op een collega</span>
				<span className="font-medium text-ink tabular-nums">{handed}</span>
			</Link>
		</div>
	);
}

export function ReturnsCard() {
	const records = useReturns((s) => s.records);
	const now = Date.now();
	const open = useMemo(
		() =>
			records
				.flatMap((r) => (r.status === "review" || r.status === "ready" ? [{ ...r, status: r.status }] : []))
				.slice(0, 5)
				.map((r) => ({ id: r.id, number: r.number, customerName: r.customerName, status: r.status, late: pastDeadline(r.status, r.deadline, now) })),
		[records, now],
	);
	return <ReturnsView rows={open} />;
}
