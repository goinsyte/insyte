import { draftFromTemplate } from "../automations/library";
import { workflowStore } from "../automations/workflow-store";
import { ticketsStore } from "../tickets/tickets-store";
import { TEMPLATES } from "../lib/automation-templates";
import type { ProposalKind } from "../lib/analytics/engine";
import { undoable } from "../lib/undo";
import { useWorkspace } from "../stores/workspace-store";

/**
 * Filing a finding's proposal does the real thing, in the workspace, with Undo: a supplier ticket
 * is opened, a product's ads are paused, an automation draft is made. Nothing is sent and nothing
 * turns on; the operator still sends the ticket and switches the automation on.
 */
export function fileProposal(action: ProposalKind): { message: string; to?: string } {
	const ws = useWorkspace.getState();
	if (action.kind === "supplier-ticket") {
		const ticket = ws.createTicket({
			title: action.subject,
			description: action.body,
			priority: "high",
			status: "intake",
			tags: ["Leveringsketen"],
			source: "insyte",
		});
		undoable(`${ticket.number} geopend voor ${action.supplier}`, () => ticketsStore.remove(ticket.id));
		return { message: `${ticket.number} staat op het ticketbord en wacht tot iemand het verstuurt.`, to: "/tickets" };
	}
	if (action.kind === "pause-ads") {
		const before = ws.productEdits;
		ws.editProducts({ [action.product]: { adsPaused: true } });
		undoable(`Meta-advertenties voor ${action.title} gepauzeerd`, () => useWorkspace.getState().restoreProducts(before));
		return { message: `De advertenties voor ${action.title} zijn gepauzeerd. Organische en Klaviyo-verkopen lopen door.`, to: `/products/${action.product}` };
	}
	const t = TEMPLATES.find((x) => x.id === action.template);
	if (!t) return { message: "Dat sjabloon bestaat niet meer." };
	const id = draftFromTemplate(t);
	undoable(`Concept “${t.name}” opgesteld`, () => workflowStore.remove(id));
	return { message: `“${t.name}” staat als concept bij Automatiseringen. Het draait zodra je het aanzet.`, to: `/automations/${id}` };
}
