import type { ReactElement } from "react";
import type { Level, Permission } from "../lib/permissions";
import { useGate } from "../stores/access-store";
import { Blocked } from "./blocked";

export { Blocked } from "./blocked";

/**
 * A control the current role may not use: still there, so nobody wonders where it went, but
 * disabled, with a tooltip that names what is missing — "Je rol Klantenservice mist Terugbetalen".
 *
 * When the role may, the child is returned untouched (`Blocked` draws the rest).
 */
export function Gate({ perm, arg, children, className }: { perm: Permission; arg?: Level | number; children: ReactElement; className?: string }) {
	const gate = useGate(perm, arg);
	if (gate.ok) return children;
	return <Blocked reason={gate.reason} className={className}>{children}</Blocked>;
}
