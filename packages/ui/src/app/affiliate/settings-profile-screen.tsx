import { Button } from "../../components/button";
import { Card } from "../../components/card";
import { Input } from "../../components/input";
import { Label } from "../../components/label";
import { useState } from "react";
import { toast } from "sonner";
import { TIER_LABEL, useAffiliatePortal } from "./source";

/** The affiliate's name is theirs to change; the address is their sign-in, and the code and tier are the brand's. */
export function AffProfile() {
	const { useProfile, saveName } = useAffiliatePortal();
	const saved = useProfile();
	const [form, setForm] = useState({ name: saved.name });
	const dirty = form.name !== saved.name;
	const set = (p: Partial<{ name: string }>) => setForm((f) => ({ ...f, ...p }));

	return (
		<Card className="p-6">
			<h2 className="font-medium text-sm">Profiel</h2>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (!form.name.trim()) {
						toast.error("Vul je naam in");
						return;
					}
					const next = { name: form.name.trim() };
					setForm(next);
					saveName(next.name, () => toast.success("Profiel opgeslagen"));
				}}
			>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<div className="grid gap-1.5">
						<Label htmlFor="a-name">Naam</Label>
						<Input id="a-name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="a-email">E-mail</Label>
						<Input id="a-email" type="email" value={saved.email} disabled />
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="a-code">Doorverwijscode</Label>
						<Input id="a-code" value={saved.code} disabled spellCheck={false} />
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="a-tier">Niveau</Label>
						<Input id="a-tier" value={TIER_LABEL[saved.tier]} disabled readOnly />
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
