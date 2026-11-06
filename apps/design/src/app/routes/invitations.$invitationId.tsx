import { createFileRoute } from "@tanstack/react-router";
import { InvitationPage } from "@insyte/ui/app/auth/invitation-screen";

export const Route = createFileRoute("/invitations/$invitationId")({
	component: InvitationPage,
});
