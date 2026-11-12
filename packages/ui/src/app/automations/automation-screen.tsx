import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/popover";
import { ChevronRight, Copy, Edit3, FlaskConical, MoreHorizontal, Play, Square, Trash2, Undo2 } from "../../icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { OverviewTab } from "./overview-tab";
import { RunsTab } from "./runs-tab";
import { EmptyState } from "../common/empty-state";
import { SettingsTab } from "./settings-tab";
import { showTestResult } from "./test-toast";
import { WorkflowBuilder } from "./workflow-builder";
import { useAutomationsSource } from "./source";
import { useActiveRun } from "./flow-edits";
import { Field, FormDialog, TextField } from "../common/form-dialog";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import type { WorkflowNode } from "./node-types";
import { flatNodes, VARIANTS_BY_ID } from "./node-types";
import { TABS } from "./automation-search";

type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = { overview: "Overzicht", workflow: "Workflow", runs: "Runs", settings: "Instellingen" };

/** What changed since the last publication, said as a version note. */
function changeNote(before: ReadonlyArray<WorkflowNode>, after: ReadonlyArray<WorkflowNode>): string {
	const a = new Set(flatNodes(before).map((n) => n.id));
	const b = new Set(flatNodes(after).map((n) => n.id));
	const added = [...b].filter((id) => !a.has(id)).length;
	const removed = [...a].filter((id) => !b.has(id)).length;
	const parts = [
		added ? `${added} ${added === 1 ? "stap" : "stappen"} toegevoegd` : "",
		removed ? `${removed} ${removed === 1 ? "stap" : "stappen"} verwijderd` : "",
	].filter(Boolean);
	return parts.length ? parts.join(", ") : "Instellingen van stappen aangepast";
}

