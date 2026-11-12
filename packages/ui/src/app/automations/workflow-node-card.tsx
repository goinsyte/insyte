import { useDraggable } from "@dnd-kit/core";
import { AlertTriangle, MoreHorizontal, Trash2 } from "../../icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/dropdown-menu";
import { cn } from "../lib/utils";
import type { StepIssue } from "./source";
import { kindLabel, VARIANTS_BY_ID, type WorkflowNode } from "./node-types";
import { StepTile } from "./step-tile";
import { summaryOf, titleOf, VarText } from "./summary";

export const CARD_W = 300;

type Props = {
	node: WorkflowNode;
	selected?: boolean;
	running?: boolean;
	failed?: boolean;
	/** The flow does not hold the right this step needs. */
	blocked?: boolean;
	/** What the host says is wrong with it; the first error, else the first warning, is shown on the strip. */
	issues?: ReadonlyArray<StepIssue> | undefined;
	onSelect?: () => void;
	onRemove?: () => void;
	preview?: boolean;
};

/**
 * One step on the canvas: a 28px strip with its mark and what kind of step it is, then its title and
 * one line read off its settings, fields as chips. 300px wide and about 72px tall, so a six-step flow
 * with a splitsing fits a laptop screen without scrolling. The strip is tinted by kind: a trigger
 * green, an AI step dark (the product proposing), everything else `mist`.
 */
export function NodeCard({ node, selected, running, failed, blocked, issues, onSelect, onRemove, preview }: Props) {
	const v = VARIANTS_BY_ID[node.variantId];
	const drag = useDraggable({ id: `node:${node.id}`, data: { kind: "node", nodeId: node.id }, disabled: preview || v?.kind === "trigger" });
	if (!v) return null;
	const issue = issues?.find((i) => i.severity === "error" && i.code !== "scope_off") ?? issues?.find((i) => i.severity === "warning");
	const strip = failed
		? "bg-signal-red-bg text-signal-red"
		: v.kind === "trigger"
			? "bg-signal-green-bg text-signal-green"
			: v.ai
				? "bg-abyss text-mesh-ink"
				: "bg-mist text-ink-3";

	return (
		// biome-ignore lint/a11y/useSemanticElements: holds a menu button, so it cannot be a <button>
		<div
			ref={drag.setNodeRef}
			{...(preview ? {} : drag.listeners)}
			{...(preview ? {} : drag.attributes)}
			role="button"
			tabIndex={0}
			aria-pressed={selected}
			aria-label={`${titleOf(node)}, ${kindLabel(v)}`}
			data-node-id={node.id}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect?.();
				}
				if ((e.key === "Backspace" || e.key === "Delete") && onRemove) {
					e.preventDefault();
					onRemove();
				}
			}}
			style={{ width: CARD_W }}
			className={cn(
				"group relative flex shrink-0 cursor-pointer flex-col overflow-hidden rounded-lg text-left transition-[background-color,opacity,box-shadow] duration-150",
				failed ? "bg-signal-red-bg" : selected || running ? "bg-arc-tint" : "bg-paper hover:bg-mist/60",
				running && "shadow-[0_0_0_2px_var(--arc)]",
				drag.isDragging && "opacity-40",
				preview && "panel-raised rotate-[0.6deg]",
			)}
		>
			<div className={cn("flex h-6 items-center gap-1.5 px-2", strip)}>
				<StepTile variant={v} size={14} />
				<span className="min-w-0 flex-1 truncate font-medium text-xs">{kindLabel(v)}</span>
				{blocked ? (
					<span title="De flow heeft het recht voor deze stap niet" className="flex items-center gap-1 text-signal-amber text-xs">
						<AlertTriangle className="size-3" />
						Recht uit
					</span>
				) : issue ? (
					<span title={issue.message} className={cn("flex min-w-0 items-center gap-1 truncate text-xs", issue.severity === "error" ? "text-signal-red" : "text-signal-amber")}>
						<AlertTriangle className="size-3 shrink-0" />
						<span className="truncate">{issue.code === "connection_missing" ? issue.message : issue.code === "missing_field" ? "Aanvullen" : "Klopt niet"}</span>
					</span>
				) : null}
				{onRemove ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label="Stapopties"
								onPointerDown={(e) => e.stopPropagation()}
								onClick={(e) => e.stopPropagation()}
								className={cn(
									"-mr-1 flex size-5 items-center justify-center rounded-sm opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100",
									v.ai ? "hover:bg-mesh-ink/15" : "hover:bg-ink/8",
								)}
							>
								<MoreHorizontal className="size-3.5" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-44">
							<DropdownMenuItem onClick={() => onSelect?.()}>Instellingen openen</DropdownMenuItem>
							<DropdownMenuItem variant="destructive" onClick={() => onRemove()}>
								<Trash2 className="size-3.5" />
								Stap verwijderen
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}
			</div>
			<div className="flex flex-col gap-0.5 px-2.5 pt-1.5 pb-2">
				<span className="truncate font-medium text-ink text-sm">{titleOf(node)}</span>
				<VarText text={summaryOf(node)} className="block truncate text-ink-3 text-xs" />
			</div>
		</div>
	);
}
