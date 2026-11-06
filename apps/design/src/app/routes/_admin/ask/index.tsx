import { createFileRoute } from "@tanstack/react-router";
import { AskPage } from "@insyte/ui/app/ask/ask-screen";

export const Route = createFileRoute("/_admin/ask/")({
	component: AskPage,
});
