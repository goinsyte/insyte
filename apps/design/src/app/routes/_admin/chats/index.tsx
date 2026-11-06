import { createFileRoute } from "@tanstack/react-router";
import { ChatsPage } from "@insyte/ui/app/chats/chats-screen";

export const Route = createFileRoute("/_admin/chats/")({
	component: ChatsPage,
});
