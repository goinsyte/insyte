import { DemoStoresSource } from "../shops/demo-source";
import { StoresPage } from "./stores-screen";

/** Winkels in the design app: the page over the demo stores. */
export function DemoStoresPage() {
	return (
		<DemoStoresSource>
			<StoresPage />
		</DemoStoresSource>
	);
}
