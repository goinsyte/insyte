import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { Loader, MoreHorizontal, Plus } from "../../icons";
import { useState } from "react";
import { toast } from "sonner";
import { BrandLogo } from "../marketplace/brand-logos";
import { BandedList, BandedRow, SectionAction, SettingCard, StatusPill } from "./setting-card";
import { ConnectStoreDialog } from "../shops/connect-store-dialog";
import { undoable } from "../lib/undo";
import { useWorkspace } from "../stores/workspace-store";

/**
 * The Shopify stores this workspace reads. The same three the store switcher shows — they used to
 * be five different ones, "Glamour DE" and "Harper's BAZAAR" among them, which no other screen had
 * ever heard of.
 */
export function StoresPage() {
	const stores = useWorkspace((s) => s.stores);
	const activeId = useWorkspace((s) => s.activeStoreId);
	const setActive = useWorkspace((s) => s.setActiveStore);
	const disconnectStore = useWorkspace((s) => s.disconnectStore);
	const restore = (id: string, status: "connected") =>
		useWorkspace.setState((s) => ({
			stores: s.stores.map((st) => (st.id === id ? { ...st, status, connected: true } : st)),
		}));
	const [connecting, setConnecting] = useState<{ domain?: string } | null>(null);

	return (
		<>
			<SettingCard
				title={`Shopify-winkels · ${stores.length}`}
				action={
					<SectionAction icon={<Plus className="size-3.5" strokeWidth={2} />} onClick={() => setConnecting({})}>
						Winkel koppelen
					</SectionAction>
				}
			>
				<BandedList>
					{stores.map((s) => (
						<BandedRow
							key={s.id}
							leading={<BrandLogo brand="shopify" name="Shopify" size={32} />}
							title={
								<span className="flex items-center gap-2">
									{s.name}
									{s.id === activeId ? (
										<span className="rounded-sm bg-arc-tint px-1.5 font-medium text-2xs text-arc-ink leading-[18px]">
											Actief
										</span>
									) : null}
								</span>
							}
							detail={`${s.domain} · ${s.currency}`}
							trailing={
								<>
									{s.status === "connecting" ? (
										<span className="flex items-center gap-1.5 text-sm text-ink-2">
											<Loader className="size-3.5 animate-spin" /> Koppelen…
										</span>
									) : (
										<StatusPill
											tone={s.status === "connected" ? "success" : "danger"}
											label={s.status === "connected" ? "Gekoppeld" : "Niet gekoppeld"}
										/>
									)}
									{s.status === "disconnected" ? (
										<button
											type="button"
											onClick={() => setConnecting({ domain: s.domain })}
											className="flex h-7 items-center rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-xs transition-colors hover:bg-abyss-2"
										>
											Opnieuw koppelen
										</button>
									) : null}
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<button
												type="button"
												aria-label={`Meer voor ${s.name}`}
												className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink data-[popup-open]:bg-ink/6"
											>
												<MoreHorizontal className="size-4" />
											</button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="w-48">
											<DropdownMenuItem disabled={s.status !== "connected" || s.id === activeId} onClick={() => setActive(s.id)}>
												Naar deze winkel wisselen
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => {
													window.open(`https://${s.domain}/admin`, "_blank", "noopener");
												}}
											>
												Openen in Shopify
											</DropdownMenuItem>
											<DropdownMenuItem
												variant="destructive"
												disabled={s.status !== "connected"}
												onClick={() => {
													disconnectStore(s.id);
													undoable(`${s.name} ontkoppeld`, () => restore(s.id, "connected"), "Insyte leest de winkel niet meer. In Shopify verandert niets.");
												}}
											>
												Ontkoppelen
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</>
							}
						/>
					))}
				</BandedList>
			</SettingCard>
			<ConnectStoreDialog
				open={connecting !== null}
				onOpenChange={(open) => !open && setConnecting(null)}
				initialDomain={connecting?.domain}
				onConnected={(store) => {
					setActive(store.id);
					toast.success(`Je bekijkt nu ${store.name}`);
				}}
			/>
		</>
	);
}
