import { Popover, PopoverContent, PopoverTrigger } from "../../components/popover";
import { Bell, Check, Settings } from "../../icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Glyph } from "../common/glyph";
import { NoteLead, NoteSentence, useHeardNotes, useNow } from "../notifications/note-parts";
import { usePersonaSelection } from "../hooks/use-persona";
import { DAY_GROUPS, dayGroup, type Note, noteTime, stateOf } from "../lib/notifications";
import { PERSONA_CHROME } from "../lib/persona-chrome";
import { cn } from "../lib/utils";
import { useNotifications } from "../stores/notifications-store";

/**
 * Notifications, as a list of who did what.
 *
 * The old menu was a stack of tinted icon squares, every row the same weight, with nothing to say
 * which ones were about the operator and which were the shop talking to itself. Now a row leads with
 * the person — their disc, their presence, and a small badge for why it reached you (an @ for a
 * mention, a plus for an assignment) — or with Insyte's own mark when the AI did it, and the record it
 * is about sits in the sentence. The three tabs are the three reasons to open this: everything, what
 * is addressed to me, and what the AI proposed. Unread rows carry an Arc dot and full ink; read ones
 * step back to `ink-2`.
 *
 * It reads the same store as the notifications page, so a row read here is read there, and it shows
 * only what is in the inbox: snoozed and cleared notes live on the page. Its footer opens the page.
 */

type Tab = "all" | "me" | "ai";
const TABS: ReadonlyArray<{ id: Tab; label: string; match: (n: Note) => boolean }> = [
	{ id: "all", label: "Alles", match: () => true },
	{ id: "me", label: "Voor mij", match: (n) => n.reason !== undefined },
	{ id: "ai", label: "AI", match: (n) => n.source === "insyte" },
];

/** The dropdown is a glance, not the list: past this many rows the page takes over. */
const SHOWN = 40;

