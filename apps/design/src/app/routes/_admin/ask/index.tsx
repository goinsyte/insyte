import { createFileRoute } from "@tanstack/react-router";
import { DemoAskSource } from "@insyte/ui/app/ask/demo-ask-source";
import { AskPage } from "@insyte/ui/app/ask/ask-screen";

export const Route = createFileRoute("/_admin/ask/")({
	component: () => (
		<DemoAskSource>
			<AskPage />
		</DemoAskSource>
	),
});
