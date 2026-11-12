import { useDndContext, useDroppable } from "@dnd-kit/core";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/popover";
import { Maximize2, Minus, Plus, Sparkles } from "../../icons";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { VARIANTS_BY_ID, type WorkflowNode, type WorkflowSettings } from "./node-types";
import { missingScope } from "./scopes";
import { CARD_W, NodeCard } from "./workflow-node-card";
import { StepPicker } from "./workflow-palette";
import { type StepIssue, useAutomationsSource } from "./source";
import { type Lane, nameFromNodes, type Place, UNTITLED, useActiveRun } from "./flow-edits";

const EXAMPLES = [
	"Als een bestelling te laat is, mail de klant en maak een ticket aan voor Maya",
	"Als een chargeback binnenkomt, koppel de bestellingen en maak een ticket",
	"Als de voorraad laag is, laat de leverancier het weten en waarschuw het team",
];

type Props = {
	automationId: string;
	nodes: WorkflowNode[];
	settings: WorkflowSettings;
	/** What is wrong per step, where the host says. */
	issues?: ReadonlyMap<string, ReadonlyArray<StepIssue>> | undefined;
	selectedId: string | null;
	onSelect: (id: string | null) => void;
};

export const slotId = (place: Place) => (place.lane ? `slot|${place.lane.branchId}|${place.lane.side}|${place.index}` : `slot|main|${place.index}`);

export function parseSlot(id: string): Place | null {
	const p = id.split("|");
	if (p[0] !== "slot") return null;
	if (p[1] === "main") return { index: Number(p[2]) };
	return { lane: { branchId: p[1], side: p[2] as Lane["side"] }, index: Number(p[3]) };
}

/**
 * The canvas: the flow top to bottom on the dotted ground, steps as compact cards, a + on every
 * connector (drop a step on it, or click it to pick one), and a Ja/nee-splitsing drawn as two lanes
 * that meet again. The AI line at the foot turns a sentence into steps, like a composer; zoom sits bottom left.
 */
export function WorkflowCanvas({ automationId, nodes, settings, issues, selectedId, onSelect }: Props) {
	const { draftFromPrompt, editor } = useAutomationsSource();
	const [zoom, setZoom] = useState(1);
	const scroller = useRef<HTMLDivElement>(null);
	const content = useRef<HTMLDivElement>(null);
	const run = useActiveRun();
	const runningId = run?.automationId === automationId ? run.nodeId : null;
	const failedId = run?.automationId === automationId ? run.failedId : undefined;

	const fit = useCallback(() => {
		const box = scroller.current;
		const el = content.current;
		if (!box || !el) return;
		const r = el.getBoundingClientRect();
		const naturalH = r.height / zoom;
		const naturalW = r.width / zoom;
		const next = Math.min(1, (box.clientHeight - 64 - 80) / naturalH, (box.clientWidth - 96) / naturalW);
		// Fitting never shrinks a flow past legible; a longer one scrolls.
		setZoom(Math.max(0.75, Math.floor(next * 100) / 100));
		box.scrollTo({ top: 0, left: 0 });
	}, [zoom]);

	// The flow opens fitted to the window, once.
	const fitted = useRef(false);
	useLayoutEffect(() => {
		if (fitted.current || nodes.length === 0) return;
		fitted.current = true;
		fit();
	}, [fit, nodes.length]);

	const add = (variantId: string, place: Place) => {
		const n = editor.insertAt(automationId, variantId, place);
		if (n) onSelect(n.id);
	};
	const remove = (id: string) => {
		const undo = editor.removeNode(automationId, id);
		if (selectedId === id) onSelect(null);
		if (undo) undoable("Stap verwijderd", undo);
	};

	const card = (n: WorkflowNode) => (
		<NodeCard
			key={n.id}
			node={n}
			selected={selectedId === n.id}
			running={runningId === n.id}
			failed={failedId === n.id}
			blocked={missingScope(n, settings) !== null}
			issues={issues?.get(n.id)}
			onSelect={() => onSelect(n.id)}
			onRemove={VARIANTS_BY_ID[n.variantId]?.kind === "trigger" ? undefined : () => remove(n.id)}
		/>
	);

	const hasTrigger = VARIANTS_BY_ID[nodes[0]?.variantId ?? ""]?.kind === "trigger";

	return (
		<div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-glacier">
			{draftFromPrompt ? <PromptBar automationId={automationId} draftFromPrompt={draftFromPrompt} onDrafted={(id) => onSelect(id)} /> : null}
			<div ref={scroller} className="bg-dot-grid-ink min-h-0 flex-1 overflow-auto px-12 pt-10 pb-28">
				<div ref={content} className="mx-auto flex w-max min-w-full flex-col items-center" style={{ zoom }}>
					{nodes.length === 0 ? (
						<EmptyCanvas onAdd={(v) => add(v, { index: 0 })} />
					) : (
						<>
							{hasTrigger ? null : <Connector place={{ index: 0 }} onPick={(v) => add(v, { index: 0 })} />}
							{nodes.map((n, i) => (
								<div key={n.id} className="flex flex-col items-center">
									{n.branches ? (
										<BranchBlock branch={n} head={card(n)} card={card} onAdd={add} />
									) : (
										card(n)
									)}
									<Connector place={{ index: i + 1 }} onPick={(v) => add(v, { index: i + 1 })} end={i === nodes.length - 1} />
								</div>
							))}
							<span className="mt-1 rounded-full bg-ink/6 px-2.5 py-1 font-medium text-ink-3 text-xs">Einde</span>
						</>
					)}
				</div>
			</div>

			<div className="panel-raised absolute bottom-4 left-4 z-10 flex items-center gap-0.5 rounded-md bg-paper p-1">
				<ZoomButton label="Uitzoomen" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 100) / 100))}>
					<Minus className="size-3.5" />
				</ZoomButton>
				<button
					type="button"
					onClick={() => setZoom(1)}
					aria-label="Zoom op 100%"
					className="h-7 min-w-12 rounded-md px-1 font-medium text-ink-2 text-xs tabular-nums hover:bg-ink/6"
				>
					{Math.round(zoom * 100)}%
				</button>
				<ZoomButton label="Inzoomen" onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 100) / 100))}>
					<Plus className="size-3.5" />
				</ZoomButton>
				<span className="mx-0.5 h-4 w-px bg-hairline" />
				<ZoomButton label="Passend maken" onClick={fit}>
					<Maximize2 className="size-3.5" />
				</ZoomButton>
			</div>
		</div>
	);
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
		>
			{children}
		</button>
	);
}

