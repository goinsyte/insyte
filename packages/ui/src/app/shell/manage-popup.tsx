import { BrandLogo } from "../marketplace/brand-logos";
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "../../components/dialog";
import {
	ArrowDown,
	ArrowUp,
	Check,
	Eye,
	EyeOff,
	Keyboard,
	Lock,
	type IconComponent,
	Moon,
	Pin,
	PinOff,
	Sun,
	SunMoon,
} from "../../icons";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MAX_RAIL_ADDONS, type ThemeMode } from "../hooks/use-nav-prefs";
import { RAIL_BY_PERSONA } from "../lib/app-shell-config";
import { initials } from "../lib/format";
import type { Presence } from "../../data-source";
import { personStyle } from "../lib/person-color";
import { cn } from "../lib/utils";
import { MAX_PINNED_FRIENDS } from "../lib/nav-limits";
import { useExtensions, useMarketplaceState, useNavPrefs, usePersonaSelection, useShellData } from "./state";

export type ManageTab = "apps" | "people" | "view" | "theme";

const LOCKED_ROUTES = new Set(["/dashboard"]);

const PRESENCE_DOT: Record<Presence, string> = {
	online: "bg-signal-green",
	away: "bg-signal-amber",
	offline: "bg-ink-4",
};
const PRESENCE_LABEL: Record<Presence, string> = {
	online: "Online",
	away: "Afwezig",
	offline: "Offline",
};

