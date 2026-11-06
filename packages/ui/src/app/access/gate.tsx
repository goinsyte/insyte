import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/tooltip";
import { Lock } from "../../icons";
import type { ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement } from "react";
import type { Level, Permission } from "../lib/permissions";
import { cn } from "../lib/utils";
import { useGate } from "../stores/access-store";

/**
 * A control the current role may not use: still there, so nobody wonders where it went, but
 * disabled, with a tooltip that names what is missing — "Je rol Klantenservice mist Terugbetalen".
 *
 * A disabled button takes no pointer events, so the tooltip hangs from a span around it that can
 * also take focus; the reason is the span's accessible name too. When the role may, the child is
 * returned untouched.
 */
export function Gate({ perm, arg, children, className }: { perm: Permission; arg?: Level | number; children: ReactElement; className?: string }) {
	const gate = useGate(perm, arg);
	if (gate.ok) return children;
	return <Blocked reason={gate.reason} className={className}>{children}</Blocked>;
}

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
