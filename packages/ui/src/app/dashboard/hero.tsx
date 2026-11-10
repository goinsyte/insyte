import { currentUserByPersona } from "../../data-source";
import { SCENARIO } from "../../data-source";
import { useWorkspace } from "../stores/workspace-store";
import { HeroView } from "./hero-view";

/** The design app's hero: the admin persona, and the briefs counted from its workspace store. */
export function Hero({ needsYou }: { needsYou: number }) {
	const chargebacks = useWorkspace((s) => s.chargebacks);
	const orders = useWorkspace((s) => s.orders);
	const tickets = useWorkspace((s) => s.tickets);
	const evidence = chargebacks.filter((c) => c.status === "open" || c.status === "awaiting_evidence").length;
	const delayed = orders.filter((o) => o.tags.includes("at_risk") && o.status !== "cancelled" && o.status !== "refunded").length;
	const urgent = tickets.filter((t) => t.priority === "high" && t.status !== "done").length;
	return <HeroView name={currentUserByPersona.admin.name} needsYou={needsYou} evidence={evidence} delayed={delayed} urgent={urgent} firstDay={SCENARIO === "empty"} />;
}
