import { useNavigate } from "@tanstack/react-router";
import { useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { useTeam } from "../stores/team-store";
import { WorkspaceSwitchVeil } from "./workspace-switch-veil";

/**
 * The hand-over between two workspaces: the console steps back under a glacier veil, the new
 * workspace's mark and name come up, and the chrome changes underneath before the veil lifts. It is
 * brief (about three quarters of a second) because it is a signal, not a loading screen: the point
 * is that the next thing you read belongs to someone else's business.
 */
export function WorkspaceSwitchOverlay() {
	const switching = useTeam((s) => s.switching);
	const navigate = useNavigate();
	const still = useReducedMotion();

	useEffect(() => {
		if (!switching) return;
		const t = window.setTimeout(
			() => {
				useTeam.getState().finishSwitch();
				void navigate({ to: "/dashboard", search: {} as never });
				toast.success(`Je werkt nu in ${switching.name}`, {
					description: switching.home ? undefined : `Als ${switching.role}. In deze demo zie je dezelfde gegevens onder de naam van deze werkruimte.`,
				});
			},
			still ? 250 : 760,
		);
		return () => window.clearTimeout(t);
	}, [switching, navigate, still]);

	return <WorkspaceSwitchVeil switching={switching} />;
}
