import { BrandLogo } from "./brand-logos";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "../../components/dialog";
import { useRef, useState } from "react";
import { ArrowUpRight, Check, CheckCircle2, ExternalLink, Lock, Star } from "../../icons";
import { toast } from "sonner";
import { useMarketplaceState } from "../hooks/use-marketplace-state";
import type { Extension } from "../lib/types/domain";
import { useSettings } from "../stores/settings-store";
import {
	FEATURES_FOR,
	formatInstalls,
	KIND_FOR,
	KIND_LABEL,
	KIND_STYLE,
	PERMISSIONS_FOR,
	PRICING_FOR,
	VENDOR_URL,
	vendorName,
} from "./app-catalog";
import { OpenAppDialog } from "./marketplace-dialogs";

export function AppDetailModal({
	extension,
	open,
	onOpenChange,
}: {
	extension: Extension | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { isInstalled, install, uninstall, markOpened } = useMarketplaceState();
	const popup = useRef<HTMLDivElement>(null);
	const [running, setRunning] = useState(false);
	const revokedScopes = useSettings((s) => s.revokedScopes);

	if (!extension) return null;

	const ext = extension;
	const kind = KIND_FOR[ext.id] ?? "Integration";
	const style = KIND_STYLE[kind];
	const installed = isInstalled(ext.id);
	const features = FEATURES_FOR[ext.id] ?? [];
	// An installed app lists only the scopes it still holds; the rest were taken back in Settings.
	const revoked = installed ? (revokedScopes[ext.id] ?? []) : [];
	const permissions = (PERMISSIONS_FOR[ext.id] ?? []).filter((p) => !revoked.includes(p));
	const pricing = PRICING_FOR[ext.id] ?? "Neem contact op met de aanbieder";
	const vendor = vendorName(ext.name);
	const url = VENDOR_URL[ext.id];

	function handleInstall() {
		install(ext.id);
		toast.success(`${ext.name} geïnstalleerd`);
	}

	function handleUninstall() {
		uninstall(ext.id);
		toast(`${ext.name} verwijderd`);
	}

	function handleOpen() {
		markOpened(ext.id);
		setRunning(true);
	}

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent
					ref={popup}
					/* The record, not the vendor link, takes focus on open: Base UI's default is the first
					   tabbable control, which drew a focus ring around a URL nobody reached for. */
					initialFocus={popup}
					className="max-w-[560px] gap-0 overflow-hidden p-0 sm:max-w-[560px]"
				>
					<header className="flex items-start gap-3.5 px-5 pt-5 pr-14 pb-4">
						<BrandLogo extId={ext.id} name={ext.name} size={44} />
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<div className="flex items-center gap-2">
								<DialogTitle className="font-medium text-lg text-ink leading-tight">{ext.name}</DialogTitle>
								<span
									className="inline-flex h-5 items-center rounded-sm px-1.5 font-medium text-xs"
									style={{ backgroundColor: style.bg, color: style.text }}
								>
									{KIND_LABEL[kind]}
								</span>
							</div>
							<DialogDescription className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink-2">
								<span>Door {vendor}</span>
								{url ? (
									<>
										<span aria-hidden className="text-ink-4">·</span>
										<a
											href={`https://${url}`}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-1 rounded-sm text-arc-ink underline-offset-2 hover:underline"
										>
											{url}
											<ExternalLink className="size-3" strokeWidth={2} />
										</a>
									</>
								) : null}
							</DialogDescription>
						</div>
					</header>

					{/* The facts an operator compares apps on, as one quiet band rather than a row of chips. */}
					<dl className="mx-5 grid grid-cols-[auto_auto_minmax(0,1fr)] rounded-lg bg-mist">
						<Fact label="Beoordeling">
							<Star className="size-3.5 fill-signal-amber text-signal-amber" strokeWidth={1.75} />
							{ext.rating.toLocaleString("nl-NL")}
						</Fact>
						<Fact label="Installaties">{formatInstalls(ext.install_count).replace(/ installaties?$/i, "")}</Fact>
						<Fact label="Prijs">{pricing}</Fact>
					</dl>

					<div className="flex max-h-[52vh] flex-col gap-5 overflow-y-auto px-5 pt-5 pb-5">
						<p className="text-base text-ink leading-relaxed">{ext.tagline}</p>

						{features.length > 0 ? (
							<section className="flex flex-col gap-2">
								<h3 className="font-medium text-sm text-ink-2">Wat het doet</h3>
								<ul className="flex flex-col gap-1.5">
									{features.map((f) => (
										<li key={f} className="flex items-start gap-2.5 text-base text-ink leading-snug">
											<Check className="mt-0.5 size-4 shrink-0 text-arc-ink" strokeWidth={2} />
											<span>{f}</span>
										</li>
									))}
								</ul>
							</section>
						) : null}

						{permissions.length > 0 ? (
							<section className="flex flex-col gap-2">
								<h3 className="flex items-center gap-1.5 font-medium text-sm text-ink-2">
									<Lock className="size-3.5" strokeWidth={1.75} />
									{installed ? "De app kan" : "De app kan straks"}
								</h3>
								<ul className="flex flex-col overflow-hidden rounded-lg">
									{permissions.map((p) => (
										<li key={p} className="px-3 py-2 text-base text-ink leading-snug odd:bg-mist">
											{p}
										</li>
									))}
								</ul>
								<p className="text-sm text-ink-3">Trek de toegang altijd in via Instellingen, dan Apps.</p>
							</section>
						) : null}
					</div>

					<footer className="flex items-center justify-between gap-3 bg-mist px-5 py-3">
						{installed ? (
							<span className="flex items-center gap-1.5 font-medium text-sm text-signal-green">
								<CheckCircle2 className="size-4" strokeWidth={2} />
								Geïnstalleerd
							</span>
						) : (
							<span className="text-sm text-ink-2">Binnen seconden geïnstalleerd. Geen developer nodig.</span>
						)}
						<div className="flex items-center gap-1.5">
							{installed ? (
								<>
									<button
										type="button"
										onClick={handleUninstall}
										className="flex h-9 items-center rounded-lg px-3 font-medium text-base text-signal-red transition-colors hover:bg-signal-red-bg"
									>
										Verwijderen
									</button>
									<button
										type="button"
										onClick={handleOpen}
										className="flex h-9 items-center gap-1.5 rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2"
									>
										{ext.name} openen
										<ArrowUpRight className="size-4" strokeWidth={2} />
									</button>
								</>
							) : (
								<button
									type="button"
									onClick={handleInstall}
									className="flex h-9 items-center rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2"
								>
									{ext.name} installeren
								</button>
							)}
						</div>
					</footer>
				</DialogContent>
			</Dialog>
			<OpenAppDialog extension={ext} open={running} onOpenChange={setRunning} />
		</>
	);
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5 px-3.5 py-2.5">
			<dt className="font-medium text-xs text-ink-3">{label}</dt>
			<dd className="flex items-center gap-1 font-medium text-base text-ink tabular-nums">{children}</dd>
		</div>
	);
}
