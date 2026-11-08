import { Check, ChevronDown, Lock, X } from "../../icons";
import { useId, useState } from "react";
import { EmptyIcon } from "../common/empty-icon";
import { PersonDisc } from "../team/bits";
import { formatRelative } from "../lib/format";
import { joinNl, type Level, type Permission } from "../lib/permissions";
import { cn } from "../lib/utils";
import { type Denial, permissionId, permissionLabel } from "./denial";

/**
 * What a part of a page says when the person's role may not see or do what it holds: in place,
 * where the records or the action would be, never over the work. It names the permission that is
 * missing, the role the person has, the roles that do have it and the people who can grant it, and
 * it offers to ask them. The page around it keeps working.
 *
 * Three sizes share one grammar. `section` and `dialog` replace a card's or a dialog's content on
 * `mist`; `table` sits in a table's body under its kept header. `DeniedRefusal` is the fourth case:
 * the screen thought the role could, and the server said no.
 */

/** The missing permission as one chip, as the no-access page has always drawn it. */
export function PermissionChip({ perm, arg }: { perm: Permission; arg?: Level | number }) {
	return (
		<span className="inline-flex items-center gap-1 rounded-md bg-paper px-1.5 font-medium text-ink shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_8%,transparent)]">
			<Lock className="size-3 shrink-0" strokeWidth={2} />
			{permissionLabel(perm, arg)}
		</span>
	);
}

/** "Je rol Klantenservice heeft dat niet; Beheerder en Eigenaar wel." */
function WhoHasIt({ denial }: { denial: Denial }) {
	const others = denial.grantingRoles.filter((r) => r !== denial.roleLabel);
	return (
		<>
			Je rol <span className="font-medium text-ink">{denial.roleLabel}</span> heeft dat niet
			{others.length > 0 ? (
				<>
					; <span className="text-ink">{joinNl(others)}</span> {others.length === 1 ? "heeft" : "hebben"} het wel.
				</>
			) : (
				"."
			)}
		</>
	);
}

/** The people who can say yes, by face: three, then how many more. */
function Granters({ denial }: { denial: Denial }) {
	if (denial.granters.length === 0) return null;
	const shown = denial.granters.slice(0, 3);
	const more = denial.granters.length - shown.length;
	return (
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2 text-sm">
			<span className="text-ink-3">Toegang geven:</span>
			<span className="flex -space-x-1.5" aria-hidden>
				{shown.map((g) => (
					<span key={g.id} className="rounded-full ring-2 ring-mist">
						<PersonDisc seed={g.id} name={g.name} size={22} />
					</span>
				))}
			</span>
			<span>
				{joinNl(shown.map((g) => g.name))}
				{more > 0 ? ` en ${more} ${more === 1 ? "ander" : "anderen"}` : ""}
			</span>
		</div>
	);
}

/** "Toegang vragen", or what became of asking. Absent where the host cannot take a request yet. */
function Ask({ denial, onAsk, quiet = false }: { denial: Denial; onAsk?: (() => void) | undefined; quiet?: boolean }) {
	if (denial.request.state === "open") {
		return (
			<span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-signal-green-bg px-2.5 font-medium text-signal-green text-sm">
				<Check className="size-3.5" strokeWidth={2.25} />
				Gevraagd {formatRelative(new Date(denial.request.at))}
			</span>
		);
	}
	if (!onAsk) return null;
	return (
		<button
			type="button"
			onClick={onAsk}
			className={cn(
				"inline-flex h-8 items-center rounded-md px-3 font-medium text-sm transition-colors",
				quiet ? "text-arc-ink hover:bg-arc-tint" : "bg-abyss text-mesh-ink shadow-primary hover:bg-abyss-2",
			)}
		>
			{denial.request.state === "declined" ? "Opnieuw vragen" : "Toegang vragen"}
		</button>
	);
}

/** What support needs, folded away: the permission's id, the action that was refused, and when. */
function Details({ denial, open }: { denial: Denial; open: boolean }) {
	if (!open) return null;
	const rows: Array<[string, string]> = [
		["Recht", permissionId(denial.perm, denial.arg)],
		...(denial.action ? ([["Actie", denial.action]] as Array<[string, string]>) : []),
		...(denial.at ? ([["Tijdstip", new Date(denial.at).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "medium" })]] as Array<[string, string]>) : []),
	];
	return (
		<dl className="grid w-fit max-w-full grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-md bg-paper px-3 py-2 text-xs">
			{rows.map(([k, v]) => (
				<div key={k} className="contents">
					<dt className="text-ink-3">{k}</dt>
					<dd className="truncate font-mono text-ink-2">{v}</dd>
				</div>
			))}
		</dl>
	);
}

function DetailsToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
	return (
		<button
			type="button"
			aria-expanded={open}
			aria-controls={controls}
			onClick={onToggle}
			className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink"
		>
			Details
			<ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} strokeWidth={2} />
		</button>
	);
}

/**
 * The denied state in place of a card's content (`section`), a table's rows (`table`) or a
 * dialog's body (`dialog`). `title` says what is withheld, in the part's own words: "Je rol kan de
 * uitnodigingslink niet zien".
 */
export function DeniedPanel({
	denial,
	title,
	onAsk,
	size = "section",
	className,
}: {
	denial: Denial;
	title: string;
	onAsk?: (() => void) | undefined;
	size?: "section" | "table" | "dialog";
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const detailsId = useId();
	return (
		<div
			role="status"
			className={cn(
				"flex items-start gap-4 text-left",
				size === "table" ? "px-4 py-8 sm:px-6" : "rounded-lg bg-mist px-4 py-4",
				className,
			)}
		>
			<EmptyIcon kind="locked" size={48} />
			<div className="flex min-w-0 flex-1 flex-col gap-2.5">
				<div className="flex flex-col gap-1">
					<p className="font-medium text-base text-ink">{title}</p>
					<p className="max-w-[64ch] text-ink-2 text-sm leading-normal">
						Daarvoor is <PermissionChip perm={denial.perm} arg={denial.arg} /> nodig. <WhoHasIt denial={denial} />
					</p>
				</div>
				<Granters denial={denial} />
				<div className="flex flex-wrap items-center gap-1.5">
					<Ask denial={denial} onAsk={onAsk} />
					<DetailsToggle open={open} onToggle={() => setOpen((v) => !v)} controls={detailsId} />
				</div>
				{denial.request.state === "declined" ? <p className="text-ink-3 text-sm">Een eerder verzoek is geweigerd. Je kunt het opnieuw vragen.</p> : null}
				<div id={detailsId}>
					<Details denial={denial} open={open} />
				</div>
			</div>
		</div>
	);
}

/**
 * The server refused what the screen offered: the role changed meanwhile, or the screen did not
 * know. Said where it happened, in amber like every refusal, with the way to ask; the screen reads
 * the role again behind it, so the control greys out as it should have been.
 */
export function DeniedRefusal({
	denial,
	onAsk,
	onRetry,
	onDismiss,
	className,
}: {
	denial: Denial;
	onAsk?: (() => void) | undefined;
	onRetry?: (() => void) | undefined;
	onDismiss?: (() => void) | undefined;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const detailsId = useId();
	return (
		<div role="alert" className={cn("flex flex-col gap-2 rounded-xl bg-signal-amber-bg px-4 py-3", className)}>
			<div className="flex items-start gap-2.5">
				<Lock className="mt-0.5 size-4 shrink-0 text-signal-amber" strokeWidth={1.75} />
				<p className="min-w-0 flex-1 text-ink text-sm leading-normal">
					<span className="font-medium">Dat ging niet door.</span> Daarvoor is <PermissionChip perm={denial.perm} arg={denial.arg} /> nodig.{" "}
					<WhoHasIt denial={denial} />
				</p>
				{onDismiss ? (
					<button
						type="button"
						aria-label="Melding sluiten"
						onClick={onDismiss}
						className="-mt-1 -mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
					>
						<X className="size-3.5" strokeWidth={2} />
					</button>
				) : null}
			</div>
			<div className="flex flex-wrap items-center gap-1 pl-3.5">
				<Ask denial={denial} onAsk={onAsk} quiet />
				{onRetry ? (
					<button type="button" onClick={onRetry} className="inline-flex h-8 items-center rounded-md px-2.5 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink">
						Opnieuw proberen
					</button>
				) : null}
				<DetailsToggle open={open} onToggle={() => setOpen((v) => !v)} controls={detailsId} />
			</div>
			<div id={detailsId} className="pl-6.5">
				<Details denial={denial} open={open} />
			</div>
		</div>
	);
}
