import { Badge } from "../../components/badge";
import { cn } from "../lib/utils";

/* ─────────────────────────────────────────────────────────────────────
   StatusBadge — generic tonal pill that snaps to the brand book's
   signal palette. Use:
     success → signal-green tonal pair (won, delivered, paid)
     warning → signal-amber tonal pair (awaiting, at-risk, delayed processing)
     danger  → signal-red tonal pair (lost, overdue, error)
     info    → arc tonal pair (active brand context)
     neutral → mist + ink-3 (terminal / waiting)
     muted   → mist + ink-3, at lower weight (cancelled / archived)

   Sentence case in the sans. The 10.5px uppercase monospace this used to be
   was the single most repeated thing in the console.
   ───────────────────────────────────────────────────────────────────── */

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "muted";

const STYLES: Record<Tone, string> = {
	success: "bg-signal-green-bg text-signal-green border-transparent",
	warning: "bg-signal-amber-bg text-signal-amber border-transparent",
	danger: "bg-signal-red-bg text-signal-red border-transparent",
	info: "bg-arc-tint text-arc-ink border-transparent",
	neutral: "bg-mist text-ink-3 border-transparent",
	muted: "bg-mist font-normal text-ink-3 border-transparent",
};

export function StatusBadge({
	tone = "neutral",
	className,
	children,
}: {
	tone?: Tone;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<Badge
			className={cn(
				STYLES[tone],
				"h-[18px] rounded-full px-2 font-medium text-sm leading-none",
				className,
			)}
		>
			{children}
		</Badge>
	);
}
