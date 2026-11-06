import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Copy } from "../../icons";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { EmptyPage } from "../common/empty-page";
import { AffiliateClosing } from "../marketing-sections/closings";
import { AFF_TODAY, CONVERSIONS, TIERS, weeklyFor } from "../../data-source";
import { formatCurrency } from "../lib/format";
import { getGreeting } from "../lib/greetings";
import { currentAffiliateByState } from "../../data-source";
import { referralLinks } from "../../data-source";
import { cn } from "../lib/utils";
import { METHOD_LABEL, useAffiliate } from "../stores/affiliate-store";

const DAY = 86_400_000;
const when = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });

/* ─────────────────────────────────────────────────────────────────────
   The affiliate's start: what it has earned and when it is paid, on the
   brand's plate; then what its links did, week by week, the orders that
   just came in through them, and where it stands in the program. Every
   figure is a sum over its own conversions, which open on the links
   page.
   ───────────────────────────────────────────────────────────────────── */

export function AffiliateDashboard() {
	const aff = currentAffiliateByState.approved;
	const payment = useAffiliate((s) => s.payment);
	const code = useAffiliate((s) => s.profile.referral_code);
	const made = useAffiliate((s) => s.links);
	const links = useMemo(() => [...made, ...referralLinks], [made]);
	const weeks = useMemo(() => weeklyFor(referralLinks), []);

	const unpaid = CONVERSIONS.filter((c) => c.status === "pending" || c.status === "approved");
	const owed = unpaid.reduce((n, c) => n + c.commission, 0);
	const last30 = CONVERSIONS.filter((c) => c.status !== "reversed" && Date.parse(c.at) > AFF_TODAY - 30 * DAY);
	const clicks30 = weeks.slice(-4).reduce((n, w) => n + w.clicks, 0);
	const rate = clicks30 === 0 ? 0 : (last30.length / clicks30) * 100;
	const quarter = CONVERSIONS.filter((c) => Date.parse(c.at) > AFF_TODAY - 90 * DAY).length;
	const tier = TIERS.find((t) => t.id === aff.tier) ?? TIERS[0];
	const next = TIERS[TIERS.findIndex((t) => t.id === tier.id) + 1];
	const greeting = getGreeting(aff.name.split(" ")[0] ?? aff.name);
	const fresh = links.length === 0 && CONVERSIONS.length === 0;
	const navigate = useNavigate();
	const copyCode = () => {
		void navigator.clipboard?.writeText(code);
		toast(`Code ${code} gekopieerd`);
	};

	return (
		<div className="px-6 py-8">
			<div className="mx-auto flex max-w-[1180px] flex-col gap-10">
				<section aria-labelledby="aff-title" className="plate overflow-hidden rounded-2xl">
					<span aria-hidden className="plate-scan" />
					<header className="flex flex-wrap items-end justify-between gap-4 px-7 pt-6">
						<div className="flex flex-col gap-1.5">
							<h1 id="aff-title" className="font-medium text-mesh-ink text-xl">
								{greeting.salutation}
							</h1>
							<p className="text-base text-mesh-ink-2">
								{links.length === 0
									? "Welkom in het partnerprogramma. Maak een link of deel je kortingscode om te beginnen."
									: `${last30.length} ${last30.length === 1 ? "bestelling kwam" : "bestellingen kwamen"} de afgelopen 30 dagen via jouw links binnen.`}
							</p>
						</div>
						<button
							type="button"
							onClick={copyCode}
							className="flex h-8 cursor-pointer items-center gap-2 rounded-md bg-mesh-ink/10 px-3 font-medium text-mesh-ink text-sm hover:bg-mesh-ink/16"
						>
							Kortingscode <span className="tabular-nums">{code}</span>
							<Copy className="size-3.5" strokeWidth={1.75} />
						</button>
					</header>
					{fresh ? <div className="h-6" /> : <dl className="grid grid-cols-2 px-3 pt-6 pb-4 sm:grid-cols-4">
						{[
							{ label: "Nog uit te betalen", value: formatCurrency(owed), to: "/affiliate/payouts" },
							{ label: "Volgende uitbetaling", value: "15 juni", note: `naar ${METHOD_LABEL[payment.method]}`, to: "/affiliate/payouts" },
							{ label: "Conversies, 30 dagen", value: last30.length.toLocaleString("nl-NL"), to: "/affiliate/referrals" },
							{ label: "Conversieratio, 30 dagen", value: clicks30 === 0 ? "—" : `${rate.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`, to: "/affiliate/referrals" },
						].map((it, i) => (
							<div key={it.label} className={cn(i > 0 && "sm:shadow-[inset_1px_0_0_color-mix(in_oklch,var(--mesh-ink)_12%,transparent)]")}>
								<Link to={it.to} className="flex flex-col gap-2 rounded-xl px-4 py-4 transition-colors hover:bg-mesh-ink/8">
									<dt className="text-mesh-ink-2 text-sm">{it.label}</dt>
									<dd className="flex flex-col gap-1">
										<span className="figure text-4xl text-mesh-ink">{it.value}</span>
										{it.note ? <span className="text-mesh-ink-3 text-xs">{it.note}</span> : null}
									</dd>
								</Link>
							</div>
						))}
					</dl>}
				</section>

				{fresh ? (
					<EmptyPage
						className="mx-0 pt-0 sm:pt-0"
						kind="analytics"
						count="0 conversies"
						title="Deel je eerste link"
						body={`Je verdient ${tier.rate}% op elke bestelling via je link.`}
						action={{ label: "Link maken", onClick: () => void navigate({ to: "/affiliate/referrals" }) }}
						secondary={{ label: `Code ${code} kopiëren`, onClick: copyCode }}
						starts={[
							{ id: "resources", label: "Materiaal om te delen", body: "Productfoto's, teksten en de huisstijl van Northwind.", to: "/affiliate/resources" },
							{ id: "payment", label: "Je betaalgegevens", body: "Waar je commissie heen gaat. Uitbetaling op de 15e van de maand.", to: "/affiliate/settings/payment" },
							{ id: "tiers", label: "Hoe je niveau stijgt", body: next ? `Vanaf ${next.from} conversies per kwartaal verdien je ${next.rate}%.` : "Je zit op het hoogste niveau.", to: "/affiliate/payouts" },
						]}
					/>
				) : (
				<>
				<div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
					<section aria-labelledby="weeks-title" className="flex min-w-0 flex-col gap-3">
						<div className="flex flex-col gap-1">
							<h2 id="weeks-title" className="font-medium text-ink text-xl">
								Wat je links deden
							</h2>
							<p className="text-ink-3 text-sm">Verdiende commissie per week, acht weken tot 26 mei.</p>
						</div>
						<div className="h-[220px]">
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart data={weeks} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
									<defs>
										<linearGradient id="aff-a" x1="0" y1="0" x2="0" y2="1">
											<stop offset="0%" stopColor="var(--arc)" stopOpacity={0.18} />
											<stop offset="100%" stopColor="var(--arc)" stopOpacity={0} />
										</linearGradient>
									</defs>
									<CartesianGrid stroke="var(--hairline)" strokeDasharray="3 3" vertical={false} />
									<XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} />
									<YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => formatCurrency(Number(v))} />
									<Tooltip
										cursor={{ stroke: "var(--arc)", strokeWidth: 1, strokeDasharray: "3 3" }}
										content={({ active, payload, label }) =>
											active && payload?.[0] ? (
												<div className="panel-raised rounded-lg px-3 py-2 text-sm">
													<p className="font-medium text-ink">Week tot {String(label)}</p>
													<p className="text-ink-2 tabular-nums">
														{formatCurrency(Number(payload[0].value))} · {(payload[0].payload as { conversions: number }).conversions} conversies ·{" "}
														{(payload[0].payload as { clicks: number }).clicks.toLocaleString("nl-NL")} klikken
													</p>
												</div>
											) : null
										}
									/>
									<Area dataKey="earned" stroke="var(--arc)" strokeWidth={2} fill="url(#aff-a)" dot={false} activeDot={{ r: 4 }} />
								</AreaChart>
							</ResponsiveContainer>
						</div>

						<div className="mt-4 flex items-baseline justify-between">
							<h2 className="font-medium text-ink text-xl">Net binnen</h2>
							<Link to="/affiliate/referrals" className="flex items-center gap-1 font-medium text-arc-ink text-sm hover:underline">
								Alle links
								<ChevronRight className="size-3.5" strokeWidth={2} />
							</Link>
						</div>
						{CONVERSIONS.length === 0 ? (
							<p className="py-2 text-ink-3 text-sm">Nog geen bestellingen via je links.</p>
						) : null}
						<ul className="flex flex-col">
							{CONVERSIONS.slice(0, 6).map((c) => (
								<li key={c.id} className="flex items-center gap-4 py-2.5 text-sm shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
									<span className="w-14 shrink-0 text-ink-3 tabular-nums">{when.format(new Date(c.at))}</span>
									<span className="min-w-0 flex-1 truncate text-ink">{c.title}</span>
									<span className="hidden truncate text-ink-3 sm:inline">{links.find((l) => l.id === c.link)?.label}</span>
									<span className="w-20 shrink-0 text-right font-medium text-ink tabular-nums">+{formatCurrency(c.commission)}</span>
								</li>
							))}
						</ul>
					</section>

					<aside className="flex flex-col gap-8">
						<section aria-labelledby="tier-title" className="flex flex-col gap-3">
							<h2 id="tier-title" className="font-medium text-ink text-xl">
								Je niveau
							</h2>
							<ol className="flex flex-col gap-1">
								{TIERS.map((t) => {
									const on = t.id === tier.id;
									return (
										<li key={t.id} className={cn("flex items-center justify-between rounded-lg px-3 py-2.5", on ? "bg-arc-tint" : "")}>
											<span className="flex flex-col">
												<span className={cn("font-medium text-sm", on ? "text-arc-ink" : "text-ink")}>
													{t.label}
													{on ? " · jij" : ""}
												</span>
												<span className="text-ink-3 text-xs">{t.from === 0 ? "Vanaf de start" : `Vanaf ${t.from} conversies per kwartaal`}</span>
											</span>
											<span className={cn("font-medium tabular-nums", on ? "text-arc-ink" : "text-ink-2")}>{t.rate}%</span>
										</li>
									);
								})}
							</ol>
							<p className="text-ink-3 text-sm">
								{next
									? `Nog ${Math.max(0, next.from - quarter)} conversies dit kwartaal tot ${next.label}.`
									: `${quarter} conversies dit kwartaal: je blijft op het hoogste niveau.`}
							</p>
						</section>

						<section aria-labelledby="top-title" className="flex flex-col gap-2">
							<h2 id="top-title" className="font-medium text-ink text-xl">
								Beste links
							</h2>
							{links.length === 0 ? (
								<Link to="/affiliate/referrals" className="flex items-center gap-1 py-1 font-medium text-arc-ink text-sm hover:underline">
									Je eerste link maken
									<ChevronRight className="size-3.5" strokeWidth={2} />
								</Link>
							) : null}
							<ul className="flex flex-col">
								{[...links]
									.sort((a, b) => b.revenue - a.revenue)
									.slice(0, 3)
									.map((l) => (
										<li key={l.id}>
											<Link
												to="/affiliate/referrals/$linkId"
												params={{ linkId: l.id }}
												className="flex items-center justify-between gap-3 py-2 text-sm hover:text-arc-ink"
											>
												<span className="flex min-w-0 flex-col">
													<span className="truncate font-medium text-ink">{l.label}</span>
													<span className="truncate text-ink-3 text-xs">{l.conversions} conversies</span>
												</span>
												<span className="shrink-0 font-medium text-ink tabular-nums">{formatCurrency(l.revenue * (tier.rate / 100))}</span>
											</Link>
										</li>
									))}
							</ul>
						</section>
					</aside>
				</div>

				<AffiliateClosing tier={tier} next={next} quarter={quarter} />
				</>
				)}
			</div>
		</div>
	);
}
