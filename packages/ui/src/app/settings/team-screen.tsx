import { FileText, Link2, Mail, Plus } from "../../icons";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { MemberTable } from "./member-table";
import { SectionAction, SettingCard } from "./setting-card";
import { WELL_BTN } from "../team/bits";
import { BulkInviteDialog } from "../team/bulk-invite-dialog";
import { InviteDialog } from "../team/invite-dialog";
import { InviteLinkSection } from "../team/invite-link";
import { MemberDialog } from "../team/member-dialog";
import { PendingInvites } from "../team/pending-invites";
import { SeatMeter } from "../team/seat-meter";
import { Gate } from "../access/gate";
import { PageGuide } from "../common/page-guide";
import { useGate } from "../stores/access-store";
import { useSeats, useTeam } from "../stores/team-store";

const GUIDE = [
	{ title: "Plekken op je abonnement", body: "De plekken bepalen of je iemand kunt uitnodigen. Zijn ze allemaal bezet, dan koop je er hier een bij.", art: "people" },
	{ title: "Uitnodigen via link", body: "Eén link voor je hele team om door te sturen. Wie hem gebruikt, komt binnen met de rol die je kiest.", art: "link" },
] as const;

/**
 * The team: who is in, who has been asked, and the one link anyone can pass on. The seats on the
 * plan lead, because they decide whether inviting is possible at all; when they are all taken the
 * invite button becomes the way to buy one.
 */
export function TeamPage() {
	const navigate = useNavigate();
	const seats = useSeats();
	const invites = useTeam((s) => s.invites);
	const [inviteOpen, setInviteOpen] = useState(false);
	const [bulkOpen, setBulkOpen] = useState(false);
	const [openId, setOpenId] = useState<string | null>(null);
	const inviteGate = useGate("team", 2);

	const invite = () => (seats.full ? void navigate({ to: "/settings/billing", hash: "plekken" }) : setInviteOpen(true));

	return (
		<>
			<SettingCard
				title={`Teamleden · ${seats.active}`}
				action={
					<div className="flex items-center gap-1.5">
						<Gate perm="team" arg={2}>
							<button type="button" onClick={() => setBulkOpen(true)} disabled={seats.full} className={WELL_BTN}>
								<FileText className="size-3.5" strokeWidth={1.75} />
								<span className="hidden sm:inline">CSV importeren</span>
							</button>
						</Gate>
						<Gate perm="team" arg={2}>
							<SectionAction icon={<Plus className="size-3.5" strokeWidth={2} />} onClick={invite}>
								{seats.full ? "Plek bijkopen" : "Collega uitnodigen"}
							</SectionAction>
						</Gate>
					</div>
				}
			>
				<SeatMeter onBuy={() => void navigate({ to: "/settings/billing", hash: "plekken" })} />
				<MemberTable onOpen={setOpenId} onInvite={invite} />
			</SettingCard>

			{/* Without the right to invite, the invitations and the link are read, not worked. */}
			<fieldset disabled={!inviteGate.ok} className="contents">
				<SettingCard id="uitnodigingen" title={`Openstaande uitnodigingen · ${invites.length}`} icon={Mail}>
					<PendingInvites onInvite={invite} />
				</SettingCard>

				<SettingCard title="Uitnodigen via link" icon={Link2}>
					<InviteLinkSection />
				</SettingCard>
			</fieldset>

			<InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onBulk={() => setBulkOpen(true)} />
			<BulkInviteDialog open={bulkOpen} onOpenChange={setBulkOpen} />
			<MemberDialog memberId={openId} onClose={() => setOpenId(null)} />
			<PageGuide id="settings.team" title="Team" steps={GUIDE} />
		</>
	);
}
