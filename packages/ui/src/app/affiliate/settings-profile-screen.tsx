import { Button } from "../../components/button";
import { Card } from "../../components/card";
import { Input } from "../../components/input";
import { Label } from "../../components/label";
import { useState } from "react";
import { toast } from "sonner";
import { currentAffiliateByState } from "../../data-source";
import { type AffiliateProfile, TIER_LABEL, useAffiliate } from "../stores/affiliate-store";

export function AffProfile() {
	const aff = currentAffiliateByState.approved;
	const saved = useAffiliate((s) => s.profile);
	const saveProfile = useAffiliate((s) => s.saveProfile);
	const [form, setForm] = useState<AffiliateProfile>(saved);
	const dirty =
		form.name !== saved.name ||
		form.email !== saved.email ||
		form.referral_code !== saved.referral_code;
	const set = (p: Partial<AffiliateProfile>) => setForm((f) => ({ ...f, ...p }));

	return (
		<Card className="p-6">
			<h2 className="font-medium text-sm">Profiel</h2>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					// Codes ride in URLs, so they are kept to letters and digits.
					const referral_code = form.referral_code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
					if (!form.name.trim() || !referral_code) {
						toast.error("Naam en doorverwijscode zijn verplicht");
						return;
					}
					const next = { name: form.name.trim(), email: form.email.trim(), referral_code };
					setForm(next);
					saveProfile(next);
					toast.success("Profiel opgeslagen");
				}}
			>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<div className="grid gap-1.5">
						<Label htmlFor="a-name">Naam</Label>
						<Input id="a-name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="a-email">E-mail</Label>
						<Input
							id="a-email"
							type="email"
							value={form.email}
							onChange={(e) => set({ email: e.target.value })}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="a-code">Doorverwijscode</Label>
						<Input
							id="a-code"
							value={form.referral_code}
							onChange={(e) => set({ referral_code: e.target.value })}
							spellCheck={false}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="a-tier">Niveau</Label>
						<Input id="a-tier" defaultValue={TIER_LABEL[aff.tier]} disabled />
					</div>
				</div>
				<div className="mt-4 flex justify-end">
					<Button size="sm" type="submit" disabled={!dirty}>
						Opslaan
					</Button>
				</div>
			</form>
		</Card>
	);
}
