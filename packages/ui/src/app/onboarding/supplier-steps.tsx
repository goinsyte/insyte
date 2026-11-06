import { Check } from "../../icons";
import {
	Field,
	SelectField,
	TextAreaField,
	TextField,
} from "../common/form-dialog";
import { cn } from "../lib/utils";
import type { StepDef } from "./onboarding-shell";
import type { OnboardingData } from "./use-onboarding-state";

const PLATFORMS = [
	"AliExpress",
	"CJ Dropshipping",
	"Spocket",
	"Modalyst",
	"Eigen API",
	"Geen, we richten het samen in",
] as const;

const STOCK_OPTIONS = [
	{
		id: "live",
		title: "Live voorraadfeed",
		body: "We vragen je API elke 5 minuten op.",
	},
	{
		id: "indicator",
		title: "Alleen indicatie (hoog / gemiddeld / laag)",
		body: "Jij geeft een ruwe indicatie. Wij vullen aan op basis van het besteltempo.",
	},
	{
		id: "manual",
		title: "Handmatige updates",
		body: "Je werkt de voorraad met de hand bij vanaf je dashboard.",
	},
] as const;

/* Downstream supplier steps. Account + verify + role pick happen in the
   shared head; this picks up after the user lands on "I'm a supplier". */
export function supplierSteps(
	data: OnboardingData,
	patch: (p: OnboardingData) => void,
	next: () => void,
	finish: () => void,
): StepDef[] {
	const d = data as Record<string, string | undefined>;

	return [
		{
			id: "profile",
			title: "Vertel ons over je bedrijf.",
			subtitle:
				"Klanten zien dit op pakbonnen en in correspondentie over terugbetalingen.",
			canContinue: true,
			onPrimary: next,
			content: (
				<>
					<Field label="Bedrijfsnaam">
						<TextField
							value={(d.businessName as string) ?? ""}
							onChange={(v) => patch({ businessName: v })}
							placeholder="Yiwu Trading Co."
						/>
					</Field>
					<div className="grid grid-cols-2 gap-4">
						<Field label="Contact-e-mail">
							<TextField
								value={(d.contactEmail as string) ?? ""}
								onChange={(v) => patch({ contactEmail: v })}
								placeholder="support@yiwu-trading.com"
								type="email"
							/>
						</Field>
						<Field label="Telefoon">
							<TextField
								value={(d.phone as string) ?? ""}
								onChange={(v) => patch({ phone: v })}
								placeholder="+86 579 8536 0000"
							/>
						</Field>
					</div>
					<Field label="Korte beschrijving">
						<TextAreaField
							value={(d.bio as string) ?? ""}
							onChange={(v) => patch({ bio: v })}
							placeholder="Categorieën die je levert, levertijden, MOQ…"
							rows={3}
						/>
					</Field>
				</>
			),
		},
		{
			id: "api",
			title: "Koppel je leveranciers-API.",
			subtitle:
				"Optioneel. Kies een bekend platform of sla over. Maatwerkkoppelingen begeleiden we één op één.",
			optional: true,
			canContinue: true,
			onPrimary: next,
			content: (
				<>
					<Field label="Platform">
						<SelectField
							value={
								(d.platform as (typeof PLATFORMS)[number]) ??
								"Geen, we richten het samen in"
							}
							onChange={(v) => patch({ platform: v })}
							options={PLATFORMS}
						/>
					</Field>
					{d.platform && d.platform !== "Geen, we richten het samen in" ? (
						<>
							<Field label="API-sleutel">
								<TextField
									value={(d.apiKey as string) ?? ""}
									onChange={(v) => patch({ apiKey: v })}
									placeholder="sup_live_…"
								/>
							</Field>
							<Field label="Webhook URL">
								<TextField
									value={(d.webhook as string) ?? ""}
									onChange={(v) => patch({ webhook: v })}
									placeholder="https://api.yiwu-trading.com/insyte"
								/>
							</Field>
						</>
					) : (
						<p className="text-[12px] text-ink-3 leading-[1.55]">
							Ons team neemt binnen een werkdag contact op met een koppelingsplan.
							Intussen staan bestellingen voor je klaar in de wachtrij.
						</p>
					)}
				</>
			),
		},
		{
			id: "stock",
			title: "Hoe geef je je voorraad door?",
			subtitle: "Je kunt altijd van modus wisselen.",
			canContinue: true,
			onPrimary: next,
			content: (
				<ul className="flex flex-col">
					{STOCK_OPTIONS.map((o) => {
						const active = d.stockMode === o.id;
						return (
							<li key={o.id}>
								<button
									type="button"
									onClick={() => patch({ stockMode: o.id })}
									className={cn(
										"group flex w-full items-center gap-4 border-hairline border-t py-4 text-left transition-colors",
										active ? "text-ink" : "text-ink-3 hover:text-ink",
									)}
								>
									<span
										className={cn(
											"flex size-5 shrink-0 items-center justify-center rounded-full transition-colors",
											active
												? "bg-paper text-ink"
												: "bg-transparent text-transparent bg-mesh-ink/20 group-hover:bg-mesh-ink/35",
										)}
									>
										<Check className="size-3" strokeWidth={2.5} />
									</span>
									<div className="flex flex-1 flex-col">
										<span
											className={cn(
												"text-[15px] leading-[1.3]",
												active ? "font-medium" : "font-normal",
											)}
										>
											{o.title}
										</span>
										<span className="text-[12px] text-ink-3">{o.body}</span>
									</div>
								</button>
							</li>
						);
					})}
					<li className="border-hairline border-t" aria-hidden />
				</ul>
			),
		},
		{
			id: "ready",
			title: "Je bent binnen.",
			subtitle:
				"Je leveranciersdashboard is live. We mailen je zodra je eerste toegewezen bestelling binnenkomt.",
			canContinue: true,
			primaryLabel: "Dashboard openen",
			onPrimary: finish,
			content: null,
		},
	];
}
