import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "../../components/dialog";
import { Link } from "@tanstack/react-router";
import {
	ArrowRight,
	ArrowUpRight,
	Bell,
	CheckCircle2,
	Compass,
	Download,
	Flame,
	MessageSquare,
	Search,
	Sparkles,
	Star,
	X,
} from "../../icons";
import { useMemo, useState } from "react";
import { InsyteMark, InsyteWordmark } from "../../brand/mark";
import { useMarketplaceState } from "../shell/state";
import { SoonChip } from "../common/soon-chip";
import { Skeleton } from "../../components/skeleton";
import type { Extension } from "../lib/types/domain";
import { cn } from "../lib/utils";
import { useMarketplaceModalStore } from "../stores/marketplace-modal-store";
import {
	type AppCategory,
	BADGE_FOR,
	BADGE_LABEL,
	CATEGORIES_ORDER,
	CATEGORY_FOR,
	CATEGORY_LABEL,
	EDITORS_CHOICE_IDS,
	FEATURED_IDS,
	formatInstalls,
	KIND_FOR,
	KIND_LABEL,
	KIND_STYLE,
	TRENDING_IDS,
	vendorName,
} from "./app-catalog";
import { AppDetailModal } from "./app-detail-modal";
import { FeedbackDialog, LegalDialog } from "./marketplace-dialogs";
import { BrandLogo, brandFor } from "./brand-logos";

type CollectionId =
	| "all"
	| "featured"
	| "recommended"
	| "trending"
	| "editors"
	| "new"
	| AppCategory;

