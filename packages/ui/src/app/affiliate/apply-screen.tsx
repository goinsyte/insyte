import { useState } from "react";
import { Button } from "../../components/button";
import { Card, CardContent } from "../../components/card";
import { TrendingUp } from "../../icons";
import { Field, SelectField, TextAreaField, TextField } from "../common/form-dialog";
import { METHOD_LABEL, type PayoutMethod } from "./source";

/*
 * A brand's public partner page (`/partners/<slug>`): who the programme is from, and the application the onboarding's
 * affiliate step asks for ("Vertel ons over je publiek."), with the same fields. Closed, it says so and asks nothing.
 * The host sends it and answers where it lands; the screen only collects.
 */

const COUNTRIES = [
	"Nederland",
	"België",
	"Duitsland",
	"Frankrijk",
	"Verenigd Koninkrijk",
	"Verenigde Staten",
	"Spanje",
	"Italië",
	"Anders",
] as const;

const CHANNELS = ["Instagram", "TikTok", "YouTube", "Nieuwsbrief", "Blog", "Podcast", "Anders"] as const;
const METHODS: ReadonlyArray<PayoutMethod> = ["paypal", "bank", "wise"];

export type Application = {
	name: string;
	businessName: string;
	country: string;
	channel: string;
	audience: string;
	motivation: string;
	url: string;
	payout: PayoutMethod;
};

export function AffiliateApply({
	brand,
	open,
	name = "",
	busy = false,
	onSubmit,
}: {
	brand: string;
	open: boolean;
	/** The signed-in person's name, to start from. */
	name?: string | undefined;
	busy?: boolean | undefined;
	onSubmit: (a: Application) => void;
}) {
	const [form, setForm] = useState<Application>({
		name,
		businessName: "",
		country: "Nederland",
		channel: "Instagram",
		audience: "",
		motivation: "",
		url: "",
		payout: "paypal",
	});
	const [tried, setTried] = useState(false);
	const set = (p: Partial<Application>) => setForm((f) => ({ ...f, ...p }));
	const missing = form.name.trim() === "" || form.audience.trim() === "";

	return (
		<div className="flex min-h-svh flex-1 items-center justify-center bg-paper p-8 text-ink">
			<Card className="w-full max-w-lg">
				<CardContent className="flex flex-col gap-5 p-8">
					<div className="flex flex-col items-center gap-3 text-center">
						<div className="flex size-12 items-center justify-center rounded-full bg-arc-tint text-arc-ink">
							<TrendingUp className="size-5" />
						</div>
						<h1 className="font-medium text-xl">Partnerprogramma van {brand}</h1>
						<p className="text-muted-foreground font-medium text-xs">
							{open
								? "Stuur je publiek naar de winkel en verdien commissie op elke bestelling. Vertel ons over je publiek: hoe specifieker, hoe sneller we je kunnen goedkeuren."
								: `${brand} neemt op dit moment geen nieuwe affiliates aan. Kom later nog eens terug.`}
						</p>
					</div>
					{open ? (
						<form
							className="flex flex-col gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								setTried(true);
								if (missing || busy) return;
								onSubmit({ ...form, name: form.name.trim() });
							}}
						>
							<Field label="Naam">
								<TextField value={form.name} onChange={(v) => set({ name: v })} placeholder="Je volledige naam" />
							</Field>
							<Field label="Bedrijfsnaam">
								<TextField value={form.businessName} onChange={(v) => set({ businessName: v })} placeholder="Optioneel" />
							</Field>
							<div className="grid grid-cols-2 gap-4">
								<Field label="Land">
									<SelectField value={form.country as (typeof COUNTRIES)[number]} onChange={(v) => set({ country: v })} options={COUNTRIES} />
								</Field>
								<Field label="Uitbetaalmethode">
									<SelectField value={form.payout} onChange={(v) => set({ payout: v })} options={METHODS} renderLabel={(m) => METHOD_LABEL[m]} />
								</Field>
							</div>
							<Field label="Hoofdkanaal">
								<SelectField value={form.channel as (typeof CHANNELS)[number]} onChange={(v) => set({ channel: v })} options={CHANNELS} />
							</Field>
							<Field label="Publiek en kanalen">
								<TextAreaField value={form.audience} onChange={(v) => set({ audience: v })} placeholder="Nieuwsbrief (~12k lezers), YouTube-kanaal over…" rows={3} />
							</Field>
							<Field label="Waarom wil je meedoen?">
								<TextAreaField value={form.motivation} onChange={(v) => set({ motivation: v })} placeholder="Optioneel" rows={3} />
							</Field>
							<Field label="Hoofd-URL">
								<TextField value={form.url} onChange={(v) => set({ url: v })} placeholder="https://" />
							</Field>
							{tried && missing ? <p className="text-signal-red text-sm">Vul je naam en je publiek in.</p> : null}
							<Button type="submit" disabled={busy}>
								{busy ? "Bezig met versturen…" : "Aanmelding versturen"}
							</Button>
						</form>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}