/**
 * A connector with a + on it. While a step is dragged, every + is a drop target and lights `arc` as the
 * step passes over it; at rest the + is quiet and a click opens the step picker.
 */
function Connector({
	place,
	onPick,
	end,
	lane,
	label,
}: {
	place: Place;
	onPick: (variantId: string) => void;
	end?: boolean;
	lane?: boolean;
	/** The lane's name, set beside the + on a splitsing's first connector. */
	label?: "yes" | "no";
}) {
	const { setNodeRef, isOver } = useDroppable({ id: slotId(place) });
	const { active } = useDndContext();
	const [open, setOpen] = useState(false);
	return (
		<div ref={setNodeRef} className={cn("relative flex w-16 flex-col items-center", end ? "h-7" : "h-8")}>
			{label ? (
				<span
					className={cn(
						"absolute top-1/2 right-[calc(50%+16px)] -translate-y-1/2 rounded-full px-2 py-0.5 font-medium text-xs",
						label === "yes" ? "bg-signal-green-bg text-signal-green" : "bg-ink/7 text-ink-2",
					)}
				>
					{label === "yes" ? "Ja" : "Nee"}
				</span>
			) : null}
			<span className={cn("w-px flex-1", isOver ? "bg-arc" : "bg-ink/20")} />
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						aria-label="Stap toevoegen"
						className={cn(
							"flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150",
							isOver
								? "size-6 scale-110 bg-arc text-mesh-ink"
								: active
									? "size-6 bg-arc-tint text-arc-ink"
									: "size-5 bg-paper text-ink-3 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_14%,transparent)] hover:bg-abyss hover:text-mesh-ink",
						)}
					>
						<Plus className="size-3" strokeWidth={2.25} />
					</button>
				</PopoverTrigger>
				<PopoverContent side="right" align="start" className="p-0">
					<StepPicker
						inLane={lane}
						onPick={(v) => {
							setOpen(false);
							onPick(v);
						}}
					/>
				</PopoverContent>
			</Popover>
			<span className={cn("w-px flex-1", isOver ? "bg-arc" : "bg-ink/20")} />
		</div>
	);
}

const GAP = 40;

/** A Ja/nee-splitsing: the question, two lanes side by side, and the line where they meet again. */
function BranchBlock({
	branch,
	head,
	card,
	onAdd,
}: {
	branch: WorkflowNode;
	head: React.ReactNode;
	card: (n: WorkflowNode) => React.ReactNode;
	onAdd: (variantId: string, place: Place) => void;
}) {
	const lanes = branch.branches ?? { yes: [], no: [] };
	const half = CARD_W / 2;
	return (
		<div className="flex flex-col items-center">
			{head}
			<span className="h-3 w-px bg-ink/20" />
			<div className="relative flex" style={{ gap: GAP }}>
				<span className="absolute top-0 h-px bg-ink/20" style={{ left: half, right: half }} />
				<span className="absolute bottom-0 h-px bg-ink/20" style={{ left: half, right: half }} />
				{(["yes", "no"] as const).map((side) => {
					const list = lanes[side];
					const lane = { branchId: branch.id, side };
					return (
						<div key={side} className="flex flex-col items-center" style={{ width: CARD_W }}>
							<Connector lane label={side} place={{ lane, index: 0 }} onPick={(v) => onAdd(v, { lane, index: 0 })} />
							{list.length === 0 ? (
								<span className="rounded-md bg-ink/4 px-3 py-2 text-ink-3 text-xs">Niets: de flow gaat hier meteen verder</span>
							) : null}
							{list.map((n, i) => (
								<div key={n.id} className="flex flex-col items-center">
									{card(n)}
									<Connector lane place={{ lane, index: i + 1 }} onPick={(v) => onAdd(v, { lane, index: i + 1 })} />
								</div>
							))}
							<span className="w-px flex-1 bg-ink/20" />
						</div>
					);
				})}
			</div>
		</div>
	);
}