type CollectionItem = {
	id: CollectionId;
	label: string;
	icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const TOP_COLLECTIONS: CollectionItem[] = [
	{ id: "all", label: "Alle apps" },
	{ id: "featured", label: "Uitgelicht", icon: Sparkles },
	{ id: "recommended", label: "Aanbevolen voor jou", icon: Star },
	{ id: "trending", label: "Populair deze week", icon: Flame },
	{ id: "editors", label: "Keuze van de redactie", icon: Compass },
	{ id: "new", label: "Nieuwe apps", icon: Bell },
];

// Category atmosphere — each category gets a brand-coherent tint for the tile
// grid. Stays inside the Insyte palette (no random hex).
const CATEGORY_THEME: Record<
	AppCategory,
	{ from: string; to: string; ink: string }
> = {
	ecommerce: {
		from: "oklch(94% 0.04 270)",
		to: "oklch(89% 0.07 280)",
		ink: "var(--arc-ink)",
	},
	marketing: {
		from: "oklch(94% 0.07 75)",
		to: "oklch(90% 0.10 55)",
		ink: "var(--signal-amber)",
	},
	customer_service: {
		from: "oklch(94% 0.06 0)",
		to: "oklch(89% 0.08 10)",
		ink: "oklch(38% 0.18 5)",
	},
	analytics: {
		from: "oklch(95% 0.04 195)",
		to: "oklch(90% 0.07 200)",
		ink: "oklch(38% 0.15 200)",
	},
	finance: {
		from: "oklch(94% 0.06 145)",
		to: "oklch(90% 0.08 140)",
		ink: "var(--signal-green)",
	},
	logistics: {
		from: "oklch(94% 0.05 235)",
		to: "oklch(89% 0.08 240)",
		ink: "oklch(38% 0.16 245)",
	},
	ai: {
		from: "oklch(15% 0.02 280)",
		to: "oklch(22% 0.03 280)",
		ink: "var(--mesh-ink-2)",
	},
	communication: {
		from: "oklch(94% 0.06 220)",
		to: "oklch(89% 0.08 225)",
		ink: "oklch(38% 0.15 225)",
	},
	integrations: {
		from: "oklch(94% 0.05 270)",
		to: "oklch(89% 0.07 270)",
		ink: "var(--arc-ink)",
	},
	productivity: {
		from: "oklch(95% 0.04 320)",
		to: "oklch(90% 0.07 320)",
		ink: "oklch(38% 0.18 325)",
	},
};

export function MarketplaceModal() {
	const open = useMarketplaceModalStore((s) => s.open);
	const closeModal = useMarketplaceModalStore((s) => s.closeModal);
	const market = useMarketplaceState();
	const { isInstalled, install, uninstall, soon } = market;
	const seedExtensions = market.apps;
	const [collection, setCollection] = useState<CollectionId>("all");
	const [query, setQuery] = useState("");
	const [detail, setDetail] = useState<Extension | null>(null);
	const [feedback, setFeedback] = useState(false);
	const [legal, setLegal] = useState(false);

	const counts = useMemo(() => {
		const map = new Map<CollectionId, number>();
		map.set("all", seedExtensions.length);
		map.set("featured", FEATURED_IDS.length);
		map.set("trending", TRENDING_IDS.length);
		map.set("editors", EDITORS_CHOICE_IDS.length);
		map.set(
			"new",
			seedExtensions.filter((e) => BADGE_FOR[e.id] === "new").length,
		);
		map.set("recommended", market.recommended.length);
		for (const cat of CATEGORIES_ORDER) {
			const count = seedExtensions.filter(
				(e) => CATEGORY_FOR[e.id] === cat,
			).length;
			if (count > 0) map.set(cat, count);
		}
		return map;
	}, [seedExtensions, market.recommended]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		const filterFn = (ext: Extension) => {
			if (collection === "all") return true;
			if (collection === "featured") return FEATURED_IDS.includes(ext.id);
			if (collection === "trending") return TRENDING_IDS.includes(ext.id);
			if (collection === "editors") return EDITORS_CHOICE_IDS.includes(ext.id);
			if (collection === "new") return BADGE_FOR[ext.id] === "new";
			if (collection === "recommended")
				return market.recommended.includes(ext.id);
			return CATEGORY_FOR[ext.id] === collection;
		};
		return seedExtensions.filter((e) => {
			if (!filterFn(e)) return false;
			if (!q) return true;
			return (
				e.name.toLowerCase().includes(q) || e.tagline.toLowerCase().includes(q)
			);
		});
	}, [collection, query, seedExtensions, market.recommended]);

	const featuredApps = useMemo(
		() =>
			FEATURED_IDS.map((id) => seedExtensions.find((e) => e.id === id)).filter(
				Boolean,
			) as Extension[],
		[seedExtensions],
	);
	const trendingApps = useMemo(
		() =>
			TRENDING_IDS.map((id) => seedExtensions.find((e) => e.id === id)).filter(
				Boolean,
			) as Extension[],
		[seedExtensions],
	);
	const heroApp = featuredApps[0];

	const showCollections = collection === "all" && !query.trim();

	// What came of it (a toast, a provider's approval page, a key shown once) is the host's to say.
	function handleInstall(ext: Extension) {
		install(ext);
	}

	function handleUninstall(ext: Extension) {
		uninstall(ext);
	}

	return (
		<>
			<Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
				<DialogContent
					showCloseButton={false}
					className="flex h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]"
				>
					<DialogTitle className="sr-only">Insyte Marketplace</DialogTitle>

					{/* Header — Insyte brand lockup + "Marketplace" eyebrow, search,
					    feedback action, close. */}
					<header className="flex h-[60px] shrink-0 items-center justify-between gap-4 bg-glacier px-5">
						<div className="flex items-center gap-3">
							<Link
								to="/dashboard"
								onClick={closeModal}
								className="flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-arc focus-visible:ring-offset-2 focus-visible:ring-offset-glacier"
								aria-label="Insyte start"
							>
								<InsyteMark size={22} />
								<InsyteWordmark size={17} tone="ink" />
							</Link>
							<span
								className="size-1 shrink-0 rounded-full bg-arc"
								aria-hidden
							/>
							<span className="font-medium text-base text-ink-2 leading-none tracking-[-0.1px]">
								Marketplace
							</span>
						</div>
						<div className="relative max-w-[480px] flex-1">
							<Search
								className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-3"
								strokeWidth={1.75}
							/>
							<input
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Zoek in 200+ koppelingen, apps en diensten"
								className="field h-9 w-full rounded-md pr-3 pl-9 font-medium text-base text-ink leading-none outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-arc/40"
							/>
						</div>
						<div className="flex items-center gap-1">
							<HeaderAction
								label="Feedback"
								onClick={() => setFeedback(true)}
								icon={<MessageSquare className="size-4" strokeWidth={1.75} />}
							/>
							<button
								type="button"
								onClick={closeModal}
								aria-label="Marketplace sluiten"
								className="flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-mist hover:text-ink"
							>
								<X className="size-4" strokeWidth={1.75} />
							</button>
						</div>
					</header>

					<div className="flex min-h-0 flex-1">
						{/* Left categories rail */}
						<aside className="flex w-[220px] shrink-0 flex-col bg-glacier">
							<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-2.5 py-4">
								<div className="flex flex-col gap-0.5">
									<SidebarHeading>Bladeren</SidebarHeading>
									{TOP_COLLECTIONS.map((c) => (
										<CollectionRow
											key={c.id}
											id={c.id}
											label={c.label}
											icon={c.icon}
											active={collection === c.id}
											count={counts.get(c.id)}
											onClick={() => setCollection(c.id)}
										/>
									))}
								</div>
								<div className="flex flex-col gap-0.5">
									<SidebarHeading>Categorieën</SidebarHeading>
									{CATEGORIES_ORDER.map((cat) => (
										<CollectionRow
											key={cat}
											id={cat}
											label={CATEGORY_LABEL[cat]}
											active={collection === cat}
											count={counts.get(cat)}
											onClick={() => setCollection(cat)}
										/>
									))}
								</div>
							</div>
							<div className="px-3 py-2.5">
								<button
									type="button"
									onClick={() => setLegal(true)}
									className="text-sm text-ink-3 leading-[1.4] hover:text-ink"
								>
									Voorwaarden · Privacy · Aanbiedersprogramma
								</button>
							</div>
						</aside>

						{/* Main scrollable content */}
						<div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-paper">
							<div className="flex flex-col gap-8 px-8 py-7">
								{market.status === "loading" ? <CatalogSkeleton /> : null}
								{market.status === "error" ? (
									<div className="hatch rounded-xl bg-glacier/40 px-10 py-16 text-center">
										<p className="font-medium text-base text-ink">
											De Marketplace kon niet worden geladen
										</p>
										<p className="mt-1 text-base text-ink-3">
											Er ging iets mis bij het ophalen. Probeer het zo opnieuw.
										</p>
										{market.retry ? (
											<button
												type="button"
												onClick={market.retry}
												className="mt-4 inline-flex h-8 items-center rounded-md bg-paper px-3 font-medium text-base text-ink hover:bg-mist"
											>
												Opnieuw proberen
											</button>
										) : null}
									</div>
								) : null}
								{market.status !== "ready" ? null : showCollections && heroApp ? (
									<HeroFeatured
										ext={heroApp}
										installed={isInstalled(heroApp.id)}
										soon={soon(heroApp.id)}
										onInstall={() => handleInstall(heroApp)}
										onUninstall={() => handleUninstall(heroApp)}
										onOpenDetails={() => setDetail(heroApp)}
									/>
								) : null}

								{market.status !== "ready" ? null : showCollections ? (
									<>
										<Section
											title="Uitgelicht"
											onShowAll={() => setCollection("featured")}
										>
											<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
												{featuredApps.slice(1, 7).map((ext) => (
													<AppCard
														key={ext.id}
														ext={ext}
														installed={isInstalled(ext.id)}
														soon={soon(ext.id)}
														onOpenDetails={() => setDetail(ext)}
														onInstall={() => handleInstall(ext)}
														onUninstall={() => handleUninstall(ext)}
													/>
												))}
											</div>
										</Section>

										<Section
											title="Populair deze week"
											onShowAll={() => setCollection("trending")}
										>
											<div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
												{trendingApps.map((ext, i) => (
													<TrendingPill
														key={ext.id}
														rank={i + 1}
														ext={ext}
														installed={isInstalled(ext.id)}
														soon={soon(ext.id)}
														onOpenDetails={() => setDetail(ext)}
														onInstall={() => handleInstall(ext)}
													/>
												))}
											</div>
										</Section>

										<Section
											title="Bladeren per categorie"
										>
											<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
												{CATEGORIES_ORDER.filter((c) => counts.get(c)).map(
													(cat) => (
														<CategoryTile
															key={cat}
															cat={cat}
															count={counts.get(cat) ?? 0}
															onClick={() => setCollection(cat)}
														/>
													),
												)}
											</div>
										</Section>
									</>
								) : (
									<Section
										title={collectionLabel(collection)}
										subtitle={`${filtered.length} ${
											filtered.length === 1 ? "app" : "apps"
										}`}
									>
										{filtered.length === 0 ? (
											<div className="hatch rounded-xl bg-glacier/40 px-10 py-16 text-center">
												<p className="font-medium text-base text-ink">
													Nog geen apps in deze collectie
												</p>
												<p className="mt-1 text-base text-ink-3">
													Bekijk een andere categorie of zoek naar iets
													specifieks.
												</p>
											</div>
										) : (
											<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
												{filtered.map((ext) => (
													<AppCard
														key={ext.id}
														ext={ext}
														installed={isInstalled(ext.id)}
														soon={soon(ext.id)}
														onOpenDetails={() => setDetail(ext)}
														onInstall={() => handleInstall(ext)}
														onUninstall={() => handleUninstall(ext)}
													/>
												))}
											</div>
										)}
									</Section>
								)}

								<ManageFooter onClose={closeModal} />
							</div>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			<AppDetailModal
				extension={detail}
				open={!!detail}
				onOpenChange={(o) => {
					if (!o) setDetail(null);
				}}
			/>
			<FeedbackDialog open={feedback} onOpenChange={setFeedback} />
			<LegalDialog open={legal} onOpenChange={setLegal} />
		</>
	);
}

