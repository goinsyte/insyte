import { FileText, Link2, Mail, Plus } from "../../icons";
import type { ReactElement } from "react";
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
import { Blocked } from "../access/blocked";
import { PageGuide } from "../common/page-guide";
import { TeamDenied, TeamRefusalNotice } from "../team/refusal";
import { type TeamGate, useTeamSource } from "../team/source";

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
	const source = useTeamSource();
	const { seats, invites } = source;
	const [inviteOpen, setInviteOpen] = useState(false);
	const [bulkOpen, setBulkOpen] = useState(false);
	const [openId, setOpenId] = useState<string | null>(null);
	const inviteGate = source.can.invite;

	const invite = () => (seats.full ? source.buySeats() : setInviteOpen(true));

	return (
		<>
			<SettingCard
				title={`Teamleden · ${seats.active}`}
				action={
					<div className="flex items-center gap-1.5">
						<Gated gate={inviteGate}>
							<button type="button" onClick={() => setBulkOpen(true)} disabled={seats.full} className={WELL_BTN}>
								<FileText className="size-3.5" strokeWidth={1.75} />
								<span className="hidden sm:inline">CSV importeren</span>
							</button>
						</Gated>
						<Gated gate={inviteGate}>
							<SectionAction icon={<Plus className="size-3.5" strokeWidth={2} />} onClick={invite}>
								{seats.full ? "Plek bijkopen" : "Collega uitnodigen"}
							</SectionAction>
						</Gated>
					</div>
				}
			>
				<TeamRefusalNotice scope="members" />
				<SeatMeter onBuy={source.buySeats} />
				<MemberTable onOpen={setOpenId} onInvite={invite} />
			</SettingCard>

			{/* Without the right to invite, the invitations are read, not worked; the link is not shown at all. */}
			<fieldset disabled={!inviteGate.ok} className="contents">
				<SettingCard id="uitnodigingen" title={`Openstaande uitnodigingen · ${invites.length}`} icon={Mail}>
					<TeamRefusalNotice scope="invitations" className="mb-3" />
					<PendingInvites onInvite={invite} />
				</SettingCard>
			</fieldset>

			<SettingCard title="Uitnodigen via link" icon={Link2}>
				{inviteGate.ok ? (
					<>
						<TeamRefusalNotice scope="link" className="mb-4" />
						<InviteLinkSection />
					</>
				) : (
					<TeamDenied level={2} title="Je rol kan de uitnodigingslink niet zien" />
				)}
			</SettingCard>

			<InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onBulk={() => setBulkOpen(true)} />
			<BulkInviteDialog open={bulkOpen} onOpenChange={setBulkOpen} />
			<MemberDialog memberId={openId} onClose={() => setOpenId(null)} />
			<PageGuide id="settings.team" title="Team" steps={GUIDE} />
		</>
	);
}

/** The control as it is when the role may; otherwise disabled, with what the role misses. */
function Gated({ gate, children }: { gate: TeamGate; children: ReactElement }) {
	return gate.ok ? children : <Blocked reason={gate.reason}>{children}</Blocked>;
}
