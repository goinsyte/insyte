import type { CSSProperties } from "react";
import { BookOpen, ClipboardCheck, Flag, FileText, Image, Key, MessagesSquare, Package, Play, Shield, Star, type IconComponent } from "../../icons";
import { type BadgeId, type BlockKind, type CourseStatus, PERSON_STATE_LABEL, type PersonState, STATUS_LABEL } from "../lib/courses";
import { cn } from "../lib/utils";
import { StatusPill } from "../settings/setting-card";

export const BADGE_GLYPH: Record<BadgeId, IconComponent> = { star: Star, shield: Shield, parcel: Package, chat: MessagesSquare, flag: Flag, key: Key };

export const BLOCK_GLYPH: Record<BlockKind, IconComponent> = { text: FileText, video: Play, image: Image, quiz: ClipboardCheck };

export const COURSE_GLYPH = BookOpen;

/**
 * The badge a course ends on: a small plate — `abyss`, the drafting grid at a pitch the size can
 * carry, a corner tick at each angle — with the glyph drawn in chalk. Not yet earned, it is the
 * same drawing as a dashed slot in graphite, the way an empty state draws what is not there. On a
 * plate it is lifted onto `abyss-2` with a chalk edge, or it would vanish into its own ground.
 */
export function CourseBadge({ badge, size = 40, earned = true, onPlate = false, className }: { badge: BadgeId; size?: number; earned?: boolean; onPlate?: boolean; className?: string }) {
	const G = BADGE_GLYPH[badge];
	const pitch = Math.max(6, Math.round(size / 5));
	const tick = Math.max(3, Math.round(size / 9));
	const inset = Math.max(3, Math.round(size / 10));
	const style = { width: size, height: size, "--pattern-grid": `${pitch}px` } as CSSProperties;
	const radius = size >= 64 ? "rounded-xl" : size >= 28 ? "rounded-lg" : "rounded-md";
	if (!earned) {
		return (
			<span aria-hidden className={cn("relative flex shrink-0 items-center justify-center border border-ink-4 border-dashed text-ink-4", radius, className)} style={{ width: size, height: size }}>
				<G style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={1.75} />
			</span>
		);
	}
	return (
		<span aria-hidden className={cn("plate relative flex shrink-0 items-center justify-center overflow-hidden text-mesh-ink", onPlate && "bg-abyss-2 shadow-[inset_0_0_0_1px_var(--mesh-hairline),0_12px_32px_-12px_rgb(0_0_0/0.5)]", radius, className)} style={style}>
			{size >= 28
				? (["top-0 left-0 border-t border-l", "top-0 right-0 border-t border-r", "bottom-0 left-0 border-b border-l", "bottom-0 right-0 border-b border-r"] as const).map((c) => (
						<span key={c} className={cn("absolute border-mesh-ink-3", c)} style={{ width: tick, height: tick, margin: inset }} />
					))
				: null}
			<G style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={size >= 64 ? 1.5 : 1.75} />
		</span>
	);
}

/** How far someone is, as a rule with a filled length. The figure beside it carries the number. */
export function Meter({ value, tone = "ink", className }: { value: number; tone?: "ink" | "arc" | "green" | "red"; className?: string }) {
	const fill = { ink: "bg-ink-3", arc: "bg-arc", green: "bg-signal-green", red: "bg-signal-red" }[tone];
	return (
		<span className={cn("relative block h-1 overflow-hidden rounded-full bg-ink/8", className)} role="presentation">
			<span className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-300", fill)} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
		</span>
	);
}

export function CourseStatusPill({ status }: { status: CourseStatus }) {
	return <StatusPill tone={status === "live" ? "success" : status === "draft" ? "info" : "neutral"} label={STATUS_LABEL[status]} />;
}

const STATE_TONE: Record<PersonState, "success" | "warning" | "danger" | "info" | "neutral"> = { done: "success", busy: "info", todo: "neutral", late: "danger", failed: "warning" };

export function PersonStatePill({ state, extra }: { state: PersonState; extra?: string }) {
	return <StatusPill tone={STATE_TONE[state]} label={extra ? `${PERSON_STATE_LABEL[state]} · ${extra}` : PERSON_STATE_LABEL[state]} />;
}

export const plural = (n: number, one: string, many: string) => `${n.toLocaleString("nl-NL")} ${n === 1 ? one : many}`;
