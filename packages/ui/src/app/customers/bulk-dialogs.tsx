import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/dialog";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { BrandLogo } from "../marketplace/brand-logos";
import type { Customer } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useWorkspace } from "../stores/workspace-store";

const counted = (n: number) => `${n} ${n === 1 ? "klant" : "klanten"}`;

const PRIMARY =
	"h-9 cursor-pointer rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2 disabled:cursor-not-allowed disabled:bg-ink/8 disabled:text-ink-3 disabled:shadow-none";
const GHOST = "h-9 cursor-pointer rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink";

/* ─── Sync to Klaviyo ───────────────────────────────────────────────────── */

const LISTS = ["Nieuwsbrief", "VIP", "Terugwinnen"];

/**
 * Sends the picked profiles to a Klaviyo list. The sync is simulated: it walks the profiles with a
 * count, then says where they went, and each profile remembers the list and when. If Klaviyo is not
 * connected, the dialog says so and goes to Integrations instead of pretending.
 */
export function KlaviyoDialog({
	open,
	onOpenChange,
	picked,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	picked: ReadonlyArray<Customer>;
}) {
	const connected = useWorkspace((s) => s.integrations.some((i) => i.key === "klaviyo" && i.status === "connected"));
	const sync = useWorkspace((s) => s.syncToKlaviyo);
	const restore = useWorkspace((s) => s.restoreCustomers);
	const still = useReducedMotion();
	const [list, setList] = useState("Nieuwsbrief");
	const [custom, setCustom] = useState("");
	const [withTags, setWithTags] = useState(true);
	const [phase, setPhase] = useState<"pick" | "syncing" | "done">("pick");
	const [sent, setSent] = useState(0);
	const target = list === "new" ? custom.trim() : list;
	const noEmail = picked.filter((c) => c.email.includes("@stripe.com") || c.email.includes("@paypal.com")).length;
	const sendable = picked.length - noEmail;

	useEffect(() => {
		if (!open) return;
		setPhase("pick");
		setSent(0);
	}, [open]);

	useEffect(() => {
		if (phase !== "syncing") return;
		if (sent >= sendable) {
			const before = useWorkspace.getState();
			const snapshot = { e: before.customerEdits, n: before.notDuplicates };
			sync(
				picked.filter((c) => !c.email.includes("@stripe.com") && !c.email.includes("@paypal.com")).map((c) => c.id),
				target,
			);
			setPhase("done");
			undoable(`${counted(sendable)} gesynchroniseerd naar ${target}`, () => restore(snapshot.e, snapshot.n));
			return;
		}
		const t = window.setTimeout(() => setSent((n) => Math.min(sendable, n + Math.max(1, Math.ceil(sendable / 12)))), 70);
		return () => window.clearTimeout(t);
	}, [phase, sent, sendable, picked, target, sync, restore]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<div className="flex items-center gap-3">
						<BrandLogo brand="klaviyo" name="Klaviyo" size={36} />
						<div className="flex flex-col gap-0.5">
							<DialogTitle>Synchroniseren naar Klaviyo</DialogTitle>
							<DialogDescription>{counted(picked.length)} gekozen</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				{!connected ? (
					<p className="text-base text-ink-2">
						Klaviyo is niet gekoppeld aan deze werkruimte. Koppel het eerst en kom dan terug voor deze {counted(picked.length)}.
					</p>
				) : phase === "pick" ? (
					<div className="flex flex-col gap-3">
						<div role="radiogroup" aria-label="Klaviyo-lijst" className="flex flex-col gap-1">
							{[...LISTS, "new"].map((l) => {
								const on = list === l;
								return (
									<button
										key={l}
										type="button"
										role="radio"
										aria-checked={on}
										onClick={() => setList(l)}
										className={cn(
											"flex h-10 cursor-pointer items-center gap-2.5 rounded-lg bg-mist px-3 text-left text-base transition-shadow",
											on ? "ring-2 ring-arc" : "hover:ring-1 hover:ring-ink/15",
										)}
									>
										<span className={cn("flex size-4 items-center justify-center rounded-full ring-1", on ? "bg-arc ring-arc" : "ring-ink/25")}>
											{on ? <span className="size-1.5 rounded-full bg-paper" /> : null}
										</span>
										{l === "new" ? (
											on ? (
												<input
													// biome-ignore lint/a11y/noAutofocus: the field appears because the operator chose a new list
													autoFocus
													value={custom}
													onChange={(e) => setCustom(e.target.value)}
													onClick={(e) => e.stopPropagation()}
													placeholder="Geef de nieuwe lijst een naam"
													aria-label="Naam nieuwe lijst"
													className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
												/>
											) : (
												<span className="text-ink-2">Een nieuwe lijst</span>
											)
										) : (
											<span className="text-ink">{l}</span>
										)}
									</button>
								);
							})}
						</div>
						<label className="flex cursor-pointer items-center gap-2.5 text-base text-ink-2">
							<input type="checkbox" checked={withTags} onChange={(e) => setWithTags(e.target.checked)} className="size-4 accent-[var(--arc)]" />
							Labels meesturen als profieleigenschappen
						</label>
						{noEmail > 0 ? (
							<p className="text-sm text-ink-3">
								{counted(noEmail)} {noEmail === 1 ? "rekende" : "rekenden"} als gast af via een betaalprovider en {noEmail === 1 ? "heeft" : "hebben"} geen eigen e-mailadres; {noEmail === 1 ? "die blijft" : "die blijven"} buiten de synchronisatie.
							</p>
						) : null}
					</div>
				) : (
					<div className="flex flex-col gap-2.5" role="status">
						<div className="flex items-baseline justify-between text-base">
							<span className="text-ink">{phase === "done" ? `In Klaviyo, op ${target}` : `Versturen naar ${target}`}</span>
							<span className="text-ink-2 tabular-nums">
								{Math.min(sent, sendable)} van {sendable}
							</span>
						</div>
						<span className="h-1.5 overflow-hidden rounded-full bg-ink/8">
							<motion.span
								className="block h-full rounded-full bg-arc"
								animate={{ width: `${sendable === 0 ? 100 : (Math.min(sent, sendable) / sendable) * 100}%` }}
								transition={still ? { duration: 0 } : { duration: 0.12 }}
							/>
						</span>
						{phase === "done" ? (
							<p className="text-sm text-ink-3">
								{withTags ? "Labels zijn meegestuurd als profieleigenschappen. " : ""}Elk profiel laat zien wanneer het voor het laatst is gesynchroniseerd.
							</p>
						) : null}
					</div>
				)}

				<DialogFooter>
					{!connected ? (
						<Link to="/settings/integrations" onClick={() => onOpenChange(false)} className={cn(PRIMARY, "flex items-center")}>
							Klaviyo koppelen
						</Link>
					) : phase === "done" ? (
						<button type="button" onClick={() => onOpenChange(false)} className={PRIMARY}>
							Klaar
						</button>
					) : (
						<>
							<button type="button" onClick={() => onOpenChange(false)} className={GHOST} disabled={phase === "syncing"}>
								Annuleren
							</button>
							<button
								type="button"
								disabled={phase === "syncing" || target === "" || sendable === 0}
								onClick={() => setPhase("syncing")}
								className={PRIMARY}
							>
								{phase === "syncing" ? "Synchroniseren" : `${counted(sendable)} synchroniseren`}
							</button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

