import { Sparkle } from "../../icons";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { QrCode } from "../affiliate/qr";
import { kindLabel, VARIANTS_BY_ID } from "../automations/node-types";
import { StepTile } from "../automations/step-tile";
import { BrandLogo } from "../marketplace/brand-logos";
import { DueCell, SupplierStatusChip } from "../supplier/status";
import { useCustomers } from "../hooks/use-operator-data";
import { useSupplierOrders } from "../hooks/use-supplier-orders";
import { TEMPLATES } from "../lib/automation-templates";
import { aiReplySuggestions, emailThreads } from "../../data-source";
import { referralLinks } from "../../data-source";
import { personStyle } from "../lib/person-color";
import { ME_SUPPLIER, type SupplierStatus } from "../lib/supplier-work";
import { cn } from "../lib/utils";
import { useAffiliate } from "../stores/affiliate-store";
import { useSupplier } from "../stores/supplier-store";

/*
 * The miniatures a spotlight shows: each one is the destination drawn small, with that place's own
 * parts (`StepTile`, `SupplierStatusChip`, `DueCell`, `QrCode`, `BrandLogo`) and the workspace's own
 * records. Where there are no records yet — the first day — the chrome stays and the record becomes
 * an `ink/8` bar, the way a loading table draws its rows, rather than an invented example.
 *
 * They are pictures: the spotlight makes them inert and hides them from assistive tech, so nothing
 * in here takes focus or a click.
 */

/** Rises in once when scrolled to, one part after the other. The only authored motion in a closing section. */
function Rise({ i, children, className }: { i: number; children: ReactNode; className?: string }) {
	const still = useReducedMotion();
	return (
		<motion.div
			className={className}
			initial={still ? false : { opacity: 0, y: 10 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: 0.08 + i * 0.09 }}
		>
			{children}
		</motion.div>
	);
}

const Bar = ({ className }: { className?: string }) => <span className={cn("block h-2 rounded-full bg-ink/8", className)} />;

/* ── automations ─────────────────────────────────────────────────────────────────────────────── */

/**
 * A template as the canvas draws it: the node cards of `workflow-node-card.tsx`, 300px wide, with the
 * kind strip and the step's own summary, joined by the ruled connector. `note` is what the records say
 * the flow would have to do, as the library's Recommended view phrases it.
 */
export function FlowPreview({ templateId, note, ground = "board" }: { templateId: string; note?: string; ground?: "board" | "plate" }) {
	const t = TEMPLATES.find((x) => x.id === templateId);
	if (!t) return null;
	const plate = ground === "plate";
	return (
		<div className="flex w-full max-w-[300px] flex-col items-stretch">
			{note ? (
				<Rise i={0} className="mb-3 self-center">
					<span className={cn("flex items-center gap-1.5 rounded-sm px-2 py-1 font-medium text-xs", plate ? "bg-mesh-ink/10 text-mesh-ink" : "bg-arc-tint text-arc-ink")}>
						<Sparkle className="size-3" strokeWidth={1.9} />
						{note}
					</span>
				</Rise>
			) : null}
			{t.steps.map((s, i) => {
				const v = VARIANTS_BY_ID[s.variantId];
				if (!v) return null;
				const strip = v.kind === "trigger" ? "bg-signal-green-bg text-signal-green" : v.ai ? "bg-abyss text-mesh-ink" : plate ? "bg-mesh-ink/10 text-mesh-ink-2" : "bg-mist text-ink-3";
				return (
					<Rise key={s.variantId + String(i)} i={i + 1} className="flex flex-col items-center">
						{i > 0 ? <span className={cn("h-4 w-px", plate ? "bg-mesh-ink-3" : "bg-ink-4")} /> : null}
						<div className={cn("flex w-full flex-col overflow-hidden rounded-lg", plate ? "bg-mesh-ink/10" : "bg-paper")}>
							<div className={cn("flex h-6 items-center gap-1.5 px-2", strip)}>
								<StepTile variant={v} size={14} />
								<span className="min-w-0 flex-1 truncate font-medium text-xs">{kindLabel(v)}</span>
							</div>
							<div className="flex flex-col gap-0.5 px-2.5 pt-1.5 pb-2">
								<span className={cn("truncate font-medium text-sm", plate ? "text-mesh-ink" : "text-ink")}>{v.label}</span>
								<span className={cn("truncate text-xs", plate ? "text-mesh-ink-3" : "text-ink-3")}>{s.summary}</span>
							</div>
						</div>
					</Rise>
				);
			})}
		</div>
	);
}

/* ── inbox ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * A customer's letter and the reply Insyte drew for it, on the plate a proposal is drawn on, with the
 * three choices the operator has. The letter is the inbox's first thread and the draft its first
 * suggestion; on the first day both are bars.
 */