/* ─────────────────────────────────────────────────────────────────────
   Hero featured app — drenched in the brand's own color (or our dark
   atmosphere when no color is known). Big logo, lead tagline, install
   CTA, secondary "Learn more". One big visual moment per session.
   ──────────────────────────────────────────────────────────────────── */
function HeroFeatured({
	ext,
	installed,
	soon,
	onInstall,
	onUninstall,
	onOpenDetails,
}: {
	ext: Extension;
	installed: boolean;
	soon: boolean;
	onInstall: () => void;
	onUninstall: () => void;
	onOpenDetails: () => void;
}) {
	const brand = brandFor(ext.id, ext.name);
	const kind = KIND_FOR[ext.id] ?? "Integration";

	return (
		<section
			className="relative isolate flex min-h-[200px] items-center justify-between gap-8 overflow-hidden rounded-xl px-8 py-7"
			style={{ backgroundColor: brand.color }}
		>
			{/* atmosphere — a soft second-tone orb */}
			<div
				className="pointer-events-none absolute top-[-30%] right-[-5%] -z-10 size-[420px] rounded-full opacity-50 blur-3xl"
				style={{
					background:
						"radial-gradient(closest-side, rgba(255,255,255,0.25) 0%, transparent 70%)",
				}}
				aria-hidden
			/>
			<div
				className="pointer-events-none absolute inset-0 -z-10 bg-dot-grid opacity-[0.07]"
				aria-hidden
			/>

			<div className="flex max-w-[58ch] flex-col gap-3.5">
				<div className="flex items-center gap-2 font-medium text-sm text-mesh-ink/80 leading-none tracking-[0.04em]">
					<Sparkles className="size-3.5" strokeWidth={2} />
					<span>Keuze van de redactie · {KIND_LABEL[kind]}</span>
				</div>
				<h2 className="font-medium text-[clamp(22px,2.6vw,30px)] text-mesh-ink leading-[1.1] tracking-[-0.6px]">
					{ext.name}
				</h2>
				<p className="max-w-[52ch] text-base text-mesh-ink/85 leading-[1.5]">
					{ext.tagline}
				</p>
				<div className="mt-1 flex items-center gap-2.5">
					{soon ? (
						<SoonChip dark />
					) : installed ? (
						<button
							type="button"
							onClick={onUninstall}
							className="flex h-10 items-center gap-1.5 rounded-lg bg-mesh-ink/12 px-4 font-medium text-base text-mesh-ink leading-none tracking-[-0.1px] transition-colors hover:bg-mesh-ink/20"
						>
							<CheckCircle2 className="size-3.5" strokeWidth={2} />
							Geïnstalleerd
						</button>
					) : (
						<button
							type="button"
							onClick={onInstall}
							className="flex h-10 items-center gap-1.5 rounded-lg bg-paper px-4 font-medium text-base text-ink leading-none tracking-[-0.1px] shadow-primary transition-colors hover:bg-arc-tint hover:text-arc-ink"
						>
							{ext.name} installeren
							<ArrowRight className="size-3.5" strokeWidth={2} />
						</button>
					)}
					<button
						type="button"
						onClick={onOpenDetails}
						className="flex h-10 items-center gap-1.5 rounded-lg px-3.5 font-medium text-base text-mesh-ink/85 leading-none tracking-[-0.1px] transition-colors hover:bg-mesh-ink/10 hover:text-mesh-ink"
					>
						Meer informatie
					</button>
				</div>
			</div>

			<div className="hidden shrink-0 md:block">
				<BrandLogo extId={ext.id} name={ext.name} size={112} />
			</div>
		</section>
	);
}

