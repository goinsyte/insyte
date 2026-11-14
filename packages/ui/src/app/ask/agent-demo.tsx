import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../common/confirm-dialog";
import { useNow } from "../hooks/use-now";
import { type AgentLogEntry, canUndo } from "../lib/agent-log";
import { ME } from "../lib/assignees";
import { applyEffect, useAgentEntries, useAgentLog } from "../stores/agent-log-store";
import { useAutonomy, useDecide } from "../stores/autonomy-store";
import { useWorkspace } from "../stores/workspace-store";
import { AgentLogDrawer, AgentLogRow, WhyAsks } from "./agent-parts";
import { type AgentLogSource, AgentLogSourceProvider } from "./agent-log-source";
import { ProposalPlate } from "./parts";

/*
 * The design app's agent: its log store as the `AgentLogSource` (with the toast's "Toch laten staan"), the person at
 * the desk by name, and the touchpoint that runs at Zelf doen and draws the plate at Eerst vragen. The console hosts
 * the log over the server (`apps/console/src/agent/log-source.tsx`).
 */

/** The person at the desk, by name, for "Ongedaan gemaakt door …". */
export function useMyName(): string {
	return useWorkspace((s) => s.members.find((m) => m.id === ME)?.name ?? "Elena Hart");
}

/** Takes a row back, or runs its compensation by hand, and says so with the person's own Undo. */
function useDemoUndo() {
	const me = useMyName();
	return (e: AgentLogEntry, now: number) => {
		const log = useAgentLog.getState();
		if (canUndo(e, now)) {
			if (!log.undo(e.id, me)) return;
			toast(e.effect?.kind === "send" ? "Niet verstuurd" : "Ongedaan gemaakt", {
				description: e.effect?.kind === "send" ? "Het bericht wachtte nog op het venster en is nooit vertrokken." : e.sentence,
				duration: 6000,
				action: e.effect?.kind === "send" ? undefined : { label: "Toch laten staan", onClick: () => log.redo(e.id) },
			});
			return;
		}
		// Past the window: a person runs the compensation by hand, which is their own action.
		if (!e.compensation || !e.effect) return;
		applyEffect(e.effect, "back");
		useAgentLog.setState((s) => ({ overrides: { ...s.overrides, [e.id]: { status: "undone", undoneBy: me, at: Date.now() } } }));
		toast(`${e.compensation}: gedaan`, { description: e.sentence, duration: 6000, action: { label: "Ongedaan maken", onClick: () => log.redo(e.id) } });
	};
}

/* ── a touchpoint: plate at Eerst vragen, log row at Zelf doen ─────────────────────────────── */

export type AgentDraft = Omit<AgentLogEntry, "id" | "at" | "undoUntil" | "policyVersion" | "model" | "promptVersion" | "level" | "approvedBy" | "status" | "action">;

/**
 * One thing the agent wants to do, asked of the policy every render. At Zelf doen it does it at
 * once and shows the log row; at Eerst vragen it draws the plate, and filing runs the same action
 * under the person's name; at Nooit nothing is shown. Flipping the row on Zelfstandigheid flips
 * this between the two, which is the whole point of the setting.
 *
 * `perform` changes the records and returns what the log should say about it (its effect for the
 * undo, and before/after); it runs once per `id`.
 */
export function AgentSuggestion({
	id,
	action,
	proposal,
	evidence,
	draft,
	perform,
	wide,
	level = 3,
	confirmFirst,
}: {
	/** For what cannot be taken back (a refund): filing asks first, naming the consequence. */
	confirmFirst?: { title: string; description: string; confirmLabel: string } | undefined;
	id: string;
	action: AgentLogEntry["action"];
	proposal: import("../lib/ask/scripts").Proposal;
	evidence?: ReactNode;
	draft: AgentDraft;
	perform: () => Partial<Pick<AgentLogEntry, "effect" | "before" | "after" | "sentence">> | null;
	wide?: boolean;
	level?: 2 | 3;
}) {
	const decision = useDecide(action);
	const settled = useAgentLog((s) => s.suggestions[id]);
	const entries = useAgentEntries();
	const me = useMyName();
	const version = useAutonomy((s) => s.version);
	const now = useNow();
	const [open, setOpen] = useState<AgentLogEntry | null>(null);
	const [asking, setAsking] = useState(false);
	const ran = useRef(false);

	const run = (as: "auto" | "ask") => {
		const done = perform();
		if (!done) return;
		const entry = useAgentLog.getState().record({ ...draft, ...done, action, level: as, approvedBy: as === "ask" ? me : undefined, status: "done", policyVersion: version });
		useAgentLog.getState().settle(id, { state: as === "auto" ? "ran" : "filed", entryId: entry.id });
	};

	useEffect(() => {
		if (decision === "run" && !settled && !ran.current) {
			ran.current = true;
			run("auto");
		}
	});

	if (settled?.state === "discarded") return null;
	if (settled) {
		const e = entries.find((x) => x.id === settled.entryId);
		if (!e) return null;
		return (
			<>
				<ul className="rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]">
					<AgentLogRow e={e} now={now} onOpen={setOpen} />
				</ul>
				<AgentLogDrawer e={open} onClose={() => setOpen(null)} />
			</>
		);
	}
	if (decision !== "propose") return null;
	return (
		<div className="flex flex-col gap-1.5">
			<ProposalPlate
				proposal={proposal}
				decision="open"
				wide={wide}
				level={level}
				evidence={evidence}
				onFile={() => (confirmFirst ? setAsking(true) : run("ask"))}
				onEdit={() => toast("Pas het voorstel aan in Vraag Insyte", { description: proposal.title })}
				onDiscard={() => {
					useAgentLog.getState().settle(id, { state: "discarded" });
					toast("Voorstel genegeerd", { duration: 6000, action: { label: "Ongedaan maken", onClick: () => useAgentLog.getState().settle(id, null) } });
				}}
			/>
			<WhyAsks action={action} />
			{confirmFirst ? (
				<ConfirmDialog
					open={asking}
					onOpenChange={setAsking}
					title={confirmFirst.title}
					description={confirmFirst.description}
					confirmLabel={confirmFirst.confirmLabel}
					onConfirm={() => {
						setAsking(false);
						run("ask");
					}}
				/>
			) : null}
		</div>
	);
}

/** The design app's provider: the log store's rows, Vraag Insyte among its pages. */
export function DemoAgentLogSource({ children }: { children: ReactNode }) {
	const entries = useAgentEntries();
	const undo = useDemoUndo();
	const source: AgentLogSource = { entries, undo, pages: { ask: true } };
	return <AgentLogSourceProvider value={source}>{children}</AgentLogSourceProvider>;
}