export function ReplyPreview() {
	const thread = emailThreads.find((t) => t.messages.some((m) => m.direction === "inbound"));
	const letter = thread?.messages.find((m) => m.direction === "inbound");
	const draft = thread ? aiReplySuggestions[thread.id]?.[1] ?? aiReplySuggestions[thread.id]?.[0] : undefined;
	const who = letter?.from.name ?? "";
	return (
		<div className="flex w-full max-w-[340px] flex-col gap-2.5">
			<Rise i={0}>
				<div className="flex flex-col gap-2 rounded-lg bg-paper p-3">
					<div className="flex items-center gap-2">
						{who ? (
							<span className="flex size-6 items-center justify-center rounded-full font-medium text-2xs" style={personStyle(who)}>
								{who.slice(0, 1)}
							</span>
						) : (
							<span className="size-6 rounded-full bg-ink/8" />
						)}
						<span className="flex min-w-0 flex-1 flex-col">
							{letter ? <span className="truncate font-medium text-ink text-sm">{who}</span> : <Bar className="w-24" />}
							{letter ? <span className="truncate text-ink-3 text-xs">{letter.subject}</span> : <Bar className="mt-1.5 w-36" />}
						</span>
					</div>
					{letter ? (
						<p className="line-clamp-3 text-ink-2 text-xs leading-[1.55]">{letter.body_text.split("\n\n")[1] ?? letter.body_text}</p>
					) : (
						<span className="flex flex-col gap-1.5 pt-1">
							<Bar />
							<Bar className="w-4/5" />
						</span>
					)}
				</div>
			</Rise>
			<Rise i={1} className="ml-6">
				<div className="plate flex flex-col gap-2.5 overflow-hidden rounded-lg p-3">
					<span className="flex items-center gap-1.5 font-medium text-mesh-ink-2 text-xs">
						<Sparkle className="size-3" strokeWidth={1.9} />
						Concept van Insyte
					</span>
					{draft ? (
						<p className="text-mesh-ink text-sm leading-[1.5]">{draft}.</p>
					) : (
						<span className="flex flex-col gap-1.5">
							<span className="block h-2 rounded-full bg-mesh-ink/14" />
							<span className="block h-2 w-3/4 rounded-full bg-mesh-ink/14" />
						</span>
					)}
					<span className="flex items-center gap-1.5 pt-0.5">
						<span className="flex h-6 items-center rounded-sm bg-paper px-2 font-medium text-abyss text-xs">Versturen</span>
						<span className="flex h-6 items-center rounded-sm px-2 font-medium text-mesh-ink-2 text-xs">Bewerken</span>
						<span className="flex h-6 items-center rounded-sm px-2 font-medium text-mesh-ink-2 text-xs">Negeren</span>
					</span>
				</div>
			</Rise>
		</div>
	);
}

/* ── customers ───────────────────────────────────────────────────────────────────────────────── */

/** Klaviyo, with the cuts of the customer list it would keep in step, counted from the customers. */
export function SegmentPreview() {
	const { data: customers } = useCustomers();
	const segments = [
		{ label: "Meer dan €1.000 besteed", n: customers.filter((c) => c.lifetime_value > 1000).length },
		{ label: "Twee of meer bestellingen", n: customers.filter((c) => c.orders_count >= 2).length },
		{ label: "Eén bestelling", n: customers.filter((c) => c.orders_count === 1).length },
	];
	const none = customers.length === 0;
	return (
		<div className="flex w-full max-w-[320px] flex-col gap-1 rounded-lg bg-paper p-2">
			<Rise i={0} className="flex items-center gap-2.5 px-1.5 py-1.5">
				<BrandLogo brand="klaviyo" name="Klaviyo" size={24} />
				<span className="flex min-w-0 flex-col">
					<span className="font-medium text-ink text-sm">Klaviyo-lijsten</span>
					<span className="text-ink-3 text-xs">{none ? "Na je eerste klanten" : `${customers.length.toLocaleString("nl-NL")} klanten om te verdelen`}</span>
				</span>
			</Rise>
			{segments.map((s, i) => (
				<Rise key={s.label} i={i + 1}>
					<div className={cn("flex h-9 items-center gap-3 rounded-md px-2.5 text-sm", i % 2 === 0 ? "bg-mist" : "bg-paper")}>
						<span className="min-w-0 flex-1 truncate text-ink-2">{s.label}</span>
						{none ? <Bar className="w-8" /> : <span className="font-medium text-ink tabular-nums">{s.n.toLocaleString("nl-NL")}</span>}
					</div>
				</Rise>
			))}
		</div>
	);
}

/* ── the supplier portal ─────────────────────────────────────────────────────────────────────── */

/**
 * The supplier's own order list, as Allure sees it in the portal: number, units, when it has to be
 * with the carrier, and its status, in the portal's own chips.
 */
