import { AtSign, type IconComponent, Sparkle, UserPlus } from "../../icons";
import { useEffect, useMemo, useState } from "react";
import { Glyph } from "../common/glyph";
import { BrandLogo } from "../marketplace/brand-logos";
import { initials } from "../lib/format";
import { type Presence, presenceById } from "../../data-source";
import { heard, type Note, SOURCES } from "../lib/notifications";
import { personStyle } from "../lib/person-color";
import type { Persona } from "../lib/types/persona";
import { cn } from "../lib/utils";
import { useNotifications } from "../stores/notifications-store";

/** The clock the lists group and snooze by, ticking once a minute. */
export function useNow(every = 60_000) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const t = window.setInterval(() => setNow(Date.now()), every);
		return () => window.clearInterval(t);
	}, [every]);
	return now;
}

/** A persona's notifications, minus the ones its settings say not to show in the app. */
export function useHeardNotes(persona: Persona) {
	const notes = useNotifications((s) => s.notes);
	const prefs = useNotifications((s) => s.prefs);
	return useMemo(() => notes.filter((n) => n.persona === persona && heard(n, prefs)), [notes, prefs, persona]);
}

const PRESENCE_DOT: Record<Presence, string> = {
	online: "bg-signal-green",
	away: "bg-signal-amber",
	offline: "bg-ink-4",
};
/** Why it reached you, as the small badge on the person's disc. */
const REASON: Record<NonNullable<Note["reason"]>, IconComponent> = { mention: AtSign, assign: UserPlus };
const TONE: Record<NonNullable<Note["tone"]> | "none", string> = {
	amber: "bg-signal-amber-bg text-signal-amber",
	red: "bg-signal-red-bg text-signal-red",
	green: "bg-signal-green-bg text-signal-green",
	none: "bg-ink/6 text-ink-2",
};

/**
 * The row's leading mark: the person with their presence and reason, a connected service's logo,
 * Insyte's star on the plate colour, or — when nobody did it — the subject's glyph on its signal tint.
 */
export function NoteLead({ note, size = 32, presence: known }: { note: Note; size?: number; presence?: Presence }) {
	const a = note.actor;
	const glyph = Math.round(size * 0.47);
	const box = { width: size, height: size };
	if (a?.kind === "insyte") {
		return (
			<span className="flex shrink-0 items-center justify-center rounded-lg bg-abyss text-mesh-ink" style={box}>
				<Glyph icon={Sparkle} motion="turn" size={glyph} draw={false} />
			</span>
		);
	}
	if (a?.kind === "brand") return <BrandLogo brand={a.brand} name={a.name} size={size} />;
	if (a?.kind === "member" || a?.kind === "person") {
		const Reason = note.reason ? REASON[note.reason] : undefined;
		const presence = a.kind === "member" ? (known ?? presenceById?.[a.id] ?? "offline") : undefined;
		return (
			<span
				className={cn("relative flex shrink-0 items-center justify-center rounded-full font-medium", size >= 32 ? "text-sm" : "text-xs")}
				style={{ ...box, ...personStyle(a.kind === "member" ? a.id : a.name) }}
			>
				{initials(a.name)}
				{Reason ? (
					<span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-paper text-ink-2 ring-2 ring-paper">
						<Reason className="size-3" strokeWidth={2} />
					</span>
				) : presence ? (
					<span className={cn("absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-paper", PRESENCE_DOT[presence])} aria-hidden />
				) : null}
			</span>
		);
	}
	return (
		<span className={cn("flex shrink-0 items-center justify-center rounded-lg", TONE[note.tone ?? "none"])} style={box}>
			<Glyph icon={SOURCES[note.source].icon} motion="swing" size={glyph} draw={false} />
		</span>
	);
}

/** The actor's name, set in medium. A service or Insyte names itself only when the sentence needs it. */
export function actorName(note: Note): string | undefined {
	const a = note.actor;
	if (!a) return undefined;
	if (a.kind === "insyte") return "Insyte";
	return a.name;
}

/** The sentence: who, what, and the record in medium tabular figures. */
export function NoteSentence({ note, className }: { note: Note; className?: string }) {
	const name = actorName(note);
	// A sentence that starts with its own capital ("Geschil gewonnen:") does not take the actor first.
	const lead = name !== undefined && note.title.charAt(0) === note.title.charAt(0).toLowerCase();
	return (
		<span className={className}>
			{lead ? <span className="font-medium">{name} </span> : null}
			{note.title}
			{note.record ? (
				<>
					{" "}
					{/* A code like DSP-2214 is one word and never breaks at its hyphen. */}
					<span className={cn("font-medium tabular-nums", !note.record.includes(" ") && "whitespace-nowrap")}>{note.record}</span>
				</>
			) : null}
		</span>
	);
}
