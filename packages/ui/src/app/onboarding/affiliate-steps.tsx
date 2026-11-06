import {
	Field,
	SelectField,
	TextAreaField,
	TextField,
} from "../common/form-dialog";
import type { StepDef } from "./onboarding-shell";
import type { OnboardingData } from "./use-onboarding-state";

const COUNTRIES = [
	"Verenigde Staten",
	"Verenigd Koninkrijk",
	"Canada",
	"Duitsland",
	"Frankrijk",
	"Italië",
	"Spanje",
	"Nederland",
	"Australië",
	"Anders",
] as const;

const PAYOUT = ["Stripe Connect", "PayPal", "Bankoverschrijving"] as const;

/* Downstream affiliate steps. Account + verify + role pick happen in the
   shared head; this picks up after the user lands on "Apply as an affiliate". */
export function affiliateSteps(
	data: OnboardingData,
	patch: (p: OnboardingData) => void,
	next: () => void,
	finish: () => void,
): StepDef[] {
	const d = data as Record<string, string | undefined>;

	return [
		{
			id: "profile",
			title: "Vertel ons over je publiek.",
			subtitle: "Hoe specifieker, hoe sneller we je kunnen goedkeuren.",
			canContinue: true,
			onPrimary: next,
			content: (
				<>
					<Field label="Bedrijfsnaam">
						<TextField
							value={(d.businessName as string) ?? ""}
							onChange={(v) => patch({ businessName: v })}
							placeholder="Patel Media"
						/>
					</Field>
					<div className="grid grid-cols-2 gap-4">
						<Field label="Land">
							<SelectField
								value={
									(d.country as (typeof COUNTRIES)[number]) ?? "Verenigde Staten"
								}
								onChange={(v) => patch({ country: v })}
								options={COUNTRIES}
							/>
						</Field>
						<Field label="Uitbetaalmethode">
							<SelectField
								value={
									(d.payout as (typeof PAYOUT)[number]) ?? "Stripe Connect"
								}
								onChange={(v) => patch({ payout: v })}
								options={PAYOUT}
							/>
						</Field>
					</div>
					<Field label="Publiek en kanalen">
						<TextAreaField
							value={(d.audience as string) ?? ""}
							onChange={(v) => patch({ audience: v })}
							placeholder="Nieuwsbrief (~12k DTC-oprichters), YouTube-kanaal over operations…"
							rows={3}
						/>
					</Field>
					<Field label="Hoofd-URL">
						<TextField
							value={(d.url as string) ?? ""}
							onChange={(v) => patch({ url: v })}
							placeholder="https://patelmedia.co"
						/>
					</Field>
				</>
			),
		},
		{
			id: "review",
			title: "Aanmelding ontvangen.",
			subtitle:
				"We beoordelen elke affiliate met de hand. Je hoort binnen 2 werkdagen een besluit.",
			canContinue: true,
			primaryLabel: "Begrepen",
			onPrimary: finish,
			content: null,
		},
	];
}
