import { createFileRoute } from "@tanstack/react-router";
import { ChatsPage } from "@insyte/ui/app/chats/chats-screen";
import { DemoChatsSource } from "@insyte/ui/app/chats/demo-source";

export const Route = createFileRoute("/_admin/chats/")({
	component: () => (
		<DemoChatsSource>
			<ChatsPage />
		</DemoChatsSource>
	),
});
