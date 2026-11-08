import { getRouteApi } from "@tanstack/react-router";
import { DemoRolesSource } from "../roles/demo-source";
import { RolesView } from "./roles-screen";

const Route = getRouteApi("/_admin/settings/roles");

/** Rollen in the design app: the page over the demo stores, opened on the role and request the address names. */
export function RolesPage() {
	const { role, verzoek } = Route.useSearch();
	return (
		<DemoRolesSource>
			<RolesView roleId={role} verzoek={verzoek} />
		</DemoRolesSource>
	);
}
