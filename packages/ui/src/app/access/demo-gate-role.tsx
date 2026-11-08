import type { ReactNode } from "react";
import { useCurrentRole } from "../stores/access-store";
import { GateRoleProvider } from "./gate-role";

/** The design app's role for shared parts: the persona's, or the one being viewed as. */
export function DemoGateRole({ children }: { children: ReactNode }) {
	return <GateRoleProvider value={useCurrentRole()}>{children}</GateRoleProvider>;
}
