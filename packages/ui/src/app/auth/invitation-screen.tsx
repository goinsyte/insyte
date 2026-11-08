import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { appHref } from "../../data-source/hrefs";
import { setPersonaSelection } from "../hooks/use-persona";
import { type Landing, resolveInvitation, SIGNED_IN_AS } from "../lib/invitations";
import { useProgram } from "../stores/affiliate-program-store";
import { useSettings } from "../stores/settings-store";
import { useSeats, useTeam } from "../stores/team-store";
import { useWorkspace } from "../stores/workspace-store";
import { roleLabel, useAbilities, useStoreAccessLabel } from "../team/roles";
import type { InvitationSource } from "./invitation-source";
import { InvitationView } from "./invitation-view";

const Route = getRouteApi("/invitations/$invitationId");

/** The demo's pauses, so a busy button reads as it would against a server. */
const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * The landing in the design app: the invitation resolved from its id against the demo stores, and every action a
 * write to them. The page itself is `InvitationView`.
 */
export function InvitationPage() {
	const { invitationId } = Route.useParams();
	// Resolved once: accepting changes the stores, and the page should not flip state under itself.
	const inv = useMemo(() => resolveInvitation(invitationId), [invitationId]);
	const navigate = useNavigate();
	const roles = useSettings((s) => s.roles);
	const role = inv.roleId ? roleLabel(roles, inv.roleId) : "";
	const abilities = useAbilities(inv.roleId ?? "");
	const storesLabel = useStoreAccessLabel(inv.stores);
	const seats = useSeats();

	const source: InvitationSource = {
		inv,
		role,
		abilities,
		storesLabel,
		seatsTotal: Math.max(seats.total, 12),
		signedInAs: SIGNED_IN_AS,
		mailto: {
			revoked: `mailto:${inv.inviter.name.toLowerCase().split(" ")[0]}@northwindclothing.co?subject=${encodeURIComponent(`Uitnodiging voor ${inv.workspace}`)}`,
			otherAccount: `mailto:noor@kestrelgoods.co?subject=${encodeURIComponent("Uitnodiging naar mijn werkadres")}&body=${encodeURIComponent(`Kun je ${SIGNED_IN_AS.email} uitnodigen in plaats van ${inv.email}?`)}`,
		},
		createAccount: () => pause(650).then(() => null),
		signIn: () => pause(650).then(() => null),
		continueWithGoogle: (sso) => pause(sso ? 1000 : 900).then(() => true),
		resetPassword: () => void toast.success(`Resetlink verstuurd naar ${inv.email}`, { description: "De link is 30 minuten geldig." }),
		switchAccount: () => Promise.resolve("existing"),
		requestNew: () => Promise.resolve(true),
		requestSeat: () => Promise.resolve(true),
		join: async ({ name: who, notify, via }) => {
			// Signing in joins at once; the last step's button holds a moment first.
			if (via === "steps") await pause(700);
			setPersonaSelection("admin");
			if (inv.state === "other-account") {
				// The invitation is to another workspace: it joins the switcher and the console moves there.
				const team = useTeam.getState();
				const pending = team.workspaceInvites.find((w) => w.workspace === inv.workspace);
				const ws = pending ? team.acceptWorkspaceInvite(pending.id) : team.addWorkspace(inv.workspace);
				if (ws && !pending) useTeam.setState((s) => ({ workspaces: s.workspaces.map((w) => (w.id === ws.id ? { ...w, own: false, role } : w)) }));
				if (ws) useTeam.getState().switchWorkspace(ws.id);
				void navigate({ to: "/dashboard", search: {} as never });
				return;
			}
			join(inv, who, role);
			useTeam.getState().setWelcome({ name: who, workspace: inv.workspace, role });
			toast.success(`Je zit in ${inv.workspace}`, {
				description: notify.on === 0 ? "Meldingen staan uit. Je zet ze aan in je profiel." : `${notify.on} soorten meldingen aan, in Insyte${notify.email ? " en per e-mail" : ""}.`,
			});
			void navigate({ to: "/dashboard", search: {} as never });
		},
		joinPartner: (who, state) => {
			if (state === "supplier" && inv.supplierId) {
				const team = useTeam.getState();
				const p = team.portal[inv.supplierId];
				if (p) team.setPortal(inv.supplierId, { ...p, status: "active", contact: who });
				setPersonaSelection("supplier");
				toast.success(`Account gemaakt voor ${inv.company}`, { description: "Nog drie vragen en je ziet je eerste bestellingen." });
				void navigate({ to: "/onboarding", search: { persona: "supplier", step: 3 } });
				return;
			}
			if (inv.affiliateInviteId) useProgram.getState().acceptInvite(inv.affiliateInviteId);
			setPersonaSelection("affiliate");
			toast.success("Account gemaakt", { description: `Je start op ${inv.tier?.label ?? "Brons"}. Nog twee vragen.` });
			void navigate({ to: "/onboarding", search: { persona: "affiliate", step: 3 } });
		},
		openWorkspace: () => {
			setPersonaSelection(inv.supplierId ? "supplier" : "admin");
			window.location.assign(appHref(inv.supplierId ? "/supplier/dashboard" : "/dashboard"));
		},
	};

	return <InvitationView source={source} />;
}

/** Adds the person to the workspace, from the invitation that brought them. */
function join(inv: Landing, name: string, role: string) {
	const team = useTeam.getState();
	if (inv.teamInviteId) {
		team.acceptInvite(inv.teamInviteId, name);
		return;
	}
	const ws = useWorkspace.getState();
	const id = inv.id === "inv_nieuw" ? "mem_amber" : `mem_${inv.id}`;
	const member = { id, user_id: `user_${id}`, name, email: inv.email ?? "", role, status: "active" as const, last_active_at: new Date().toISOString() };
	useWorkspace.setState({ members: ws.members.some((m) => m.id === id) ? ws.members.map((m) => (m.id === id ? member : m)) : [...ws.members, member] });
	useTeam.setState((s) => ({
		invites: s.invites.filter((i) => i.email !== inv.email),
		memberMeta: { ...s.memberMeta, [id]: { stores: inv.stores, invitedBy: inv.inviter.id, joinedAt: Date.now(), lastSeen: Date.now() } },
	}));
}
