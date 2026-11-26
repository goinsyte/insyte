import { getRouteApi } from "@tanstack/react-router";
import { DemoDeveloperSource } from "../developer/demo-source";
import { ApiKeysPage } from "./api-keys-screen";

const Route = getRouteApi("/_admin/settings/api-keys");

/** API-sleutels in the design app: the page over the demo stores, with the new-key dialog open for `?nieuw=agent`. */
export function DemoApiKeysPage() {
	const { nieuw } = Route.useSearch();
	return (
		<DemoDeveloperSource>
			<ApiKeysPage start={nieuw} />
		</DemoDeveloperSource>
	);
}
