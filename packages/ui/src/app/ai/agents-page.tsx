import { DemoDeveloperSource } from "../developer/demo-source";
import { AgentsPage } from "./agents-screen";

/** Agents en MCP in the design app: the page over the demo stores. */
export function DemoAgentsPage() {
	return (
		<DemoDeveloperSource>
			<AgentsPage />
		</DemoDeveloperSource>
	);
}
