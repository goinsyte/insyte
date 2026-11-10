import { type ReactElement, useState } from "react";
import { Blocked } from "../access/blocked";
import type { TeamGate } from "./source";
import { Box, Check, CreditCard as Gift, MapPin, RotateCcw, Sparkle, Tag, Truck, User } from "../../icons";
import { StatusBadge } from "../common/status-badge";
import { FormDialog, TextAreaField } from "../common/form-dialog";
import { BrandLogo } from "../marketplace/brand-logos";
import { formatCurrency, formatDateTime } from "../lib/format";
import {
	type Carrier,
	type ReasonDef,
	type Resolution,
	RESOLUTION_DETAIL,
	RESOLUTION_LABEL,
	resolutionAmount,
	type ReturnEvent,
	type ReturnRecord,
	type ReturnSettings,
	type ReturnStatus,
	STATUS_LABEL,
	STATUS_TONE,
} from "../lib/returns";
import type { Currency } from "../lib/types/domain";
import { cn } from "../lib/utils";
import { InsyteMark } from "../ask/parts";

/*
 * The returns area's own small parts: the status in the order badge's grammar, the resolution picker,
 * the timeline rows (shopper, team, carrier, Insyte, hub) and the reject dialog. Everything else is
 * the house's: DataTable, DetailShell, FormDialog, ConfirmDialog, EmptyPage.
 */

/** A control the role may not use: disabled, with what is missing, from the host's gate. */
export function GateBy({ gate, children }: { gate: TeamGate; children: ReactElement }) {
	return gate.ok ? children : <Blocked reason={gate.reason}>{children}</Blocked>;
}

export function ReturnStatusBadge({ status, late }: { status: ReturnStatus; late?: boolean }) {
	if (late && status === "review") return <StatusBadge tone="danger">Te beoordelen · te laat</StatusBadge>;
	return <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>;
}

export const KindWord = ({ kind }: { kind: ReturnRecord["kind"] }) => (
	<span className={cn("rounded-sm px-1.5 py-px text-xs", kind === "claim" ? "bg-signal-amber-bg text-signal-amber" : "bg-mist text-ink-2")}>{kind === "claim" ? "Claim" : "Retour"}</span>
);

export const reasonLabel = (reasons: ReadonlyArray<ReasonDef>, id: string) => reasons.find((r) => r.id === id)?.label ?? id;

const RES_ICON: Record<Resolution, typeof Gift> = { refund: RotateCcw, exchange: Box, gift_card: Gift, replacement: Sparkle, discount: Tag };

/**
 * The five ways to settle a return as one radio list: each a row with its glyph, what the shopper
 * gets, and the amount it moves. What the shopper asked for carries a quiet "Gevraagd"; what the
 * store does not offer is left out.
 */
export function ResolutionPicker({
	value,
	onChange,
	options,
	amount,
	settings,
	requested,
	exchangeTo,
	currency,
}: {
	currency: Currency;
	value: Resolution;
	onChange: (r: Resolution) => void;
	options: ReadonlyArray<Resolution>;
	amount: number;
	settings: Pick<ReturnSettings, "giftCardBonus" | "exchangeFee">;
	requested: Resolution;
	exchangeTo?: string | undefined;
}) {
	return (
		<ul role="radiogroup" aria-label="Oplossing" className="flex flex-col gap-1.5">
			{options.map((r) => {
				const Icon = RES_ICON[r];
				const on = r === value;
				const money = resolutionAmount(r, amount, settings);
				return (
					<li key={r}>
						<button
							type="button"
							role="radio"
							aria-checked={on}
							onClick={() => onChange(r)}
							className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors", on ? "bg-arc-tint" : "bg-mist hover:bg-ink/6")}
						>
							<span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", on ? "bg-paper text-arc-ink" : "bg-paper text-ink-2")}>
								<Icon className="size-4" strokeWidth={1.75} />
							</span>
							<span className="flex min-w-0 flex-1 flex-col">
								<span className={cn("flex items-center gap-2 font-medium text-base", on ? "text-arc-ink" : "text-ink")}>
									{RESOLUTION_LABEL[r]}
									{r === "exchange" && exchangeTo ? <span className="font-normal text-ink-2 text-sm">naar {exchangeTo}</span> : null}
									{r === requested ? <span className="rounded-sm bg-paper px-1.5 py-px font-normal text-ink-3 text-xs">Gevraagd</span> : null}
								</span>
								<span className="truncate text-ink-3 text-sm">De klant krijgt {RESOLUTION_DETAIL[r]}.</span>
							</span>
							<span className="shrink-0 text-ink-2 text-sm tabular-nums">
								{r === "exchange" ? (money > 0 ? `${formatCurrency(money, currency)} ruilkosten` : "Gratis") : r === "replacement" ? "Nieuwe bestelling" : formatCurrency(money, currency)}
							</span>
							{on ? <Check className="size-4 shrink-0 text-arc-ink" strokeWidth={2.25} /> : null}
						</button>
					</li>
				);
			})}
		</ul>
	);
}

