import { BrandLogo } from "../marketplace/brand-logos";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { Link } from "@tanstack/react-router";
import {
	ArrowUpRight,
	ExternalLink,
	Lock,
	MoreVertical,
	Trash2,
} from "../../icons";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	KIND_FOR,
	KIND_LABEL,
	KIND_STYLE,
	vendorName,
} from "../marketplace/app-catalog";
import { AppDetailModal } from "../marketplace/app-detail-modal";
import { OpenAppDialog, PermissionsDialog } from "../marketplace/marketplace-dialogs";
import { SettingCard } from "./setting-card";
import { useMarketplaceState } from "../hooks/use-marketplace-state";
import { extensions as allExtensions } from "../../data-source";
import type { Extension } from "../lib/types/domain";
import { cn } from "../lib/utils";

export function SettingsAppsPage() {
	const { records, isInstalled, uninstall, markOpened } = useMarketplaceState();
	const [detail, setDetail] = useState<Extension | null>(null);
	const [permissionsFor, setPermissionsFor] = useState<Extension | null>(null);
	const [running, setRunning] = useState<Extension | null>(null);

	const installed = useMemo(
		() => allExtensions.filter((e) => isInstalled(e.id)),
		[isInstalled],
	);

	return (
		<>
			<SettingCard
				title="Apps"
				action={
					<Link
						to="/marketplace"
						className="flex h-8 items-center gap-1.5 rounded-md bg-paper px-3 font-medium text-base text-ink hover:bg-mist"
					>
						Marketplace bekijken
						<ArrowUpRight className="size-4" strokeWidth={1.75} />
					</Link>
				}
			>
				{installed.length === 0 ? (
					<div className="hatch flex flex-col items-center justify-center gap-3 rounded-xl bg-paper px-10 py-12 text-center">
						<p className="font-medium text-base text-ink">
							Nog geen apps geïnstalleerd
						</p>
						<p className="max-w-[380px] text-base text-ink-3 leading-[1.6]">
							Koppelingen voor e-mail, retouren, afhandeling, fraude en meer.
						</p>
						<Link
							to="/marketplace"
							className="mt-1 flex h-8 items-center gap-2 rounded-md bg-abyss px-3 font-medium text-base text-mesh-ink shadow-primary transition hover:bg-abyss-2 active:scale-[0.98]"
						>
							Marketplace bekijken
						</Link>
					</div>
				) : (
					<ul className="overflow-hidden rounded-xl ">
						{installed.map((ext, i) => (
							<AppRow
								key={ext.id}
								ext={ext}
								installedAt={records[ext.id]?.installedAt}
								lastOpenedAt={records[ext.id]?.lastOpenedAt}
								last={i === installed.length - 1}
								onOpen={() => {
									markOpened(ext.id);
									setRunning(ext);
								}}
								onViewDetails={() => setDetail(ext)}
								onPermissions={() => setPermissionsFor(ext)}
								onUninstall={() => {
									uninstall(ext.id);
									toast(`${ext.name} verwijderd`);
								}}
							/>
						))}
					</ul>
				)}
			</SettingCard>

			<AppDetailModal
				extension={detail}
				open={!!detail}
				onOpenChange={(o) => {
					if (!o) setDetail(null);
				}}
			/>
			<PermissionsDialog
				extension={permissionsFor}
				open={!!permissionsFor}
				onOpenChange={(o) => {
					if (!o) setPermissionsFor(null);
				}}
			/>
			<OpenAppDialog
				extension={running}
				open={!!running}
				onOpenChange={(o) => {
					if (!o) setRunning(null);
				}}
			/>
		</>
	);
}

function AppRow({
	ext,
	installedAt,
	lastOpenedAt,
	last,
	onOpen,
	onViewDetails,
	onPermissions,
	onUninstall,
}: {
	ext: Extension;
	installedAt?: string;
	lastOpenedAt?: string;
	last: boolean;
	onOpen: () => void;
	onViewDetails: () => void;
	onPermissions: () => void;
	onUninstall: () => void;
}) {
	const kind = KIND_FOR[ext.id] ?? "Integration";
	const style = KIND_STYLE[kind];
	return (
		<li
			className={cn(
				"flex items-center justify-between gap-3 bg-paper px-4 py-3",
				!last && "border-hairline border-b",
			)}
		>
			<button
				type="button"
				onClick={onViewDetails}
				className="flex min-w-0 flex-1 items-center gap-3 text-left"
			>
				<BrandLogo extId={ext.id} name={ext.name} size={36} />
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<p className="truncate font-medium text-base text-ink leading-[1.4]">
							{ext.name}
						</p>
						<span
							className="inline-flex h-5 items-center justify-center rounded-md px-2 py-1.5 font-medium text-sm"
							style={{ backgroundColor: style.bg, color: style.text }}
						>
							{KIND_LABEL[kind]}
						</span>
					</div>
					<p className="truncate font-normal text-sm text-ink-3 leading-[1.4]">
						Door {vendorName(ext.name)} · Geïnstalleerd {formatWhen(installedAt)}
						{lastOpenedAt
							? ` · Laatst geopend ${formatWhen(lastOpenedAt)}`
							: " · Nooit geopend"}
					</p>
				</div>
			</button>
			<div className="flex shrink-0 items-center gap-1">
				<button
					type="button"
					onClick={onOpen}
					className="flex h-8 items-center gap-1.5 rounded-md bg-paper px-3 font-medium text-base text-ink hover:bg-mist"
				>
					<ExternalLink className="size-3.5" strokeWidth={1.75} />
					Openen
				</button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={`${ext.name} beheren`}
							className="flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-mist hover:text-ink"
						>
							<MoreVertical className="size-4" strokeWidth={1.75} />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<DropdownMenuItem onClick={onViewDetails}>
							<ExternalLink className="size-3.5" /> Details bekijken
						</DropdownMenuItem>
						<DropdownMenuItem onClick={onPermissions}>
							<Lock className="size-3.5" /> App-rechten
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onClick={onUninstall}>
							<Trash2 className="size-3.5" /> Verwijderen
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</li>
	);
}

function formatWhen(iso?: string) {
	if (!iso) return "-";
	const d = new Date(iso);
	const diff = Date.now() - d.getTime();
	const min = Math.round(diff / 60_000);
	if (min < 1) return "zojuist";
	if (min < 60) return `${min} min geleden`;
	const hr = Math.round(min / 60);
	if (hr < 24) return `${hr} uur geleden`;
	const day = Math.round(hr / 24);
	if (day < 7) return `${day === 1 ? "1 dag" : `${day} dagen`} geleden`;
	return new Intl.DateTimeFormat("nl-NL", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(d);
}
