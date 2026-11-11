import { useMemo } from "react";
import { pulse } from "../lib/home/pulse";
import { useHome } from "../stores/home-store";
import { useWorkspace } from "../stores/workspace-store";

import { PulseBand } from "./pulse-band";
/**
 * The pulse: six live figures on one white band above the board, each with the shape of its window
 * and the change on the window before, each the door to the screen that explains it.
 *
 * It is one band and not six tiles on purpose: a row of identical cards is the KPI-strip the console
 * left behind, where every number shouts as loud as the next. Here the figures sit in one line the eye
 * runs along, like a ticker, and the board below is where anything is worked. The figures count up
 * once when the home opens and then only move when the workspace does.
 */
export function Pulse() {
	const range = useHome((s) => s.range);
	const currency = useHome((s) => s.currency);
	const tickets = useWorkspace((s) => s.tickets);
	const chargebacks = useWorkspace((s) => s.chargebacks);
	const figures = useMemo(() => pulse(range, currency, { tickets, chargebacks }), [range, currency, tickets, chargebacks]);
	return <PulseBand figures={figures} />;
}
