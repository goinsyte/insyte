import { Plus, Trash2 } from "../../icons";
import { useState } from "react";
import { toast } from "sonner";
import {
	Field,
	FormDialog,
	SelectField,
	TextAreaField,
	TextField,
} from "../common/form-dialog";

const STORES = ["Allure DE", "Allure FR", "Allure UK", "Allure US"] as const;

const PAYMENTS = ["Stripe", "PayPal", "Klarna", "Manual"] as const;

type LineItem = { sku: string; title: string; qty: number; price: number };

export type NewOrderInput = {
	customer_name: string;
	customer_email: string;
	store: string;
	payment_method: string;
	notes: string;
	items: LineItem[];
};

export function NewOrderDialog({
	open,
	onOpenChange,
	onCreate,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onCreate: (input: NewOrderInput) => void;
}) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [store, setStore] = useState<(typeof STORES)[number]>("Allure US");
	const [payment, setPayment] = useState<(typeof PAYMENTS)[number]>("Stripe");
	const [notes, setNotes] = useState("");
	const [items, setItems] = useState<LineItem[]>([
		{ sku: "", title: "", qty: 1, price: 0 },
	]);

	function reset() {
		setName("");
		setEmail("");
		setStore("Allure US");
		setPayment("Stripe");
		setNotes("");
		setItems([{ sku: "", title: "", qty: 1, price: 0 }]);
	}

	function setItem(i: number, patch: Partial<LineItem>) {
		setItems((xs) => xs.map((it, k) => (k === i ? { ...it, ...patch } : it)));
	}

	function addItem() {
		setItems((xs) => [...xs, { sku: "", title: "", qty: 1, price: 0 }]);
	}

	function removeItem(i: number) {
		setItems((xs) => xs.filter((_, k) => k !== i));
	}

	const itemsTotal = items.reduce((sum, it) => sum + it.qty * it.price, 0);

	function submit() {
		if (!name.trim() || !email.trim()) {
			toast.error("Naam en e-mailadres van de klant zijn verplicht");
			return;
		}
		const validItems = items.filter((i) => i.title.trim() && i.qty > 0);
		if (validItems.length === 0) {
			toast.error("Voeg minstens één artikel toe");
			return;
		}
		onCreate({
			customer_name: name,
			customer_email: email,
			store,
			payment_method: payment,
			notes,
			items: validItems,
		});
		reset();
		onOpenChange(false);
	}

	return (
		<FormDialog
			open={open}
			onOpenChange={(v) => {
				if (!v) reset();
				onOpenChange(v);
			}}
			title="Nieuwe bestelling"
			description="Leg een handmatige bestelling vast. Betaling en afhandeling starten zodra je hem aanmaakt."
			primaryLabel="Conceptbestelling aanmaken"
			onSubmit={submit}
			width={680}
		>
			<div className="grid grid-cols-2 gap-4">
				<Field label="Naam klant">
					<TextField
						value={name}
						onChange={setName}
						placeholder="Mason Garcia"
					/>
				</Field>
				<Field label="E-mailadres klant">
					<TextField
						value={email}
						onChange={setEmail}
						placeholder="mason@example.com"
						type="email"
					/>
				</Field>
			</div>
			<div className="grid grid-cols-2 gap-4">
				<Field label="Winkel">
					<SelectField value={store} onChange={setStore} options={STORES} />
				</Field>
				<Field label="Betaalmethode">
					<SelectField
						value={payment}
						onChange={setPayment}
						options={PAYMENTS}
						renderLabel={(v) => (v === "Manual" ? "Handmatig" : v)}
					/>
				</Field>
			</div>
			<Field label="Artikelen">
				<div className="flex flex-col gap-2">
					{items.map((it, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: editable rows keyed by position
							key={i}
							className="grid grid-cols-[1fr_2fr_72px_96px_32px] items-center gap-2"
						>
							<TextField
								value={it.sku}
								onChange={(v) => setItem(i, { sku: v })}
								placeholder="SKU"
							/>
							<TextField
								value={it.title}
								onChange={(v) => setItem(i, { title: v })}
								placeholder="Product"
							/>
							<TextField
								value={String(it.qty)}
								onChange={(v) =>
									setItem(i, { qty: Number.parseInt(v, 10) || 0 })
								}
								placeholder="Aantal"
								type="number"
							/>
							<TextField
								value={String(it.price)}
								onChange={(v) =>
									setItem(i, { price: Number.parseFloat(v) || 0 })
								}
								placeholder="Prijs"
								type="number"
							/>
							<button
								type="button"
								aria-label="Artikel verwijderen"
								onClick={() => removeItem(i)}
								disabled={items.length === 1}
								className="flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-signal-red-bg hover:text-signal-red disabled:opacity-40 disabled:hover:bg-transparent"
							>
								<Trash2 className="size-4" strokeWidth={1.75} />
							</button>
						</div>
					))}
					<button
						type="button"
						onClick={addItem}
						className="flex h-8 w-fit items-center gap-1.5 rounded-md bg-paper px-3 py-1.5 font-medium text-sm text-ink-3 hairline hover:bg-mist hover:text-ink"
					>
						<Plus className="size-3.5" strokeWidth={1.75} />
						Artikel toevoegen
					</button>
				</div>
			</Field>
			<Field label="Interne notitie (optioneel)">
				<TextAreaField
					value={notes}
					onChange={setNotes}
					placeholder="Klant wil het als cadeau ingepakt…"
					rows={2}
				/>
			</Field>
			<div className="flex items-center justify-between rounded-lg bg-mist p-3">
				<span className="font-medium text-sm text-ink-3">
					Subtotaal ({items.filter((i) => i.title.trim()).length} artikelen)
				</span>
				<span className="font-medium text-lg text-ink">
					{new Intl.NumberFormat("nl-NL", { style: "currency", currency: "USD" }).format(itemsTotal)}
				</span>
			</div>
		</FormDialog>
	);
}
