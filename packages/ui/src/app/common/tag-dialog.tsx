import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/dialog";
import { Check, Plus } from "../../icons";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../lib/utils";

const PRIMARY =
	"h-9 cursor-pointer rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2 disabled:cursor-not-allowed disabled:bg-ink/8 disabled:text-ink-3 disabled:shadow-none";
const GHOST = "h-9 cursor-pointer rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink";

/**
 * Tags for picked records — customers, orders: add or take away, from the tags already in use or a
 * new one typed in. Each tag says how many of the picked already have it, so "add VIP" to a group
 * that is half VIP is visibly half a change. The screen says what applying means (`onApply`), so
 * the dialog is the same everywhere tags are.
 */
export function TagDialog({
	open,
	onOpenChange,
	picked,
	known,
	noun,
	description,
	onApply,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	picked: ReadonlyArray<{ tags: ReadonlyArray<string> }>;
	known: ReadonlyArray<string>;
	/** What the picked are called, singular and plural. */
	noun: readonly [string, string];
	description: string;
	onApply: (tags: string[], mode: "add" | "remove") => void;
}) {
	const counted = (n: number) => `${n} ${n === 1 ? noun[0] : noun[1]}`;
	const [mode, setMode] = useState<"add" | "remove">("add");
	const [chosen, setChosen] = useState<string[]>([]);
	const [draft, setDraft] = useState("");

	useEffect(() => {
		if (open) {
			setMode("add");
			setChosen([]);
			setDraft("");
		}
	}, [open]);

	const pool = useMemo(() => [...new Set([...known, ...chosen])].sort(), [known, chosen]);
	const has = (t: string) => picked.filter((c) => c.tags.includes(t)).length;
	const shown = mode === "remove" ? pool.filter((t) => has(t) > 0) : pool;
	const toggle = (t: string) => setChosen((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]));
	const addDraft = () => {
		const t = draft.trim().toLowerCase().replace(/\s+/g, "-");
		if (t === "") return;
		setChosen((c) => (c.includes(t) ? c : [...c, t]));
		setDraft("");
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>Labels voor {counted(picked.length)}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<div role="radiogroup" aria-label="Toevoegen of verwijderen" className="grid grid-cols-2 gap-0.5 rounded-lg bg-ink/5 p-0.5">
					{(["add", "remove"] as const).map((m) => (
						<button
							key={m}
							type="button"
							role="radio"
							aria-checked={mode === m}
							onClick={() => {
								setMode(m);
								setChosen([]);
							}}
							className={cn(
								"h-8 cursor-pointer rounded-md text-sm transition-colors",
								mode === m ? "bg-paper font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-ink-2 hover:text-ink",
							)}
						>
							{m === "add" ? "Labels toevoegen" : "Labels verwijderen"}
						</button>
					))}
				</div>
				<div className="flex flex-wrap gap-1.5">
					{shown.length === 0 ? <p className="text-sm text-ink-3">Geen van deze heeft al een label.</p> : null}
					{shown.map((t) => {
						const on = chosen.includes(t);
						const n = has(t);
						return (
							<button
								key={t}
								type="button"
								aria-pressed={on}
								onClick={() => toggle(t)}
								className={cn(
									"flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm transition-colors",
									on ? "bg-arc text-mesh-ink" : "bg-mist text-ink-2 hover:bg-ink/8 hover:text-ink",
								)}
							>
								{on ? <Check className="size-3" strokeWidth={2.5} /> : null}
								{t}
								{n > 0 ? <span className={cn("tabular-nums", on ? "text-mesh-ink-2" : "text-ink-3")}>{n} van {picked.length}</span> : null}
							</button>
						);
					})}
				</div>
				{mode === "add" ? (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							addDraft();
						}}
						className="field flex h-9 items-center gap-2 rounded-md pr-1 pl-2.5"
					>
						<Plus className="size-3.5 shrink-0 text-ink-3" strokeWidth={2} />
						<input
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							placeholder="Nieuw label"
							aria-label="Nieuw label"
							className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
						/>
					</form>
				) : null}
				<DialogFooter>
					<button type="button" onClick={() => onOpenChange(false)} className={GHOST}>
						Annuleren
					</button>
					<button
						type="button"
						disabled={chosen.length === 0}
						onClick={() => {
							onApply(chosen, mode);
							onOpenChange(false);
						}}
						className={PRIMARY}
					>
						{chosen.length === 0 ? "Labels" : chosen.length === 1 ? `“${chosen[0]}”` : `${chosen.length} labels`} {mode === "add" ? "toevoegen" : "verwijderen"}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