/* ─────────────────────────────────────────────────────────────────────
   App card — the regular grid card. Real colored logo (or branded
   initial tile), tagline, footer with rating/installs and the install
   pill. Card hover lifts subtly via ring + bg shift.
   ──────────────────────────────────────────────────────────────────── */
function AppCard({
	ext,
	installed,
	soon,
	onOpenDetails,
	onInstall,
	onUninstall,
}: {
	ext: Extension;
	installed: boolean;
	soon: boolean;
	onOpenDetails: () => void;
	onInstall: () => void;
	onUninstall: () => void;
}) {
	const kind = KIND_FOR[ext.id] ?? "Integration";
	const style = KIND_STYLE[kind];
	const vendor = vendorName(ext.name);
	const badge = BADGE_FOR[ext.id];

	return (
		<article className="group flex flex-col overflow-hidden rounded-xl bg-mist transition-colors hover:bg-ink/6">
			<button
				type="button"
				onClick={onOpenDetails}
				className="flex flex-1 flex-col gap-3 px-4 pt-4 pb-3 text-left"
				aria-label={`Details van ${ext.name} bekijken`}
			>
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-center gap-3">
						<BrandLogo extId={ext.id} name={ext.name} size={40} />
						<div className="flex min-w-0 flex-col">
							<span className="truncate font-semibold text-base text-ink leading-[1.2] tracking-[-0.1px]">
								{ext.name}
							</span>
							<span className="truncate text-sm text-ink-3 leading-[1.4]">
								Door {vendor}
							</span>
						</div>
					</div>
					<div className="flex flex-col items-end gap-1.5">
						<span
							className="inline-flex h-5 items-center justify-center rounded-md px-2 font-medium text-xs leading-[1.2] tracking-[-0.05px]"
							style={{ backgroundColor: style.bg, color: style.text }}
						>
							{KIND_LABEL[kind]}
						</span>
						{badge ? (
							<span className="inline-flex items-center gap-1 rounded-md bg-mist px-1.5 py-0.5 font-medium text-xs text-ink-3 leading-[1.2]">
								<Star className="size-2.5" strokeWidth={2} />
								{BADGE_LABEL[badge]}
							</span>
						) : null}
					</div>
				</div>
				<p className="line-clamp-2 text-base text-ink-2 leading-[1.5]">
					{ext.tagline}
				</p>
			</button>
			<div className="flex items-center justify-between px-4 pt-1 pb-3">
				<div className="flex items-center gap-2.5 font-medium text-sm text-ink-2">
					<div className="flex items-center gap-1">
						<Star
							className="size-3 fill-signal-amber text-signal-amber"
							strokeWidth={1.75}
						/>
						<span className="tabular-nums">{ext.rating.toLocaleString("nl-NL")}</span>
					</div>
					<span aria-hidden className="text-ink-3">
						·
					</span>
					<div className="flex items-center gap-1">
						<Download className="size-3 text-ink-3" strokeWidth={1.75} />
						<span className="tabular-nums">
							{formatInstalls(ext.install_count)}
						</span>
					</div>
				</div>
				{soon ? (
					<SoonChip />
				) : installed ? (
					<button
						type="button"
						onClick={onUninstall}
						className="group/installed flex items-center gap-1.5 rounded-md py-1 font-medium text-sm text-ink-2 leading-[1.2]"
					>
						<CheckCircle2
							className="size-3 text-signal-green group-hover/installed:hidden"
							strokeWidth={2}
						/>
						<span className="group-hover/installed:hidden">Geïnstalleerd</span>
						<span className="hidden text-signal-red group-hover/installed:inline">
							Verwijderen
						</span>
					</button>
				) : (
					<button
						type="button"
						onClick={onInstall}
						className="flex h-7 items-center justify-center rounded-md bg-ink px-3 font-medium text-sm text-mesh-ink leading-[1.2] tracking-[-0.1px] transition-colors hover:bg-abyss active:scale-[0.98]"
					>
						Installeren
					</button>
				)}
			</div>
		</article>
	);
}