export function ManagePopup({
	open,
	onOpenChange,
	initialTab = "apps",
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialTab?: ManageTab;
}) {
	const [tab, setTab] = useState<ManageTab>(initialTab);
	useEffect(() => {
		if (open) setTab(initialTab);
	}, [open, initialTab]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[600px] gap-0 overflow-hidden p-0 sm:max-w-[600px]">
				{/* One heading and a segmented switch on `mist` — the eyebrow, the 20px title and the
				   underlined tab strip with its two rules were three rows of chrome over four tabs. */}
				<header className="flex flex-col gap-3 px-5 pt-5 pb-1">
					<DialogTitle className="font-medium text-lg text-ink leading-tight">Werkruimte beheren</DialogTitle>
					<div role="tablist" aria-label="Beheren" className="inline-flex self-start rounded-lg bg-mist p-0.5">
						{(
							[
								{ id: "apps", label: "Apps" },
								{ id: "people", label: "Mensen" },
								{ id: "view", label: "Weergave" },
								{ id: "theme", label: "Thema" },
							] as Array<{ id: ManageTab; label: string }>
						).map((t) => {
							const active = tab === t.id;
							return (
								<button
									key={t.id}
									type="button"
									role="tab"
									aria-selected={active}
									onClick={() => setTab(t.id)}
									className={cn(
										"flex h-7 items-center rounded-md px-3 font-medium text-sm transition-colors",
										active ? "bg-paper text-ink" : "text-ink-2 hover:text-ink",
									)}
								>
									{t.label}
								</button>
							);
						})}
					</div>
				</header>

				<div className="max-h-[60vh] overflow-y-auto px-5 pt-3 pb-5">
					{tab === "apps" ? <AppsTab /> : null}
					{tab === "people" ? <PeopleTab /> : null}
					{tab === "view" ? <ViewTab /> : null}
					{tab === "theme" ? <ThemeTab /> : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function AppsTab() {
	const allExtensions = useExtensions();
	const { installedIds } = useMarketplaceState();
	const { isAddonPinned, pinnedCount, togglePinned } = useNavPrefs();
	const installedApps = allExtensions.filter((e) =>
		installedIds.includes(e.id),
	);
	const pinned = pinnedCount(installedIds);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h3 className="font-semibold text-md text-ink leading-[1.2] tracking-[-0.1px]">
					Apps vastzetten op de rail
				</h3>
				<p className="text-base text-ink-2 leading-[1.55]">
					Vaak gebruikte Marketplace-apps kun je vastzetten op de iconenrail,
					met één klik bereikbaar. Er passen er maximaal {MAX_RAIL_ADDONS}.
				</p>
			</div>

			<div className="flex items-center justify-between rounded-lg bg-mist px-3.5 py-2.5">
				<div className="flex items-center gap-2.5">
					<Pip count={pinned} max={MAX_RAIL_ADDONS} />
					<span className="font-medium text-base text-ink leading-[1.2] tracking-[-0.1px]">
						{pinned} / {MAX_RAIL_ADDONS} plekken op de rail gebruikt
					</span>
				</div>
				<span className="text-sm text-ink-3">
					{installedApps.length} geïnstalleerd
				</span>
			</div>

			{installedApps.length === 0 ? (
				<div className="hatch rounded-xl bg-paper px-4 py-6 text-center text-base text-ink-3">
					Nog geen Marketplace-apps geïnstalleerd. Bekijk de Marketplace om er
					enkele te installeren.
				</div>
			) : (
				<ul className="flex flex-col gap-1.5">
					{installedApps.map((app) => {
						const pinnedNow = isAddonPinned(app.id);
						return (
							<li
								key={app.id}
								className="flex items-center gap-3 rounded-lg bg-paper px-3.5 py-3"
							>
								<BrandLogo extId={app.id} name={app.name} size={36} />
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="truncate font-medium text-base text-ink leading-[1.2] tracking-[-0.1px]">
										{app.name}
									</span>
									<span className="truncate text-sm text-ink-3 leading-[1.4]">
										Marketplace-add-on
									</span>
								</div>
								<button
									type="button"
									onClick={() => {
										const ok = togglePinned(app.id, installedIds);
										if (!ok) {
											toast.error("De rail is vol · maak eerst een andere app los");
										} else {
											toast(
												pinnedNow
													? `${app.name} losgemaakt van de rail`
													: `${app.name} vastgezet op de rail`,
											);
										}
									}}
									className={cn(
										"flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-sm leading-[1.2] tracking-[-0.1px]",
										pinnedNow
											? "bg-arc-tint text-arc-ink hover:bg-arc-soft"
											: "bg-mist text-ink-2 hover:bg-hairline hover:text-ink",
									)}
								>
									{pinnedNow ? (
										<>
											<Pin className="size-3" strokeWidth={2} />
											Vastgezet
										</>
									) : (
										<>
											<PinOff className="size-3" strokeWidth={2} />
											Vastzetten
										</>
									)}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

function ViewTab() {
	const { persona } = usePersonaSelection();
	const railItems = RAIL_BY_PERSONA[persona];
	const {
		state,
		isHidden,
		toggleHidden,
		moveRailItem,
		sortedRail,
		setShortcut,
	} = useNavPrefs();
	const allKeys = railItems.map((i) => i.to);
	const ordered = sortedRail(allKeys);
	const itemByKey = new Map(railItems.map((i) => [i.to, i] as const));

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h3 className="font-semibold text-md text-ink leading-[1.2] tracking-[-0.1px]">
					Onderdelen van de rail
				</h3>
				<p className="text-base text-ink-2 leading-[1.55]">
					Toon of verberg, herschik en stel sneltoetsen in voor elke
					functie in de iconenrail.
				</p>
			</div>

			<ul className="flex flex-col gap-1.5">
				{ordered.map((key, idx) => {
					const item = itemByKey.get(key);
					if (!item) return null;
					const Icon: IconComponent = item.icon;
					const hidden = isHidden(item.to);
					const locked = LOCKED_ROUTES.has(item.to);
					const sc = state.shortcuts[item.to];
					return (
						<li
							key={item.to}
							className={cn(
								"flex items-center gap-3 rounded-lg bg-paper px-3.5 py-3",
								hidden && "opacity-60",
							)}
						>
							<div className="flex flex-col">
								<button
									type="button"
									aria-label="Omhoog"
									disabled={idx === 0}
									onClick={() => moveRailItem(item.to, "up", allKeys)}
									className="flex size-5 items-center justify-center rounded text-ink-3 hover:bg-mist hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
								>
									<ArrowUp className="size-3" strokeWidth={2} />
								</button>
								<button
									type="button"
									aria-label="Omlaag"
									disabled={idx === ordered.length - 1}
									onClick={() => moveRailItem(item.to, "down", allKeys)}
									className="flex size-5 items-center justify-center rounded text-ink-3 hover:bg-mist hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
								>
									<ArrowDown className="size-3" strokeWidth={2} />
								</button>
							</div>
							<span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-mist">
								<Icon className="size-4 text-ink" strokeWidth={1.75} />
							</span>
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="truncate font-medium text-base text-ink leading-[1.2] tracking-[-0.1px]">
									{item.label}
								</span>
								<span className="truncate tabular-nums font-medium text-xs text-ink-3 leading-[1.4]">
									{item.to}
								</span>
							</div>
							<ShortcutButton
								shortcut={sc}
								onChange={(next) => setShortcut(item.to, next)}
							/>
							{locked ? (
								<span className="flex items-center gap-1 rounded-md bg-mist px-2 py-1 font-medium text-sm text-ink-3 leading-[1.2]">
									<Lock className="size-3" strokeWidth={2} />
									Verplicht
								</span>
							) : (
								<button
									type="button"
									aria-label={hidden ? "Tonen in de rail" : "Verbergen uit de rail"}
									onClick={() => toggleHidden(item.to)}
									className={cn(
										"flex size-7 items-center justify-center rounded-md",
										hidden
											? "bg-mist text-ink-3 hover:bg-hairline hover:text-ink"
											: "bg-arc-tint text-arc-ink hover:bg-arc-soft",
									)}
								>
									{hidden ? (
										<EyeOff className="size-3.5" strokeWidth={2} />
									) : (
										<Eye className="size-3.5" strokeWidth={2} />
									)}
								</button>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}

function ShortcutButton({
	shortcut,
	onChange,
}: {
	shortcut: { mod: string; key: string } | undefined;
	onChange: (next: { mod: string; key: string } | null) => void;
}) {
	const [recording, setRecording] = useState(false);

	function record() {
		setRecording(true);
		toast("Druk op een letter om de sneltoets in te stellen, of Esc om te annuleren");
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				cleanup();
				return;
			}
			if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
				e.preventDefault();
				const mod = e.metaKey ? "⌘" : e.ctrlKey ? "Ctrl" : "⌘";
				onChange({ mod, key: e.key.toUpperCase() });
				toast.success(`Sneltoets ingesteld: ${mod}+${e.key.toUpperCase()}`);
				cleanup();
			}
		}
		function cleanup() {
			window.removeEventListener("keydown", onKey, true);
			setRecording(false);
		}
		window.addEventListener("keydown", onKey, true);
	}

	if (recording) {
		return (
			<button
				type="button"
				onClick={() => setRecording(false)}
				className="flex h-7 items-center gap-1 rounded-md bg-arc-tint px-2 font-medium text-xs text-arc-ink leading-[1.2]"
			>
				Druk op een toets…
			</button>
		);
	}

	if (shortcut) {
		return (
			<button
				type="button"
				onClick={record}
				className="flex h-7 items-center gap-1 rounded-md bg-mist px-1.5 font-medium text-xs text-ink-2 leading-[1.2] hover:bg-hairline"
				title="Klik om te wijzigen"
			>
				<kbd className="rounded bg-paper px-1 py-0.5 ">
					{shortcut.mod}
				</kbd>
				<kbd className="rounded bg-paper px-1 py-0.5 ">
					{shortcut.key}
				</kbd>
			</button>
		);
	}

	return (
		<button
			type="button"
			onClick={record}
			aria-label="Sneltoets toevoegen"
			className="flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-mist hover:text-ink"
		>
			<Keyboard className="size-3.5" strokeWidth={1.75} />
		</button>
	);
}

function ThemeTab() {
	const { state, setThemeMode } = useNavPrefs();
	const modes: Array<{ id: ThemeMode; label: string; icon: IconComponent }> = [
		{ id: "light", label: "Licht", icon: Sun },
		{ id: "dark", label: "Donker", icon: Moon },
		{ id: "auto", label: "Auto", icon: SunMoon },
	];
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h3 className="font-semibold text-md text-ink leading-[1.2] tracking-[-0.1px]">
					Modus
				</h3>
				<p className="text-base text-ink-2 leading-[1.55]">
					Licht, donker, of volg je besturingssysteem.
				</p>
			</div>

			<div className="grid grid-cols-3 gap-3">
				{modes.map((m) => {
					const active = state.themeMode === m.id;
					return (
						<button
							key={m.id}
							type="button"
							onClick={() => {
								setThemeMode(m.id);
								toast.success(`Thema ingesteld op ${m.label.toLowerCase()}`);
							}}
							className={cn(
								"flex flex-col gap-3 rounded-xl border p-2 text-left transition-colors",
								active
									? "border-primary bg-arc-tint"
									: "border-hairline bg-paper hover:bg-mist",
							)}
						>
							<ThemePreview mode={m.id} />
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-1.5">
									<m.icon
										className={cn(
											"size-3.5",
											active ? "text-arc-ink" : "text-ink-3",
										)}
										strokeWidth={1.75}
									/>
									<span
										className={cn(
											"font-medium text-base",
											active ? "text-arc-ink" : "text-ink",
										)}
									>
										{m.label}
									</span>
								</div>
								{active ? (
									<Check className="size-3.5 text-arc-ink" strokeWidth={2} />
								) : null}
							</div>
						</button>
					);
				})}
			</div>

		</div>
	);
}

/*
 * The accent picker used to live here: eleven swatches, one of them called "Stripe navy", under a
 * line promising they "drive buttons, tabs, links, and selection state across the app". They drove
 * `--primary`, `--ring` and `--chart-1` — the generated shadcn dialect this console no longer reads
 * anywhere — so the control had been painting variables nothing rendered. A preference that does
 * nothing is worse than no preference, because the person believes it worked.
 *
 * It is not reconnected to `arc` and `abyss` instead: those two carry the brand, and the contrast
 * floor this product holds was measured against them, not against Bronze.
 */

/**
 * A thumbnail of each theme, painted in that theme rather than described in it.
 *
 * It used to branch on `isDark` and hand-mix the night values — `#0f0f11`, `#18181b`, `#9a9a9a` —
 * which meant the preview of the dark theme was a drawing of the dark theme rather than the dark
 * theme, and drifted the moment a surface moved. Scoping `.light` or `.dark` on the frame lets the
 * same four ordinary surface classes render either one, so the preview cannot disagree with what it
 * previews. `auto` shows both halves, split down the middle, which is what auto means.
 */
function ThemePreview({ mode }: { mode: ThemeMode }) {
	if (mode === "auto") {
		return (
			<div className="flex h-16 w-full overflow-hidden rounded-md">
				<div className="light w-1/2 overflow-hidden">
					<ThemePreviewFace />
				</div>
				<div className="dark w-1/2 overflow-hidden">
					<ThemePreviewFace />
				</div>
			</div>
		);
	}
	return (
		<div
			className={cn(
				"h-16 w-full overflow-hidden rounded-md",
				mode === "dark" ? "dark" : "light",
			)}
		>
			<ThemePreviewFace />
		</div>
	);
}

/** The miniature itself: rail, title bar, body — four surfaces off the ladder, nothing hardcoded. */
function ThemePreviewFace() {
	return (
		<div className="flex h-full w-full bg-mist" aria-hidden>
			<div className="flex w-3 flex-col items-center gap-1 bg-paper py-1.5">
				<span className="size-1.5 rounded-sm bg-arc" />
				<span className="size-1.5 rounded-sm bg-ink-4" />
				<span className="size-1.5 rounded-sm bg-ink-4" />
			</div>
			<div className="flex flex-1 flex-col gap-1 p-1.5">
				<div className="h-1.5 w-3/5 rounded-sm bg-ink-2" />
				<div className="flex-1 rounded-sm bg-paper" />
			</div>
		</div>
	);
}

function PeopleTab() {
	const { members, presenceById, lastActionById } = useShellData();
	const { state, isFriendPinned, togglePinnedFriend } = useNavPrefs();
	const pinned = state.pinnedFriends.length;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h3 className="font-semibold text-md text-ink leading-[1.2] tracking-[-0.1px]">
					Collega's vastzetten in de bovenbalk
				</h3>
				<p className="text-base text-ink-2 leading-[1.55]">
					Blijf dicht bij de mensen met wie je het meest werkt. Vastgezette collega's staan in de
					bovenbalk met hun status; klik op hun avatar om een bericht te sturen. Er passen er maximaal{" "}
					{MAX_PINNED_FRIENDS}.
				</p>
			</div>

			<div className="flex items-center justify-between rounded-lg bg-mist px-3.5 py-2.5">
				<div className="flex items-center gap-2.5">
					<Pip count={pinned} max={MAX_PINNED_FRIENDS} />
					<span className="font-medium text-base text-ink leading-[1.2] tracking-[-0.1px]">
						{pinned} / {MAX_PINNED_FRIENDS} plekken gebruikt
					</span>
				</div>
				<span className="text-sm text-ink-3">
					{members.length} collega's
				</span>
			</div>

			<ul className="flex flex-col gap-1.5">
				{members.map((m) => {
					const presence = presenceById[m.id] ?? "offline";
					const pinnedNow = isFriendPinned(m.id);
					return (
						<li
							key={m.id}
							className="flex items-center gap-3 rounded-lg bg-paper px-3.5 py-3"
						>
							<span
								className="relative flex size-10 shrink-0 items-center justify-center rounded-full font-medium text-base"
								style={personStyle(m.id)}
							>
								{initials(m.name)}
								<span
									className={cn(
										"absolute right-[-1px] bottom-[-1px] size-3 rounded-full ring-2 ring-paper",
										PRESENCE_DOT[presence],
									)}
									aria-hidden
								/>
							</span>
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="truncate font-medium text-base text-ink leading-[1.2] tracking-[-0.1px]">
									{m.name}
								</span>
								<span className="truncate text-sm text-ink-3 leading-[1.4]">
									<span className="font-medium text-ink-2">{m.role}</span>
									<span> · {PRESENCE_LABEL[presence]}</span>
									{lastActionById[m.id] ? ` · ${lastActionById[m.id]}` : null}
								</span>
							</div>
							<button
								type="button"
								onClick={() => {
									const ok = togglePinnedFriend(m.id);
									if (!ok) {
										toast.error("De bovenbalk is vol · maak eerst iemand los");
									} else {
										toast(
											pinnedNow
												? `${m.name} losgemaakt van de bovenbalk`
												: `${m.name} vastgezet in de bovenbalk`,
										);
									}
								}}
								className={cn(
									"flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-sm leading-[1.2] tracking-[-0.1px]",
									pinnedNow
										? "bg-arc-tint text-arc-ink hover:bg-arc-soft"
										: "bg-mist text-ink-2 hover:bg-hairline hover:text-ink",
								)}
							>
								{pinnedNow ? (
									<>
										<Pin className="size-3" strokeWidth={2} />
										Vastgezet
									</>
								) : (
									<>
										<PinOff className="size-3" strokeWidth={2} />
										Vastzetten
									</>
								)}
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

function Pip({ count, max }: { count: number; max: number }) {
	return (
		<div className="flex items-center gap-0.5">
			{Array.from({ length: max }, (_, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static indicator, items never reorder.
					key={i}
					className={cn(
						"size-1.5 rounded-full",
						i < count ? "bg-abyss" : "bg-hairline",
					)}
				/>
			))}
		</div>
	);
}