const WHO_ICON: Record<ReturnEvent["who"], typeof User> = { shopper: User, team: User, carrier: Truck, insyte: Sparkle, hub: MapPin };

/** The return's history: the shopper, the team, the carrier and Insyte, one ruled line, newest last. */
export function ReturnTimeline({ events }: { events: ReadonlyArray<ReturnEvent> }) {
	return (
		<ol className="flex flex-col">
			{events.map((e, i) => {
				const Icon = WHO_ICON[e.who];
				return (
					<li key={`${e.at}-${i}`} className="flex gap-3 pb-3 last:pb-0">
						<div className="flex shrink-0 flex-col items-center">
							{e.who === "insyte" ? (
								<InsyteMark size={22} />
							) : (
								<span className={cn("flex size-[22px] items-center justify-center rounded-md", e.who === "shopper" ? "bg-arc-tint text-arc-ink" : "bg-mist text-ink-2")}>
									<Icon className="size-3" strokeWidth={2} />
								</span>
							)}
							{i < events.length - 1 ? <span className="mt-1 w-px flex-1 bg-hairline" /> : null}
						</div>
						<div className="flex min-w-0 flex-col pb-1">
							<p className="text-ink text-sm leading-snug">
								{e.name ? <span className="font-medium">{e.name} </span> : e.who === "insyte" ? <span className="font-medium">Insyte </span> : null}
								<span className={e.name || e.who === "insyte" ? "text-ink-2" : ""}>{e.name || e.who === "insyte" ? e.text.charAt(0).toLowerCase() + e.text.slice(1) : e.text}</span>
							</p>
							<time dateTime={e.at} className="text-ink-3 text-xs">
								{formatDateTime(e.at)}
							</time>
						</div>
					</li>
				);
			})}
		</ol>
	);
}

export function CarrierMark({ carrier, size = 20 }: { carrier: Carrier; size?: number }) {
	return <BrandLogo brand={carrier.toLowerCase()} name={carrier} size={size} />;
}

const REJECT_REASONS = [
	"Buiten de retourtermijn",
	"Artikel is niet retourneerbaar (sale of hygiëne)",
	"Gedragen of gewassen",
	"Geen foto's van het probleem",
];

/** Afwijzen asks for a reason the shopper will read, from the common ones or in your own words. */
export function RejectDialog({ count, open, onClose, onReject }: { count: number; open: boolean; onClose: () => void; onReject: (reason: string) => void }) {
	const [pick, setPick] = useState<string | null>(null);
	const [own, setOwn] = useState("");
	const reason = own.trim() || pick || "";
	return (
		<FormDialog
			open={open}
			onOpenChange={(o) => {
				if (!o) {
					onClose();
					setPick(null);
					setOwn("");
				}
			}}
			title={count === 1 ? "Retour afwijzen" : `${count} retouren afwijzen`}
			description="De klant krijgt de reden in een mail. Afwijzen kun je ongedaan maken tot de mail vertrekt."
			primaryLabel="Afwijzen"
			disabled={!reason}
			onSubmit={() => {
				onReject(reason);
				onClose();
				setPick(null);
				setOwn("");
			}}
		>
			<div className="flex flex-wrap gap-1.5">
				{REJECT_REASONS.map((r) => (
					<button key={r} type="button" aria-pressed={pick === r} onClick={() => setPick(r)} className={cn("h-7 rounded-md px-2.5 font-medium text-sm transition-colors", pick === r ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-2 hover:text-ink")}>
						{r}
					</button>
				))}
			</div>
			<label className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Of in je eigen woorden</span>
				<TextAreaField value={own} onChange={setOwn} rows={3} placeholder="Wat de klant leest" />
			</label>
		</FormDialog>
	);
}
