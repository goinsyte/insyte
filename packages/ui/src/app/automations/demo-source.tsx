import { type ReactNode, useMemo } from "react";
import { members } from "../../data-source";
import { useCustomers, useProducts } from "../hooks/use-operator-data";
import { type AutomationTemplate, TEMPLATES } from "../lib/automation-templates";
import { undoable } from "../lib/undo";
import { useGate } from "../stores/access-store";
import { useWorkspace } from "../stores/workspace-store";
import { recommendations } from "./library";
import { newNodeId, VARIANTS_BY_ID } from "./node-types";
import { type AutomationCommands, type AutomationsSource, AutomationsSourceProvider } from "./source";
import { draftFromPrompt, rerun, simulateTest, useWorkflow, useWorkflows, workflowStore } from "./workflow-store";

/*
 * The automations screens over the design app's workflow store, as they were before the seam (`source.tsx`): its
 * seeded flows and runs, the test that walks a sample, the scripted AI line, and the store's own changes with the
 * design's toasts. Recommendations read the workspace store's records.
 */

/** A saved draft made from a template's steps; nothing runs until it is turned on. */
export function draftFromTemplate(t: AutomationTemplate): string {
	const id = workflowStore.create({
		name: t.name,
		nodes: t.steps.map((s) => ({
			id: newNodeId(),
			variantId: s.variantId,
			config: { ...(VARIANTS_BY_ID[s.variantId]?.defaultConfig ?? {}), summary: s.summary },
		})),
	});
	workflowStore.updateMeta(id, { description: t.description });
	workflowStore.save(id);
	return id;
}

const commands: AutomationCommands = {
	create: async (input = {}) => {
		const template = input.templateId === undefined ? undefined : TEMPLATES.find((t) => t.id === input.templateId);
		if (template) return draftFromTemplate(template);
		return workflowStore.create({ ...(input.name === undefined ? {} : { name: input.name }), ...(input.nodes === undefined ? {} : { nodes: input.nodes }) });
	},
	publish: async (id, note, said) => {
		const undo = workflowStore.publish(id, note);
		if (undo) undoable(said.label, undo, said.detail);
		return true;
	},
	setStatus: async (id, status, said) => {
		const before = workflowStore.getWorkflow(id)?.status;
		workflowStore.setStatus(id, status);
		if (before) undoable(said.label, () => workflowStore.setStatus(id, before), said.detail);
	},
	duplicate: async (id) => workflowStore.duplicate(id),
	remove: async (id, said) => {
		const restore = workflowStore.remove(id);
		if (restore) undoable(said.label, restore, said.detail);
	},
	updateSettings: async (id, patch, said) => {
		const before = workflowStore.getWorkflow(id)?.settings;
		workflowStore.updateSettings(id, patch);
		if (said && before) undoable(said.label, () => workflowStore.updateSettings(id, before), said.detail);
	},
};

const PEOPLE = members.map((m) => ({ value: m.name, label: m.name }));

export function DemoAutomationsSource({ children }: { children: ReactNode }) {
	const workflows = useWorkflows();
	const orders = useWorkspace((s) => s.orders);
	const { data: products } = useProducts();
	const { data: customers } = useCustomers();
	const chargebacks = useWorkspace((s) => s.chargebacks);
	const tickets = useWorkspace((s) => s.tickets);
	const publish = useGate("automations.publish");
	const manage = useGate("automations", 3);
	const recommended = useMemo(
		() => recommendations({ orders, products, customers, chargebacks, tickets }, workflows),
		[orders, products, customers, chargebacks, tickets, workflows],
	);
	const source = useMemo<AutomationsSource>(
		() => ({
			workflows,
			useWorkflow,
			editor: workflowStore,
			commands,
			recommended,
			people: PEOPLE,
			test: simulateTest,
			rerun,
			draftFromPrompt,
			runs: true,
			gates: { publish, manage },
		}),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- a gate is a fresh object each render: its contents are what change
		[workflows, recommended, publish.ok, publish.reason, manage.ok, manage.reason],
	);
	return <AutomationsSourceProvider value={source}>{children}</AutomationsSourceProvider>;
}
