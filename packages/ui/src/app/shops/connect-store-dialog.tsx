import { InsyteMark } from "../../brand/mark";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "../../components/dialog";
import { Check, Loader } from "../../icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { BrandLogo } from "../marketplace/brand-logos";
import { cn } from "../lib/utils";
import { useWorkspace, type WorkspaceStore } from "../stores/workspace-store";

/**
 * Connecting a Shopify store, as the journey it is rather than the form it was.
 *
 * The old dialog asked for a store name, a domain, a platform and an "API access token" — which is
 * not how Shopify connects to anything. PRODUCT.md is plain about it: Shopify connects by OAuth. So
 * this is the three things an operator actually goes through: say which store, approve Insyte in
 * Shopify, watch the first sync land. All of it simulated here; the steps and their wording are the
 * real ones, which is what makes the demo worth clicking through.
 *
 * One dialog, three steps, and the panel resizes between them instead of jumping — the height is a
 * spring, so moving from a single field to a list of scopes reads as the same surface growing.
 */

type Step = "address" | "approve" | "sync" | "done";

const SCOPES = [
	{ what: "Bestellingen en afhandeling", why: "om te tonen wat op jou wacht en erop te handelen" },
	{ what: "Producten en voorraad", why: "om te waarschuwen voordat een SKU uitverkocht raakt" },
	{ what: "Klanten", why: "om ze te beantwoorden met hun geschiedenis naast het antwoord" },
];

const SYNC = ["Bestellingen", "Producten", "Klanten", "Afhandelingen"] as const;

