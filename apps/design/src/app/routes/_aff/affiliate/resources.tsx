import { createFileRoute } from "@tanstack/react-router";
import { Resources } from "@insyte/ui/app/affiliate/resources-screen";

export const Route = createFileRoute("/_aff/affiliate/resources")({
	component: Resources,
});