export function NotificationsInbox() {
	const { persona } = usePersonaSelection();
	const now = useNow();
	const heardNotes = useHeardNotes(persona);
	const setRead = useNotifications((s) => s.setRead);
	const wake = useNotifications((s) => s.wake);
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<Tab>("all");
	const still = useReducedMotion();
	const chrome = PERSONA_CHROME[persona];

	// A snoozed notification comes back on its own, wherever the operator is.
	useEffect(() => wake(now), [now, wake]);

	// `g` then `n` goes to the notifications page from anywhere, as long as nothing is being typed.
	useEffect(() => {
		let g = 0;
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const t = e.target as HTMLElement | null;
			if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
			const k = e.key.toLowerCase();
			if (k === "g") g = Date.now();
			else if (k === "n" && Date.now() - g < 900) {
				g = 0;
				e.preventDefault();
				navigate({ to: chrome.inbox } as never);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [navigate, chrome.inbox]);

	const items = useMemo(
		() => heardNotes.filter((n) => stateOf(n, now) === "inbox").sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
		[heardNotes, now],
	);
	const unread = items.filter((i) => !i.read).length;
	const shown = items.filter(TABS.find((t) => t.id === tab)?.match ?? (() => true));
	const visible = shown.slice(0, SHOWN);
	const days = DAY_GROUPS.map((d) => ({ day: d, notes: visible.filter((n) => dayGroup(n.at, now) === d) })).filter((g) => g.notes.length > 0);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={`Meldingen (${unread} ongelezen)`}
					title="Meldingen"
					className="glyph-host relative flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-mist hover:text-ink"
				>
					<Glyph icon={Bell} motion="swing" size={16} draw={false} />
					<AnimatePresence initial={false}>
						{unread > 0 ? (
							<motion.span
								key={unread}
								initial={still ? false : { scale: 0.4 }}
								animate={{ scale: 1 }}
								exit={{ scale: 0.4, opacity: 0 }}
								transition={{ type: "spring", stiffness: 600, damping: 24 }}
								className="absolute top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-arc px-1 font-medium text-2xs text-mesh-ink tabular-nums leading-none ring-2 ring-glacier"
								aria-hidden
							>
								{unread > 9 ? "9+" : unread}
							</motion.span>
						) : null}
					</AnimatePresence>
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="flex w-[384px] max-w-[calc(100vw-24px)] flex-col gap-0 overflow-hidden p-0">
				<header className="flex items-center gap-2 px-4 pt-3.5 pb-2">
					<h2 className="font-medium text-lg text-ink">Meldingen</h2>
					{unread > 0 ? (
						<button
							type="button"
							onClick={() => setRead(items.filter((i) => !i.read).map((i) => i.id), true)}
							className="glyph-host ml-auto flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
						>
							<Glyph icon={Check} motion="pop" size={14} draw={false} />
							Alles als gelezen markeren
						</button>
					) : null}
				</header>

				<div role="tablist" aria-label="Tonen" className="flex gap-1 px-4 pb-2">
					{TABS.map((t) => {
						const on = t.id === tab;
						const count = items.filter((n) => !n.read && t.match(n)).length;
						return (
							<button
								key={t.id}
								type="button"
								role="tab"
								aria-selected={on}
								onClick={() => setTab(t.id)}
								className={cn(
									"relative flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors",
									on ? "font-medium text-mesh-ink" : "bg-ink/5 text-ink-2 hover:bg-ink/8 hover:text-ink",
								)}
							>
								{on ? (
									<motion.span
										layoutId="notes-tab"
										className="absolute inset-0 rounded-md bg-abyss"
										transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
										aria-hidden
									/>
								) : null}
								<span className="relative">{t.label}</span>
								{count > 0 ? <span className="relative tabular-nums opacity-70">{count}</span> : null}
							</button>
						);
					})}
				</div>

				<div className="max-h-[440px] overflow-y-auto px-2 pb-2">
					{days.length === 0 ? (
						<p className="px-2 py-6 text-center text-sm text-ink-3">
							{items.length === 0 ? "Je bent bij. Nieuwe meldingen verschijnen hier." : "Niets in deze tab."}
						</p>
					) : (
						days.map((g) => (
							<section key={g.day} aria-label={g.day}>
								<h3 className="px-2 pt-2 pb-1 text-xs text-ink-3">{g.day}</h3>
								<ul>
									<AnimatePresence initial={false} mode="popLayout">
										{g.notes.map((n) => (
											<motion.li
												key={n.id}
												layout={still ? false : "position"}
												initial={still ? false : { opacity: 0, y: 4 }}
												animate={{ opacity: 1, y: 0 }}
												exit={{ opacity: 0, transition: { duration: 0.08 } }}
												transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
												className="group/note relative"
											>
												<Link
													to={n.to}
													search={n.search as never}
													onClick={() => {
														setRead([n.id], true);
														setOpen(false);
													}}
													className="glyph-host flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-ink/4"
												>
													<NoteLead note={n} />
													<span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-5">
														<NoteSentence note={n} className={cn("text-base leading-snug", n.read ? "text-ink-2" : "text-ink")} />
														{n.detail ? (
															<span className={cn("line-clamp-2 text-sm", n.read ? "text-ink-3" : "text-ink-2")}>
																{n.quote ? `“${n.detail}”` : n.detail}
															</span>
														) : null}
														<span className="text-xs text-ink-3 tabular-nums">{noteTime(n.at, now)}</span>
													</span>
												</Link>
												{/* The dot is also the toggle: read it here without opening it. */}
												<button
													type="button"
													onClick={() => setRead([n.id], !n.read)}
													aria-label={n.read ? "Markeren als ongelezen" : "Markeren als gelezen"}
													title={n.read ? "Markeren als ongelezen" : "Markeren als gelezen"}
													className="absolute top-2.5 right-2 flex size-5 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-ink/8"
												>
													<span
														className={cn(
															"size-2 rounded-full transition-all",
															n.read ? "scale-50 bg-transparent group-hover/note:scale-100 group-hover/note:bg-ink-5" : "bg-arc",
														)}
													/>
												</button>
											</motion.li>
										))}
									</AnimatePresence>
								</ul>
							</section>
						))
					)}
					{shown.length > SHOWN ? (
						<Link
							to={chrome.inbox}
							onClick={() => setOpen(false)}
							className="mx-2 mt-1 flex h-8 items-center rounded-md px-2 text-sm text-ink-2 tabular-nums transition-colors hover:bg-ink/6 hover:text-ink"
						>
							Nog {shown.length - SHOWN} in alle meldingen
						</Link>
					) : null}
				</div>

				<footer className="flex items-center bg-mist px-2 py-1.5">
					<Link
						to={chrome.notifications}
						onClick={() => setOpen(false)}
						className="glyph-host flex h-8 items-center gap-2 rounded-md px-2 text-sm text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
					>
						<Glyph icon={Settings} motion="nudge" size={14} draw={false} />
						Wat je hoort, en wanneer
					</Link>
					<Link
						to={chrome.inbox}
						onClick={() => setOpen(false)}
						className="ml-auto flex h-8 items-center gap-2 rounded-md px-2 font-medium text-sm text-arc-ink hover:bg-arc-tint"
					>
						Alle meldingen
						<kbd className="flex h-5 items-center rounded-sm bg-paper px-1 font-medium text-ink-3 text-xs">G N</kbd>
					</Link>
				</footer>
			</PopoverContent>
		</Popover>
	);
}
