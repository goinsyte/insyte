import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "../../icons";
import { cn } from "../lib/utils";
import { useSyncLine } from "./state";

/**
 * The stores' sync in one line, on the top bar (sync health). While every store is read through it is a quiet word with
 * a green dot, and only where the bar has room for it: nothing to do, so it does not ask for the eye. When Insyte is
 * handling something it wears amber, red when the operator must act, and shows from `sm` up: below 1400px as the
 * warning mark alone (the search keeps its room), with its words as the tooltip and the label. Never the colour alone.
 * A phone's bar has no room left; there the person on call has the bell, which already heard of it. It leads to
 * Winkels, where the store says what happened and what Insyte already tried.
 */
export function SyncStatus() {
	const line = useSyncLine();
	if (line === null) return null;
	const quiet = line.tone === "ok";
	return (
		<Link
			to={line.href as never}
			title={line.detail}
			aria-label={line.detail}
			className={cn(
				"h-[30px] min-w-0 shrink items-center gap-1.5 rounded-md px-2.5 font-medium text-sm leading-none transition-colors",
				quiet
					? "hidden text-ink-3 hover:bg-ink/6 hover:text-ink-2 min-[1400px]:flex"
					: line.tone === "warning"
						? "hidden bg-signal-amber-bg text-signal-amber hover:bg-signal-amber-bg/70 sm:flex"
						: "hidden bg-signal-red-bg text-signal-red hover:bg-signal-red-bg/70 sm:flex",
			)}
		>
			{quiet ? (
				<span aria-hidden className="size-1.5 shrink-0 rounded-full bg-signal-green" />
			) : (
				<AlertTriangle aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
			)}
			<span className={cn("truncate", quiet ? null : "hidden min-[1400px]:inline")}>{line.label}</span>
		</Link>
	);
}