/** The page's address: the flow, and its tab (the canvas when none). */
export function AutomationDetail({ automationId, tab = "workflow" }: { automationId: string; tab?: Tab | undefined }) {
	const navigate = useNavigate();
	const { commands, editor, gates, runs, test: runTest, useIssues, useSaving, useWorkflow } = useAutomationsSource();
	const workflow = useWorkflow(automationId);
	const issues = useIssues?.(automationId);
	const saving = useSaving?.(automationId) ?? null;
	const run = useActiveRun();
	const still = useReducedMotion();
	const [renaming, setRenaming] = useState(false);
	const [nameDraft, setNameDraft] = useState("");
	const [publishing, setPublishing] = useState(false);
	const [note, setNote] = useState("");

	if (!workflow) return null;
	const dirty = editor.isDirty(automationId);
	const testing = run?.automationId === automationId && run.nodeId !== null;
	const hasTrigger = workflow.nodes[0] !== undefined && VARIANTS_BY_ID[workflow.nodes[0].variantId]?.kind === "trigger";
	const publishGate = gates.publish;
	const manageGate = gates.manage;
	const errors = issues ? [...issues.values()].flat().filter((i) => i.severity === "error").length : 0;
	const canPublish = hasTrigger && (dirty || workflow.version === 0) && publishGate.ok && errors === 0;

	const status =
		workflow.status === "active"
			? { label: "Actief", dot: "bg-signal-green" }
			: workflow.status === "paused"
				? { label: "Gepauzeerd", dot: "bg-signal-amber" }
				: { label: "Concept", dot: "bg-ink-4" };

	const go = (next: Tab) => navigate({ to: "/automations/$automationId", params: { automationId }, search: next === "workflow" ? {} : { tab: next } });

	async function test() {
		if (!runTest) {
			toast("Testen met een voorbeeld komt binnenkort", { description: "Dat kan zodra flows echt draaien." });
			return;
		}
		if (!workflow || workflow.nodes.length === 0) {
			toast("Zet eerst een trigger op het canvas", { description: "Een test loopt de flow door met een voorbeeld, vanaf de trigger." });
			return;
		}
		if (tab !== "workflow") go("workflow");
		const result = await runTest(automationId);
		if (result) showTestResult(result);
	}

	function publish() {
		if (!workflow) return;
		const wasDraft = workflow.status === "draft";
		setPublishing(false);
		void commands.publish(automationId, note.trim() || "Gepubliceerd", {
			label: `Versie ${workflow.version + 1} gepubliceerd`,
			detail: wasDraft ? "De flow staat nu aan en reageert op de trigger." : "Nieuwe runs gebruiken deze versie; lopende runs maken hun versie af.",
		});
	}

	function setStatus(next: "active" | "paused") {
		if (!workflow) return;
		void commands.setStatus(automationId, next, { label: next === "active" ? `${workflow.name} staat aan` : `${workflow.name} is gepauzeerd` });
	}

	async function duplicate() {
		const copy = await commands.duplicate(automationId);
		if (!copy) return;
		toast("Kopie gemaakt als concept");
		navigate({ to: "/automations/$automationId", params: { automationId: copy } });
	}

	function remove() {
		if (!workflow) return;
		const name = workflow.name;
		navigate({ to: "/automations" });
		void commands.remove(automationId, { label: `${name} verwijderd` });
	}

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col bg-glacier">
			<header className="grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 bg-mist px-3 sm:px-4">
				<div className="flex min-w-0 items-center gap-2 text-sm">
					<Link to="/automations" className="shrink-0 text-ink-3 transition-colors hover:text-ink">
						Automatiseringen
					</Link>
					<ChevronRight className="size-3.5 shrink-0 text-ink-4" />
					<input
						value={workflow.name}
						onChange={(e) => editor.updateMeta(automationId, { name: e.target.value })}
						aria-label="Naam van de automatisering"
						title={workflow.name}
						className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1 py-1 font-medium text-ink text-sm outline-none transition-colors hover:bg-ink/5 focus:bg-paper"
					/>
					<span className="flex shrink-0 items-center gap-1.5 text-ink-2 text-xs">
						<span className={cn("size-1.5 rounded-full", status.dot)} aria-hidden />
						{status.label}
					</span>
					{saving === "saving" ? (
						<span className="shrink-0 text-ink-3 text-xs">Opslaan…</span>
					) : saving === "failed" ? (
						<span className="shrink-0 text-signal-red text-xs" title="Je wijzigingen staan nog hier; Insyte probeert het opnieuw.">
							Niet opgeslagen
						</span>
					) : null}
					{workflow.version > 0 ? (
						<span className="shrink-0 rounded-sm bg-ink/7 px-1.5 py-0.5 font-medium text-ink-2 text-xs tabular-nums" title={`Versie ${workflow.version} is live`}>
							v{workflow.version}
						</span>
					) : null}
				</div>

				<nav aria-label="Onderdelen van de automatisering" className="flex items-center gap-0.5 rounded-md bg-ink/5 p-0.5">
					{TABS.map((t) => {
						const on = t === tab;
						return (
							<button
								key={t}
								type="button"
								onClick={() => go(t)}
								aria-current={on ? "page" : undefined}
								className={cn("relative flex h-7 items-center gap-1.5 rounded-sm px-3 font-medium text-sm transition-colors", on ? "text-ink" : "text-ink-3 hover:text-ink")}
							>
								{on ? (
									<motion.span
										layoutId="automation-tab"
										className="absolute inset-0 rounded-sm bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
										transition={still ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
										aria-hidden
									/>
								) : null}
								<span className="relative">{TAB_LABEL[t]}</span>
								{t === "runs" && workflow.history.length > 0 ? <span className="relative text-ink-3 text-xs tabular-nums">{workflow.history.length}</span> : null}
							</button>
						);
					})}
				</nav>

				<div className="flex min-w-0 items-center justify-end gap-1.5">
					<button
						type="button"
						onClick={test}
						disabled={testing}
						title={runTest ? undefined : "Binnenkort"}
						className="field flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm transition-colors hover:field-hover disabled:cursor-wait disabled:opacity-60"
					>
						<FlaskConical className="size-3.5" />
						<span className="hidden sm:inline">{testing ? "Bezig met testen" : "Test met voorbeeld"}</span>
					</button>
					<Popover
						open={publishing}
						onOpenChange={(o) => {
							if (o) setNote(workflow.version === 0 ? "Eerste publicatie" : changeNote(editor.published(automationId)?.nodes ?? [], workflow.nodes));
							setPublishing(o);
						}}
					>
						<PopoverTrigger asChild>
							<button
								type="button"
								disabled={!canPublish}
								title={
									!publishGate.ok
										? publishGate.reason
										: workflow.nodes.length === 0
										? "Zet eerst een trigger op het canvas"
										: errors > 0
											? `${errors} ${errors === 1 ? "stap moet" : "stappen moeten"} nog worden aangevuld`
										: !canPublish
											? "Er is niets nieuws om te publiceren"
											: dirty
												? "Er zijn wijzigingen die nog niet live staan"
												: undefined
								}
								className="relative flex h-8 shrink-0 items-center rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink-3 disabled:shadow-none"
							>
								Publiceren
								{dirty ? (
									<span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-signal-amber shadow-[0_0_0_2px_var(--mist)]" aria-label="Niet-gepubliceerde wijzigingen" />
								) : null}
							</button>
						</PopoverTrigger>
						<PopoverContent align="end" className="w-80 p-3">
							<form
								onSubmit={(e) => {
									e.preventDefault();
									publish();
								}}
								className="flex flex-col gap-2.5"
							>
								<div className="flex flex-col gap-0.5">
									<span className="font-medium text-ink text-sm">Versie {workflow.version + 1} publiceren</span>
									<span className="text-ink-3 text-xs leading-[1.5]">
										{workflow.status === "draft"
											? "De flow gaat aan en reageert vanaf nu op de trigger."
											: "Nieuwe runs gebruiken deze versie. Je kunt altijd terug naar een eerdere."}
									</span>
								</div>
								<label className="flex flex-col gap-1">
									<span className="text-ink-2 text-xs">Wat is er veranderd</span>
									<input
										value={note}
										onChange={(e) => setNote(e.target.value)}
										className="field h-8 rounded-md px-2.5 text-ink text-sm outline-none focus:bg-paper"
									/>
								</label>
								<div className="flex justify-end gap-1.5">
									<button type="button" onClick={() => setPublishing(false)} className="h-8 rounded-md px-3 text-ink-2 text-sm hover:bg-ink/6">
										Annuleren
									</button>
									<button type="submit" className="h-8 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2">
										Publiceren
									</button>
								</div>
							</form>
						</PopoverContent>
					</Popover>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button type="button" aria-label="Meer" className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink">
								<MoreHorizontal className="size-3.5" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuItem
								onClick={() => {
									setNameDraft(workflow.name);
									setRenaming(true);
								}}
							>
								<Edit3 className="size-3.5" />
								Naam wijzigen
							</DropdownMenuItem>
							{dirty ? (
								<DropdownMenuItem
									onClick={() => {
										const before = editor.getWorkflow(automationId);
										editor.revert(automationId);
										if (before) undoable("Teruggezet naar de gepubliceerde versie", () => editor.replaceNodes(automationId, before.nodes, before.name));
									}}
								>
									<Undo2 className="size-3.5" />
									Wijzigingen terugdraaien
								</DropdownMenuItem>
							) : null}
							<DropdownMenuItem onClick={() => void duplicate()}>
								<Copy className="size-3.5" />
								Dupliceren
							</DropdownMenuItem>
							{workflow.status === "active" ? (
								<DropdownMenuItem disabled={!manageGate.ok} onClick={() => setStatus("paused")}>
									<Square className="size-3.5" />
									Pauzeren
								</DropdownMenuItem>
							) : workflow.status === "paused" ? (
								<DropdownMenuItem disabled={!publishGate.ok} onClick={() => setStatus("active")}>
									<Play className="size-3.5" />
									Weer aanzetten
								</DropdownMenuItem>
							) : null}
							<DropdownMenuSeparator />
							<DropdownMenuItem variant="destructive" disabled={!manageGate.ok} onClick={remove}>
								<Trash2 className="size-3.5" />
								Verwijderen
							</DropdownMenuItem>
							{manageGate.ok ? null : <p className="px-2 pt-1 pb-1.5 text-ink-3 text-xs leading-snug">{manageGate.reason}</p>}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</header>

			{tab === "workflow" ? (
				<WorkflowBuilder key={automationId} automationId={automationId} />
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto">
					{tab === "overview" ? (
						<OverviewTab workflow={workflow} onOpenTab={go} />
					) : tab === "runs" ? (
						runs ? <RunsTab workflow={workflow} /> : <EmptyState kind="automations" title="Binnenkort." body="Hier staat elke run zodra flows echt draaien." />
					) : (
						<SettingsTab workflow={workflow} onDelete={remove} />
					)}
				</div>
			)}

			<FormDialog
				open={renaming}
				onOpenChange={setRenaming}
				title="Naam wijzigen"
				primaryLabel="Naam wijzigen"
				width={440}
				disabled={nameDraft.trim().length === 0}
				onSubmit={() => {
					editor.updateMeta(automationId, { name: nameDraft.trim() });
					setRenaming(false);
					toast("Naam gewijzigd", { description: "Publiceer om de nieuwe naam live te zetten." });
				}}
			>
				<Field label="Naam">
					<TextField value={nameDraft} onChange={setNameDraft} />
				</Field>
			</FormDialog>
		</div>
	);
}
