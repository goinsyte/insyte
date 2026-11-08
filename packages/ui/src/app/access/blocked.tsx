import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/tooltip";
import { Lock } from "../../icons";
import type { ReactNode } from "react";
import { cloneElement, isValidElement } from "react";
import { cn } from "../lib/utils";

/**
 * A control that may not be used, still there and disabled, with a tooltip naming what is missing.
 *
 * A disabled button takes no pointer events, so the tooltip hangs from a span around it that can
 * also take focus; the reason is the span's accessible name too.
 */
export function Blocked({ reason, children, className }: { reason: string; children: ReactNode; className?: string }) {
	const child = isValidElement<{ disabled?: boolean; "aria-disabled"?: boolean; tabIndex?: number }>(children)
		? cloneElement(children, { disabled: true, "aria-disabled": true, tabIndex: -1 })
		: children;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{/* biome-ignore lint/a11y/noNoninteractiveTabindex: the reason has to be reachable by keyboard while the control is off */}
				<span tabIndex={0} aria-label={reason} className={cn("inline-flex cursor-not-allowed rounded-md", className)}>
					{child}
				</span>
			</TooltipTrigger>
			<TooltipContent side="top" className="max-w-[260px]">
				<span className="flex items-start gap-1.5">
					<Lock className="mt-0.5 size-3 shrink-0" strokeWidth={2} />
					{reason}
				</span>
			</TooltipContent>
		</Tooltip>
	);
}
