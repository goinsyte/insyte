import { type ComponentType, createContext, useContext } from "react";
import type { ConnectStoreProps } from "./connect-store-flow";

/**
 * What Instellingen → Winkels reads and does, from whoever hosts it (as `developer/source.tsx` for the keys): the design
 * app answers from its demo stores, the console from `Stores.*`. A write resolves once it took; a host that refuses
 * says why itself.
 */

export interface StoreRow {
	id: string;
	name: string;
	domain: string;
	/** Empty until the shop's facts are in. */
	currency: string;
	status: "connected" | "connecting" | "disconnected";
	/** Whether the store has the Live pixel (`/live`); absent where the host has no pixel. */
	livePixel?: "none" | "installed" | undefined;
}

export interface StoresSource {
	stores: ReadonlyArray<StoreRow>;
	/** The store the workspace is looking at, where the host has a store switch. */
	activeId: string | null;
	/** Switches to a store; absent where the host has no store switch yet. */
	setActive?: ((id: string) => void) | undefined;
	disconnect: (id: string) => Promise<boolean>;
	/** Undo of a disconnect; absent where a disconnected store can only be connected again through Shopify. */
	restore?: ((id: string) => void) | undefined;
	/**
	 * Installs or repairs the store's Live pixel, so `/live` sees its visitors; absent where the host has no pixel.
	 * Resolves once it took; a refusal is said by the host.
	 */
	installPixel?: ((id: string) => Promise<boolean>) | undefined;
	/** The connect dialog, as the host connects a store. */
	Connect: ComponentType<ConnectStoreProps>;
}

const StoresSourceContext = createContext<StoresSource | null>(null);

export const StoresSourceProvider = StoresSourceContext.Provider;

export function useStoresSource(): StoresSource {
	const source = useContext(StoresSourceContext);
	if (source === null) throw new Error("A store screen needs a StoresSourceProvider around it.");
	return source;
}
