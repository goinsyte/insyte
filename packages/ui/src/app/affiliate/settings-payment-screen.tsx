import { Button } from "../../components/button";
import { Card } from "../../components/card";
import { Input } from "../../components/input";
import { Label } from "../../components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../components/select";
import { useState } from "react";
import { toast } from "sonner";
import { METHOD_LABEL, type PayoutMethod, useAffiliatePortal } from "./source";

type PaymentSettings = { method: PayoutMethod; account: string; tax_id: string };

/** What the account field asks for, by method. */
const ACCOUNT_LABEL: Record<PayoutMethod, string> = {
	paypal: "PayPal-e-mailadres",
	bank: "IBAN",
	wise: "Wise-e-mailadres",
};

/** Where payouts go. The account is never shown back whole: the field holds a new one, the saved one masked above it. */
export function AffPayment() {
	const { usePayment, savePayment } = useAffiliatePortal();
	const saved = usePayment();
	const [form, setForm] = useState<PaymentSettings>({ method: saved.method ?? "paypal", account: "", tax_id: saved.taxId });
	const dirty =
		form.method !== saved.method ||
		form.account !== "" ||
		form.tax_id !== saved.taxId;
	const set = (p: Partial<PaymentSettings>) => setForm((f) => ({ ...f, ...p }));

	return (
		<Card className="p-6">
			<h2 className="font-medium text-sm">Betaalmethode</h2>
			<p className="mt-1 text-ink-3 text-sm">
				{saved.method ? `Nu naar ${METHOD_LABEL[saved.method]}${saved.accountHint ? `, ${saved.accountHint}` : ""}. Vul je rekening opnieuw in om iets te wijzigen.` : "Nog geen betaalgegevens. Zonder kunnen we je commissie niet uitbetalen."}
			</p>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (!form.account.trim()) {
						toast.error(`Vul je ${ACCOUNT_LABEL[form.method]} in`);
						return;
					}
					const method = form.method;
					savePayment({ method, account: form.account.trim(), taxId: form.tax_id.trim() }, () => {
						setForm((f) => ({ ...f, account: "" }));
						toast.success(`Uitbetalingen gaan naar ${METHOD_LABEL[method]}`);
					});
				}}
			>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<div className="grid gap-1.5">
						<Label htmlFor="method">Methode</Label>
						<Select
							items={METHOD_LABEL}
							value={form.method}
							onValueChange={(v) => set({ method: v as PayoutMethod })}
						>
							<SelectTrigger id="method">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="paypal">PayPal</SelectItem>
								<SelectItem value="bank">Bankoverschrijving</SelectItem>
								<SelectItem value="wise">Wise</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="account">{ACCOUNT_LABEL[form.method]}</Label>
						<Input
							id="account"
							type={form.method === "bank" ? "text" : "email"}
							value={form.account}
							onChange={(e) => set({ account: e.target.value })}
							placeholder={saved.method === form.method && saved.accountHint ? saved.accountHint : undefined}
							autoComplete="off"
							spellCheck={false}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="tax">Btw-nummer</Label>
						<Input
							id="tax"
							value={form.tax_id}
							onChange={(e) => set({ tax_id: e.target.value })}
							placeholder="Optioneel"
						/>
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