/* ─────────────────────────────────────────────────────────────────────
   Trending pill — horizontal scrollable row of compact, square-ish
   pills. Numbered rank in the corner so the row reads as a leaderboard.
   ──────────────────────────────────────────────────────────────────── */
function TrendingPill({
	ext,
	rank,
	installed,
	soon,
	onOpenDetails,
	onInstall,
}: {
	ext: Extension;
	rank: number;
	installed: boolean;
	soon: boolean;
	onOpenDetails: () => void;
	onInstall: () => void;
}) {
	return (
		<article className="flex w-[260px] shrink-0 flex-col gap-3 rounded-xl bg-glacier/60 p-4 transition-all hover:-translate-y-0.5 hover:bg-paper hover:ring-arc/30">
			<div className="flex items-start justify-between gap-3">
				<BrandLogo extId={ext.id} name={ext.name} size={36} />
				<span
					role="img"
					aria-label={`Plaats ${rank}`}
					className="font-medium tabular-nums text-xs text-ink-3 tabular-nums leading-none tracking-[0.04em]"
				>
					#{String(rank).padStart(2, "0")}
				</span>
			</div>
			<button
				type="button"
				onClick={onOpenDetails}
				className="flex flex-1 flex-col items-start gap-1 text-left"
			>
				<span className="font-semibold text-base text-ink leading-[1.2] tracking-[-0.1px]">
					{ext.name}
				</span>
				<span className="line-clamp-2 text-sm text-ink-3 leading-[1.4]">
					{ext.tagline}
				</span>
			</button>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1 tabular-nums font-medium text-xs text-ink-3 tabular-nums">
					<Download className="size-3" strokeWidth={1.75} />
					<span>{formatInstalls(ext.install_count)}</span>
				</div>
				{soon ? (
					<SoonChip />
				) : installed ? (
					<span className="inline-flex items-center gap-1 font-medium text-xs text-signal-green">
						<CheckCircle2 className="size-3" strokeWidth={2} />
						Geïnstalleerd
					</span>
				) : (
					<button
						type="button"
						onClick={onInstall}
						className="font-medium text-sm text-arc-ink leading-none tracking-[-0.05px] hover:underline"
					>
						Installeren →
					</button>
				)}
			</div>
		</article>
	);
}