export function ConnectStoreDialog({
	open,
	onOpenChange,
	onConnected,
	initialDomain,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConnected?: (store: WorkspaceStore) => void;
	/** Reconnecting a store the workspace already knows starts at the approval step. */
	initialDomain?: string;
}) {
	const connectStore = useWorkspace((s) => s.connectStore);
	const still = useReducedMotion();
	const [step, setStep] = useState<Step>(initialDomain ? "approve" : "address");
	const [address, setAddress] = useState(initialDomain?.replace(/\.myshopify\.com$/, "") ?? "");
	const [synced, setSynced] = useState(0);
	const [store, setStore] = useState<WorkspaceStore | null>(null);

	useEffect(() => {
		if (!open) return;
		setStep(initialDomain ? "approve" : "address");
		setAddress(initialDomain?.replace(/\.myshopify\.com$/, "") ?? "");
		setSynced(0);
		setStore(null);
	}, [open, initialDomain]);

	const domain = `${address.trim().toLowerCase().replace(/\.myshopify\.com$/, "").replace(/[^a-z0-9-]/g, "")}.myshopify.com`;
	const valid = /^[a-z0-9][a-z0-9-]{1,}$/.test(address.trim().toLowerCase().replace(/\.myshopify\.com$/, ""));

	async function approve() {
		setStep("sync");
		const connecting = connectStore(domain);
		for (let i = 1; i <= SYNC.length; i++) {
			await new Promise((r) => setTimeout(r, 380));
			setSynced(i);
		}
		const done = await connecting;
		setStore(done);
		setStep("done");
	}

	return (
		<Dialog open={open} onOpenChange={(v) => step !== "sync" && onOpenChange(v)}>
			<DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[440px]">
				{/* The two marks, joined by a ruled line that is drawn as the connection is made. */}
				<div className="flex items-center justify-center gap-0 bg-mist px-6 pt-7 pb-6">
					<span className="flex size-11 items-center justify-center rounded-lg bg-abyss">
						<InsyteMark size={24} tone="white" />
					</span>
					<span className="relative mx-3 h-px w-20 bg-ink/12" aria-hidden>
						<motion.span
							className="absolute inset-y-0 left-0 bg-arc"
							initial={false}
							animate={{
								width:
									step === "address" ? "0%" : step === "approve" ? "35%" : step === "sync" ? `${35 + (synced / SYNC.length) * 65}%` : "100%",
							}}
							transition={still ? { duration: 0 } : { type: "spring", stiffness: 160, damping: 26 }}
						/>
					</span>
					<BrandLogo brand="shopify" name="Shopify" size={44} />
				</div>

				<motion.div
					layout={still ? false : "size"}
					transition={{ type: "spring", stiffness: 380, damping: 36 }}
					className="overflow-hidden"
				>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.div
							key={step}
							initial={still ? false : { opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={still ? { opacity: 0 } : { opacity: 0, y: -8 }}
							transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
							className="px-6 pt-5 pb-6"
						>
							{step === "address" ? (
								<form
									onSubmit={(e) => {
										e.preventDefault();
										if (valid) setStep("approve");
									}}
								>
									<DialogTitle className="font-medium text-lg text-ink">
										Shopify-winkel koppelen
									</DialogTitle>
									<DialogDescription className="mt-1 text-base text-ink-2">
										Insyte leest bestellingen, producten en klanten, en schrijft in Shopify alleen binnen de regels die jij stelt.
									</DialogDescription>
									<label className="mt-5 block">
										<span className="font-medium text-sm text-ink-2">Winkeladres</span>
										<span className="field mt-1.5 flex h-10 items-center rounded-lg pr-3 pl-3.5 focus-within:bg-paper hover:field-hover">
											<input
												autoFocus
												value={address}
												onChange={(e) => setAddress(e.target.value)}
												placeholder="northwind-nl"
												spellCheck={false}
												autoCapitalize="off"
												className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
												aria-describedby="store-suffix"
											/>
											<span id="store-suffix" className="shrink-0 text-base text-ink-3">
												.myshopify.com
											</span>
										</span>
									</label>
									<Actions>
										<Secondary onClick={() => onOpenChange(false)}>Annuleren</Secondary>
										<Primary type="submit" disabled={!valid}>
											Doorgaan naar Shopify
										</Primary>
									</Actions>
								</form>
							) : step === "approve" ? (
								<div>
									<DialogTitle className="font-medium text-lg text-ink">
										Insyte goedkeuren in Shopify
									</DialogTitle>
									<DialogDescription className="mt-1 text-base text-ink-2">
										Shopify vraagt <span className="font-medium text-ink">{domain}</span> om Insyte toegang te geven tot:
									</DialogDescription>
									<ul className="mt-4 flex flex-col gap-px overflow-hidden rounded-lg">
										{SCOPES.map((s) => (
											<li key={s.what} className="flex items-start gap-3 bg-mist px-3.5 py-2.5">
												<Check className="mt-0.5 size-4 shrink-0 text-arc-ink" strokeWidth={2} />
												<span className="text-base">
													<span className="font-medium text-ink">{s.what}</span>
													<span className="text-ink-2">, {s.why}</span>
												</span>
											</li>
										))}
									</ul>
									<p className="mt-3 text-sm text-ink-3">
										Je kunt dit altijd intrekken in Shopify. Insyte slaat nooit kaartgegevens op.
									</p>
									<Actions>
										<Secondary onClick={() => (initialDomain ? onOpenChange(false) : setStep("address"))}>
											{initialDomain ? "Annuleren" : "Terug"}
										</Secondary>
										<Primary onClick={approve}>Goedkeuren en koppelen</Primary>
									</Actions>
								</div>
							) : step === "sync" ? (
								<div aria-live="polite">
									<DialogTitle className="font-medium text-lg text-ink">{domain} wordt gelezen</DialogTitle>
									<DialogDescription className="mt-1 text-base text-ink-2">
										De eerste synchronisatie duurt even. Je kunt dit sluiten zodra die klaar is.
									</DialogDescription>
									<ul className="mt-4 flex flex-col gap-1.5">
										{SYNC.map((label, i) => {
											const done = synced > i;
											const doing = synced === i;
											return (
												<li key={label} className="flex h-7 items-center gap-2.5 text-base">
													<span className="flex size-4 items-center justify-center">
														{done ? (
															<motion.span initial={still ? false : { scale: 0.4 }} animate={{ scale: 1 }}>
																<Check className="size-4 text-arc-ink" strokeWidth={2.25} />
															</motion.span>
														) : doing ? (
															<Loader className="size-4 animate-spin text-ink-3" />
														) : (
															<span className="size-1.5 bg-ink-5" />
														)}
													</span>
													<span className={cn(done ? "text-ink" : "text-ink-3")}>{label}</span>
												</li>
											);
										})}
									</ul>
								</div>
							) : (
								<div>
									<DialogTitle className="font-medium text-lg text-ink">
										{store?.name ?? "Je winkel"} is gekoppeld
									</DialogTitle>
									<DialogDescription className="mt-1 text-base text-ink-2">
										Bestellingen, producten en klanten zijn binnen. Alles wat op jou wacht, verschijnt op het
										dashboard zodra het binnenkomt.
									</DialogDescription>
									<Actions>
										<Secondary onClick={() => onOpenChange(false)}>Klaar</Secondary>
										<Primary
											onClick={() => {
												if (store) onConnected?.(store);
												onOpenChange(false);
											}}
										>
											Overschakelen naar {store?.name ?? "deze winkel"}
										</Primary>
									</Actions>
								</div>
							)}
						</motion.div>
					</AnimatePresence>
				</motion.div>
			</DialogContent>
		</Dialog>
	);
}

function Actions({ children }: { children: React.ReactNode }) {
	return <div className="mt-6 flex justify-end gap-2">{children}</div>;
}

function Primary(props: React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			{...props}
			className="flex h-9 items-center rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:opacity-45"
		/>
	);
}

function Secondary(props: React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			{...props}
			className="flex h-9 items-center rounded-lg px-3.5 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
		/>
	);
}
