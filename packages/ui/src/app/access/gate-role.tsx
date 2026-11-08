import type { RoleDef } from "@insyte/domain/Permissions";
import { createContext, useContext } from "react";

/**
 * The role shared parts grey their controls out by (the selection bar's actions), from whoever hosts them: the design
 * app's access store (`DemoGateRole`), or nobody, where the server is the one that refuses (the console until the
 * shell carries the role, M3.6).
 */
const GateRoleContext = createContext<RoleDef | null>(null);

export const GateRoleProvider = GateRoleContext.Provider;

export function useGateRole(): RoleDef | null {
	return useContext(GateRoleContext);
}
