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
import {
	METHOD_LABEL,
	type PaymentSettings,
	type PayoutMethod,
	useAffiliate,
} from "../stores/affiliate-store";

/** What the account field asks for, by method. */
const ACCOUNT_LABEL: Record<PayoutMethod, string> = {
	paypal: "PayPal-e-mailadres",
	bank: "IBAN",
	wise: "Wise-e-mailadres",
};

export function AffPayment() {
	const saved = useAffiliate((s) => s.payment);
	const savePayment = useAffiliate((s) => s.savePayment);
	const [form, setForm] = useState<PaymentSettings>(saved);
	const dirty =
		form.method !== saved.method ||
		form.account !== saved.account ||
		form.tax_id !== saved.tax_id;
	const set = (p: Partial<PaymentSettings>) => setForm((f) => ({ ...f, ...p }));

	return (
		<Card className="p-6">
			<h2 className="font-medium text-sm">Betaalmethode</h2>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (!form.account.trim()) {
						toast.error(`Vul je ${ACCOUNT_LABEL[form.method]} in`);
						return;
					}
					savePayment({ ...form, account: form.account.trim(), tax_id: form.tax_id.trim() });
					toast.success(`Uitbetalingen gaan naar ${METHOD_LABEL[form.method]}`);
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