function EmptyCanvas({ onAdd }: { onAdd: (variantId: string) => void }) {
	const { setNodeRef, isOver } = useDroppable({ id: slotId({ index: 0 }) });
	const triggers = ["trigger.order_placed", "trigger.shipping_delay", "trigger.chargeback", "trigger.inventory_low"];
	return (
		<div
			ref={setNodeRef}
			style={{ width: CARD_W + 40 }}
			className={cn("flex flex-col gap-3 rounded-lg bg-paper p-4 transition-colors", isOver && "bg-arc-tint")}
		>
			<div className="flex flex-col gap-1">
				<span className="font-medium text-ink text-sm">Waar begint deze flow?</span>
				<span className="text-ink-3 text-xs leading-[1.5]">Kies een trigger, sleep er een uit Stappen, of beschrijf de flow hierboven.</span>
			</div>
			<div className="grid grid-cols-2 gap-1.5">
				{triggers.map((id) => {
					const v = VARIANTS_BY_ID[id];
					return (
						<button
							key={id}
							type="button"
							onClick={() => onAdd(id)}
							className="flex h-8 items-center gap-2 rounded-md bg-mist px-2 text-left text-ink-2 text-xs hover:bg-arc-tint hover:text-arc-ink"
						>
							<span className="size-1.5 shrink-0 rounded-full bg-signal-green" aria-hidden />
							<span className="truncate">{v?.label}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/**
 * The AI line: one sentence in, the steps out. Scripted from the words (`draftFromPrompt`), so the same
 * sentence lays out the same flow; what was on the canvas comes back with Undo.
 */
function PromptBar({
	automationId,
	draftFromPrompt,
	onDrafted,
}: { automationId: string; draftFromPrompt: (prompt: string) => WorkflowNode[]; onDrafted: (id: string | null) => void }) {
	const { editor } = useAutomationsSource();
	const [text, setText] = useState("");
	const [focused, setFocused] = useState(false);
	const input = useRef<HTMLInputElement>(null);

	function draft(sentence: string) {
		const t = sentence.trim();
		if (!t) return;
		const current = editor.getWorkflow(automationId);
		const before = current?.nodes ?? [];
		const beforeName = current?.name;
		const steps = draftFromPrompt(t);
		editor.replaceNodes(automationId, steps, !current || current.name === UNTITLED ? nameFromNodes(steps) : undefined);
		onDrafted(null);
		setText("");
		input.current?.blur();
		const n = steps.length + steps.reduce((k, s) => k + (s.branches ? s.branches.yes.length + s.branches.no.length : 0), 0);
		if (before.length > 0) undoable(`${n} stappen neergezet`, () => editor.replaceNodes(automationId, before, beforeName), "Wat er stond, komt terug met Ongedaan maken.");
		else toast(`${n} stappen neergezet`, { description: "Klik een stap om hem aan te passen, en publiceer als het klopt." });
	}

	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center pr-4 pl-48">
			<div className="pointer-events-auto relative w-full max-w-[560px]">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						draft(text);
					}}
					className="flex h-10 items-center gap-2 rounded-lg bg-abyss pr-1 pl-2.5 text-mesh-ink shadow-primary"
				>
					<span className="flex h-5 items-center gap-1 rounded-sm bg-mesh-ink/12 px-1.5 font-medium text-xs">
						<Sparkles className="size-3" />
						AI
					</span>
					<input
						ref={input}
						value={text}
						onChange={(e) => setText(e.target.value)}
						onFocus={() => setFocused(true)}
						onBlur={() => setTimeout(() => setFocused(false), 120)}
						placeholder="Beschrijf het en Insyte zet de stappen neer"
						aria-label="Beschrijf de flow"
						className="min-w-0 flex-1 bg-transparent text-mesh-ink text-sm outline-none placeholder:text-mesh-ink-2"
					/>
					<button
						type="submit"
						disabled={text.trim().length === 0}
						className="h-8 shrink-0 rounded-md bg-paper px-3 font-medium text-abyss text-sm transition-colors disabled:bg-mesh-ink/12 disabled:text-mesh-ink-2"
					>
						Opstellen
					</button>
				</form>
				{focused && text.trim().length === 0 ? (
					<ul className="panel-raised absolute inset-x-0 bottom-12 flex flex-col rounded-lg bg-paper p-1">
						<li className="px-2 pt-1 pb-1 text-ink-3 text-xs">Bijvoorbeeld</li>
						{EXAMPLES.map((ex) => (
							<li key={ex}>
								<button
									type="button"
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => draft(ex)}
									className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ink-2 text-sm hover:bg-arc-tint hover:text-arc-ink"
								>
									<Sparkles className="size-3 shrink-0 text-ink-3" />
									{ex}
								</button>
							</li>
						))}
					</ul>
				) : null}
			</div>
		</div>
	);
}
