import type { RoleDef } from "@insyte/domain/Permissions";
import { createContext, useContext } from "react";

/**
 * The role shared parts grey their controls out by (the selection bar's actions), from whoever hosts them: the design
 * app's access store (`DemoGateRole`), or the console's frame from the role the server sent. The server refuses
 * whatever the role may not do either way.
 */
const GateRoleContext = createContext<RoleDef | null>(null);

export const GateRoleProvider = GateRoleContext.Provider;

export function useGateRole(): RoleDef | null {
	return useContext(GateRoleContext);
}
