import { DemoDeveloperSource } from "../developer/demo-source";
import { ApiKeysPage } from "./api-keys-screen";

/** API-sleutels in the design app: the page over the demo stores. */
export function DemoApiKeysPage() {
	return (
		<DemoDeveloperSource>
			<ApiKeysPage />
		</DemoDeveloperSource>
	);
}