export function PortalPreview() {
	const rows = useSupplierOrders()
		.filter((r) => r.status === "to_accept" || r.status === "to_ship")
		.sort((a, b) => a.handoff.getTime() - b.handoff.getTime())
		.slice(0, 3);
	const blanks: SupplierStatus[] = ["to_accept", "to_ship", "to_ship"];
	return (
		<div className="flex w-full max-w-[360px] flex-col gap-1 rounded-lg bg-paper p-2">
			<Rise i={0} className="flex items-baseline justify-between gap-3 px-1.5 pt-1 pb-1.5">
				<span className="font-medium text-ink text-sm">Leveranciersportaal</span>
				<span className="truncate text-ink-3 text-xs">{ME_SUPPLIER.name}</span>
			</Rise>
			{rows.length > 0
				? rows.map((r, i) => (
						<Rise key={r.id} i={i + 1}>
							<div className={cn("flex h-9 items-center gap-3 rounded-md px-2.5 text-xs", i % 2 === 0 ? "bg-mist" : "bg-paper")}>
								<span className="w-16 shrink-0 font-medium text-ink text-sm tabular-nums">{r.number}</span>
								<span className="hidden w-10 shrink-0 text-ink-3 tabular-nums sm:block">{r.units} st.</span>
								<span className="min-w-0 flex-1 truncate">
									<DueCell row={r} />
								</span>
								<SupplierStatusChip status={r.status} />
							</div>
						</Rise>
					))
				: blanks.map((s, i) => (
						<Rise key={String(i)} i={i + 1}>
							<div className={cn("flex h-9 items-center gap-3 rounded-md px-2.5", i % 2 === 0 ? "bg-mist" : "bg-paper")}>
								<Bar className="w-14" />
								<Bar className="flex-1" />
								<SupplierStatusChip status={s} />
							</div>
						</Rise>
					))}
		</div>
	);
}

/** The supplier's API connection as its settings page states it: the platforms, the webhook, the last test. */
const PLATFORMS = ["Eigen API", "AliExpress", "CJ Dropshipping", "Spocket", "Modalyst"] as const;
const PLATFORM_ID = ["custom", "aliexpress", "cj", "spocket", "modalyst"] as const;

export function ApiPreview() {
	const api = useSupplier((s) => s.api);
	const on = PLATFORM_ID.indexOf(api.platform as (typeof PLATFORM_ID)[number]);
	let host = "";
	try {
		host = new URL(api.url).host;
	} catch {
		host = "";
	}
	return (
		<div className="flex w-full max-w-[340px] flex-col gap-2.5">
			<Rise i={0} className="flex flex-wrap gap-1.5">
				{PLATFORMS.map((p, i) => (
					<span key={p} className={cn("flex h-7 items-center rounded-md px-2.5 font-medium text-xs", i === on ? "bg-arc-tint text-arc-ink" : "bg-paper text-ink-2")}>
						{p}
					</span>
				))}
			</Rise>
			<Rise i={1}>
				<div className="flex flex-col gap-1 rounded-lg bg-paper p-2">
					<div className="flex h-9 items-center gap-3 rounded-md bg-mist px-2.5 text-sm">
						<span className="text-ink-3">Webhook</span>
						<span className="min-w-0 flex-1 truncate text-right text-ink-2">{host || "nog geen adres"}</span>
					</div>
					<div className="flex h-9 items-center gap-3 rounded-md px-2.5 text-sm">
						<span className="text-ink-3">Nieuwe bestelling</span>
						<span className="ml-auto text-ink-2">naar je systeem</span>
					</div>
					<div className="flex h-9 items-center gap-3 rounded-md bg-mist px-2.5 text-sm">
						<span className="text-ink-3">Verbinding</span>
						<span
							className={cn(
								"ml-auto inline-flex h-[22px] items-center rounded-full px-2 font-medium text-xs",
								api.lastTest?.ok ? "bg-signal-green-bg text-signal-green" : api.enabled ? "bg-ink/6 text-ink-2" : "bg-ink/5 text-ink-3",
							)}
						>
							{api.lastTest?.ok ? `Werkt · ${api.lastTest.ms} ms` : api.enabled ? "Aan, nog niet getest" : "Uit"}
						</span>
					</div>
				</div>
			</Rise>
		</div>
	);
}

/* ── the affiliate's links ───────────────────────────────────────────────────────────────────── */

/** The affiliate's best link with its QR code, as the links page draws it, or the code's own link before there is one. */
export function LinkQrPreview() {
	const made = useAffiliate((s) => s.links);
	const code = useAffiliate((s) => s.profile.referral_code);
	const best = [...made, ...referralLinks].sort((a, b) => b.revenue - a.revenue)[0];
	const url = best?.url ?? `northwind.co/p/${code.toLowerCase()}`;
	return (
		<Rise i={0} className="w-full max-w-[340px]">
			<div className="flex items-center gap-4 rounded-lg bg-paper p-3">
				<QrCode text={`https://${url}`} size={104} className="shrink-0 rounded-md" />
				<div className="flex min-w-0 flex-col gap-1.5">
					<span className="truncate font-medium text-ink text-sm">{best?.label ?? "Je kortingslink"}</span>
					<span className="truncate text-arc-ink text-xs">{url}</span>
					{best ? (
						<span className="flex gap-3 pt-1 text-ink-3 text-xs tabular-nums">
							<span>
								<span className="font-medium text-ink">{best.clicks.toLocaleString("nl-NL")}</span> kliks
							</span>
							<span>
								<span className="font-medium text-ink">{best.conversions.toLocaleString("nl-NL")}</span> conversies
							</span>
						</span>
					) : (
						<span className="pt-1 text-ink-3 text-xs">Code {code}</span>
					)}
				</div>
			</div>
		</Rise>
	);
}