/* ─────────────────────────────────────────────────────────────────────
   Category tile — colored gradient tile per category. Click filters
   the grid by that category. Variety here is the whole point: each
   tile feels distinct because each category has its own hue.
   ──────────────────────────────────────────────────────────────────── */
function CategoryTile({
	cat,
	count,
	onClick,
}: {
	cat: AppCategory;
	count: number;
	onClick: () => void;
}) {
	const theme = CATEGORY_THEME[cat];
	const isDark = cat === "ai";
	return (
		<button
			type="button"
			onClick={onClick}
			className="group relative flex h-[120px] flex-col justify-between overflow-hidden rounded-xl p-4 text-left transition-all hover:-translate-y-0.5 hover:ring-arc/30"
			style={{
				background: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 100%)`,
			}}
		>
			<span
				className="font-medium text-sm leading-none"
				style={{ color: isDark ? "var(--mesh-ink-2)" : theme.ink }}
			>
				{count} {count === 1 ? "app" : "apps"}
			</span>
			<div className="flex flex-col gap-1.5">
				<span
					className="font-medium text-md"
					style={{ color: isDark ? "var(--mesh-ink)" : "var(--abyss)" }}
				>
					{CATEGORY_LABEL[cat]}
				</span>
				<span
					className="inline-flex items-center gap-1 font-medium text-xs leading-none tracking-[-0.05px] opacity-80 transition-opacity group-hover:opacity-100"
					style={{ color: isDark ? "var(--mesh-ink-2)" : theme.ink }}
				>
					Bekijken <ArrowRight className="size-3" strokeWidth={2} />
				</span>
			</div>
		</button>
	);
}

/* ─────────────────────────────────────────────────────────────────────
   Section header + footer + small bits.
   ──────────────────────────────────────────────────────────────────── */
function Section({
	title,
	subtitle,
	onShowAll,
	children,
}: {
	title: string;
	subtitle?: string;
	onShowAll?: () => void;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3.5">
			<div className="flex items-end justify-between gap-4">
				<div className="flex flex-col gap-0.5">
					<h2 className="font-medium text-lg text-ink leading-[1.15] tracking-[-0.3px]">
						{title}
					</h2>
					{subtitle ? (
						<span className="text-sm text-ink-3 leading-[1.4]">
							{subtitle}
						</span>
					) : null}
				</div>
				{onShowAll ? (
					<button
						type="button"
						onClick={onShowAll}
						className="flex shrink-0 items-center gap-1 font-medium text-sm text-arc-ink leading-none tracking-[-0.05px] hover:underline"
					>
						Alles tonen <ArrowRight className="size-3" strokeWidth={2} />
					</button>
				) : null}
			</div>
			{children}
		</section>
	);
}

function ManageFooter({ onClose }: { onClose: () => void }) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-xl bg-glacier/60 px-5 py-4 ">
			<div className="flex flex-col gap-0.5">
				<span className="font-medium text-base text-ink leading-none tracking-[-0.1px]">
					Geïnstalleerde apps beheren
				</span>
			</div>
			<Link
				to="/settings/apps"
				onClick={onClose}
				className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-paper px-3.5 font-medium text-base text-ink leading-none tracking-[-0.1px] transition-colors hover:bg-mist"
			>
				Instellingen openen
				<ArrowUpRight className="size-3.5" strokeWidth={1.75} />
			</Link>
		</div>
	);
}

function HeaderAction({
	label,
	onClick,
	icon,
}: {
	label: string;
	onClick: () => void;
	icon: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			className="flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-mist hover:text-ink"
		>
			{icon}
		</button>
	);
}

function SidebarHeading({ children }: { children: React.ReactNode }) {
	return (
		<div className="px-2 pt-1 pb-1.5 font-medium text-xs text-ink-3 leading-none tracking-[0.04em]">
			{children}
		</div>
	);
}

function CollectionRow({
	label,
	icon: Icon,
	active,
	count,
	onClick,
}: {
	id: CollectionId;
	label: string;
	icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
	active: boolean;
	count?: number;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors",
				active
					? "bg-paper text-ink"
					: "text-ink-3 hover:bg-ink/6 hover:text-ink",
			)}
		>
			{Icon ? (
				<Icon
					className={cn(
						"size-3.5 shrink-0",
						active ? "text-arc-ink" : "text-ink-3",
					)}
					strokeWidth={1.75}
				/>
			) : (
				<span
					className={cn(
						"size-1.5 shrink-0 rounded-full",
						active ? "bg-arc" : "bg-ink-4",
					)}
				/>
			)}
			<span className="flex-1 truncate font-medium text-base leading-none tracking-[-0.1px]">
				{label}
			</span>
			{count !== undefined ? (
				<span
					className={cn(
						"shrink-0 tabular-nums font-medium text-xs tabular-nums leading-none",
						active ? "text-ink-3" : "text-ink-3",
					)}
				>
					{count >= 200 ? "200+" : count}
				</span>
			) : null}
		</button>
	);
}

/* The catalogue while the console reads it: the hero and a grid of cards, in their own shapes. */
function CatalogSkeleton() {
	return (
		<div className="flex flex-col gap-8" aria-busy="true" aria-label="Marketplace laden">
			<Skeleton className="h-[200px] rounded-xl" />
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 6 }, (_, i) => (
					<Skeleton key={i} className="h-[148px] rounded-xl" />
				))}
			</div>
		</div>
	);
}

function collectionLabel(c: CollectionId) {
	const top = TOP_COLLECTIONS.find((t) => t.id === c);
	if (top) return top.label;
	return CATEGORY_LABEL[c as AppCategory] ?? "Apps";
}
