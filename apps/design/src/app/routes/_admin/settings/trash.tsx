import { createFileRoute } from "@tanstack/react-router";
import { TrashPage } from "@insyte/ui/app/settings/depth/trash-screen";
import { DemoTrashSource } from "@insyte/ui/app/settings/trash-demo-source";

export const Route = createFileRoute("/_admin/settings/trash")({
	component: () => (
		<DemoTrashSource>
			<TrashPage />
		</DemoTrashSource>
	),
});
