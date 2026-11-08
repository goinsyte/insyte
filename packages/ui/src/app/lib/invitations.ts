import { tierOf } from "../../data-source";
import { members } from "../../data-source";
import { suppliers } from "../../data-source";
import { DAY, isExpired, PORTAL_SCOPES } from "./team";
import { useProgram } from "../stores/affiliate-program-store";
import { useTeam } from "../stores/team-store";
import type { Landing } from "./invitation-types";

/**
 * What an invitation link opens on, resolved from its id.
 *
 * A link made on the team page, the supplier list or the affiliates page resolves to the record it
 * was made for, so "view as the invitee" shows that exact invitation. Every other state the landing
 * is designed for has a fixed id, listed in the persona chip: a new person, someone who already has
 * an account, the wrong account signed in, lapsed, revoked, already accepted, SSO required, a full
 * workspace, a supplier and an affiliate.
 */

export type { Landing, LandingState } from "./invitation-types";

export const SIGNED_IN_AS = { name: "Elena Hart", email: "elena@northwindclothing.co" };

const WS = "Northwind Clothing Co.";
const person = (id: string) => {
	const m = members.find((x) => x.id === id);
	return { id, name: m?.name ?? "Elena Hart", role: m?.role ?? "Eigenaar" };
};
const elena = { id: "mem_elena", name: "Elena Hart", role: "Eigenaar" };
const now = Date.now();

/** The designed states, each under the id the persona chip links to. */
const FIXED: Record<string, Omit<Landing, "id">> = {
	inv_nieuw: {
		state: "new",
		workspace: WS,
		inviter: { id: "mem_sofia", name: "Sofía Kim", role: "CX-lead" },
		email: "amber@northwindclothing.co",
		name: "Amber Lewis",
		roleId: "service",
		stores: ["store_us", "store_eu"],
		message: "Begin met de tickets die aan jou zijn toegewezen, ik loop de eerste week met je mee.",
		at: now + 5 * DAY,
	},
	inv_bestaand: { state: "existing", workspace: WS, inviter: elena, email: "ruben@hartco.agency", name: "Ruben Smit", roleId: "finance", stores: "all", at: now + 6 * DAY },
	inv_ander: {
		state: "other-account",
		workspace: "Kestrel Goods",
		inviter: { id: "kestrel_noor", name: "Noor Visser", role: "Eigenaar" },
		email: "elena.hart@gmail.com",
		name: "Elena Hart",
		roleId: "admin",
		stores: "all",
		message: "Wil je meekijken naar onze supportwachtrij? Je weet hoe Northwind het doet.",
		at: now + 6 * DAY,
	},
	inv_verlopen: { state: "expired", workspace: WS, inviter: elena, email: "jonas.vermeulen@northwindclothing.co", roleId: "finance", stores: "all", at: now - 3 * DAY },
	inv_ingetrokken: { state: "revoked", workspace: WS, inviter: elena, email: "tess@northwindclothing.co", roleId: "view", stores: "all", at: now - DAY },
	inv_geaccepteerd: { state: "accepted", workspace: WS, inviter: elena, email: "maya@northwindclothing.co", name: "Maya Roy", roleId: "view", stores: ["store_eu"], at: Date.parse("2025-04-07T09:00:00Z") },
	inv_sso: { state: "sso", workspace: WS, inviter: elena, email: "noah@northwindclothing.co", name: "Noah Bakker", roleId: "service", stores: "all", at: now + 6 * DAY },
	inv_vol: { state: "full", workspace: WS, inviter: person("mem_ethan"), email: "lotte@northwindclothing.co", name: "Lotte de Graaf", roleId: "view", stores: "all", at: now + 4 * DAY },
	inv_leverancier: {
		state: "supplier",
		workspace: WS,
		inviter: elena,
		email: "studio@blackcedar.co",
		company: "Black Cedar Studio",
		supplierId: "sup_blackcedar",
		scopes: PORTAL_SCOPES.map((s) => s.id),
		stores: "all",
		message: "We willen jullie leren in het najaar opnemen. Via het portaal zie je meteen welke bestellingen voor jullie zijn.",
		at: now + 4 * DAY,
	},
	inv_affiliate: {
		state: "affiliate",
		workspace: WS,
		inviter: person("mem_maya"),
		email: "femke@kijkfemke.nl",
		name: "Femke Jansen",
		tier: { label: "Zilver", rate: 12 },
		code: "FEMKE",
		stores: "all",
		message: "Je reviews van onze fleece deden het goed. We starten je op Zilver.",
		at: now + 13 * DAY,
	},
};

export function resolveInvitation(rawId: string): Landing {
	const id = rawId === "mem_amber" ? "inv_nieuw" : rawId;
	const team = useTeam.getState();

	// The shareable link: anyone may use it while it is on and has not lapsed.
	if (id.startsWith("link_")) {
		const link = team.link;
		const live = link.enabled && `link_${link.token}` === id && link.createdAt + link.days * DAY > Date.now();
		return { id, state: live ? "link" : "expired", workspace: WS, inviter: elena, roleId: link.roleId, stores: "all", at: link.createdAt + link.days * DAY };
	}

	if (team.revoked.includes(id)) return { id, ...(FIXED[id] ?? { workspace: WS, inviter: elena, stores: "all" }), state: "revoked" };

	const invite = team.invites.find((i) => i.id === id);
	if (invite) {
		const fixed = FIXED[id];
		return {
			id,
			state: isExpired(invite) ? "expired" : (fixed?.state ?? "new"),
			workspace: WS,
			inviter: person(invite.invitedBy),
			email: invite.email,
			name: fixed?.name,
			roleId: invite.roleId,
			stores: invite.stores,
			message: invite.message,
			at: invite.expiresAt,
			teamInviteId: invite.id,
		};
	}

	const portal = Object.entries(team.portal).find(([, p]) => p.inviteId === id);
	if (portal) {
		const [supplierId, p] = portal;
		const s = suppliers.find((x) => x.id === supplierId);
		return {
			id,
			state: p.status === "invited" ? "supplier" : p.status === "active" ? "accepted" : "revoked",
			workspace: WS,
			inviter: person(p.invitedBy ?? "mem_elena"),
			email: p.email,
			company: s?.name,
			supplierId,
			scopes: p.scopes,
			stores: "all",
			at: (p.sentAt ?? now) + 7 * DAY,
		};
	}

	const aff = useProgram.getState().invites.find((i) => i.id === id);
	if (aff) {
		const t = tierOf(aff.tier);
		return {
			id,
			state: aff.expiresAt <= Date.now() ? "expired" : "affiliate",
			workspace: WS,
			inviter: person("mem_maya"),
			email: aff.email,
			name: aff.name,
			tier: { label: t.label, rate: t.rate },
			code: aff.name.split(" ")[0]?.toUpperCase().replace(/[^A-Z]/g, ""),
			stores: "all",
			message: aff.message,
			at: aff.expiresAt,
			affiliateInviteId: aff.id,
		};
	}

	const fixed = FIXED[id];
	if (fixed) return { id, ...fixed };
	// An invitation that was revoked in this session leaves its id behind.
	return { id, state: id.startsWith("inv_") ? "revoked" : "missing", workspace: WS, inviter: elena, stores: "all" };
}
