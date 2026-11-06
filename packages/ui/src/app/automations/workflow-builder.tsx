import {
	type CollisionDetection,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { VARIANTS_BY_ID, type WorkflowNode } from "./node-types";
import { parseSlot, WorkflowCanvas } from "./workflow-canvas";
import { WorkflowInspector } from "./workflow-inspector";
import { NodeCard } from "./workflow-node-card";
import { PalettePreview, WorkflowPalette } from "./workflow-palette";
import { type Place, placeOf, runStore, useWorkflow, workflowStore } from "./workflow-store";

type ActiveDrag = { kind: "palette"; variantId: string } | { kind: "node"; nodeId: string } | null;

const collision: CollisionDetection = (args) => {
	const pointer = pointerWithin(args);
	return pointer.length > 0 ? pointer : rectIntersection(args);
};

/**
 * The Workflow tab: the steps on the left, the canvas in the middle, and a step's settings on the
 * right once one is picked. Below `lg` the palette and the settings stand down and the canvas takes
 * the width: a flow is still readable on a phone, but nobody builds one there.
 */
export function WorkflowBuilder({ automationId }: { automationId: string }) {
	const workflow = useWorkflow(automationId);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [active, setActive] = useState<ActiveDrag>(null);
	const [collapsed, setCollapsed] = useState(false);
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
	const nodes = workflow?.nodes;

	// An edit clears the red a failed test left on a step.
	useEffect(() => {
		if (!nodes) return;
		const r = runStore.get();
		if (r?.automationId === automationId && r.failedId && r.nodeId === null) runStore.set(null);
	}, [nodes, automationId]);

	if (!workflow) return null;

	function add(variantId: string, place: Place = { index: workflow?.nodes.length ?? 0 }) {
		const v = VARIANTS_BY_ID[variantId];
		if (!v) return;
		if (v.kind === "branch" && place.lane) {
			toast("Een ja/nee-splitsing kan alleen in de hoofdlijn", { description: "Zet hem boven of onder de splitsing die er al staat." });
			return;
		}
		const n = workflowStore.insertAt(automationId, variantId, place);
		if (!n) return;
		setSelectedId(n.id);
		if (v.kind === "trigger") toast(`Trigger is nu ${v.label}`);
	}

	function onDragStart(e: DragStartEvent) {
		const d = e.active.data.current as { kind?: string; variantId?: string; nodeId?: string } | undefined;
		if (d?.kind === "palette" && d.variantId) setActive({ kind: "palette", variantId: d.variantId });
		else if (d?.kind === "node" && d.nodeId) setActive({ kind: "node", nodeId: d.nodeId });
	}

	function onDragEnd(e: DragEndEvent) {
		const drag = active;
		setActive(null);
		const place = e.over ? parseSlot(String(e.over.id)) : null;
		if (!drag || !place) return;
		if (drag.kind === "palette") return add(drag.variantId, place);
		const n = workflow ? placeOf(workflow.nodes, drag.nodeId) : null;
		const moving = workflow?.nodes.find((x) => x.id === drag.nodeId);
		if (moving?.branches && place.lane) {
			toast("Een ja/nee-splitsing kan alleen in de hoofdlijn");
			return;
		}
		if (n) workflowStore.moveTo(automationId, drag.nodeId, place);
	}

	const selected = selectedId ? findNode(workflow.nodes, selectedId) : null;
	const dragging = active?.kind === "node" ? findNode(workflow.nodes, active.nodeId) : null;

	return (
		<DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
			<div className="flex min-h-0 flex-1 overflow-hidden">
				<div className="hidden lg:flex">
					<WorkflowPalette collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} onAdd={(v) => add(v)} />
				</div>
				<WorkflowCanvas automationId={automationId} nodes={workflow.nodes} settings={workflow.settings} selectedId={selectedId} onSelect={setSelectedId} />
				{selected ? (
					<div className="hidden lg:flex">
						<WorkflowInspector
							key={selected.id}
							automationId={automationId}
							node={selected}
							settings={workflow.settings}
							onClose={() => setSelectedId(null)}
						/>
					</div>
				) : null}
			</div>
			<DragOverlay dropAnimation={null}>
				{active?.kind === "palette" ? <PalettePreview variantId={active.variantId} /> : dragging ? <NodeCard node={dragging} preview /> : null}
			</DragOverlay>
		</DndContext>
	);
}

function findNode(nodes: ReadonlyArray<WorkflowNode>, id: string): WorkflowNode | null {
	for (const n of nodes) {
		if (n.id === id) return n;
		const inLane = n.branches ? [...n.branches.yes, ...n.branches.no].find((m) => m.id === id) : undefined;
		if (inLane) return inLane;
	}
	return null;
}
