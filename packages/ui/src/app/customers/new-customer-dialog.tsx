import { useState } from "react";
import { toast } from "sonner";
import {
	ChipGroup,
	Field,
	FormDialog,
	SelectField,
	TextField,
} from "../common/form-dialog";

const COUNTRIES = [
	"US",
	"GB",
	"CA",
	"AU",
	"DE",
	"FR",
	"IT",
	"ES",
	"NL",
	"JP",
] as const;

const TAGS = [
	{ id: "vip", label: "VIP" },
	{ id: "newsletter", label: "Nieuwsbrief" },
	{ id: "wholesale", label: "Groothandel" },
	{ id: "press", label: "Pers" },
	{ id: "affiliate", label: "Affiliate" },
] as const;

type TagId = (typeof TAGS)[number]["id"];

export type NewCustomerInput = {
	name: string;
	email: string;
	phone: string;
	country: string;
	tags: string[];
};

export function NewCustomerDialog({
	open,
	onOpenChange,
	onCreate,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onCreate: (input: NewCustomerInput) => void;
}) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [country, setCountry] = useState<(typeof COUNTRIES)[number]>("US");
	const [tags, setTags] = useState<TagId[]>([]);

	function reset() {
		setName("");
		setEmail("");
		setPhone("");
		setCountry("US");
		setTags([]);
	}

	function submit() {
		if (!name.trim() || !email.trim()) {
			toast.error("Naam en e-mailadres zijn verplicht");
			return;
		}
		onCreate({ name, email, phone, country, tags });
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
			title="Nieuwe klant"
			description="Voeg een klantprofiel toe dat synchroniseert met Shopify, Klaviyo en je inbox."
			primaryLabel="Klant aanmaken"
			onSubmit={submit}
			disabled={!name.trim() || !email.trim()}
		>
			<div className="grid grid-cols-2 gap-4">
				<Field label="Volledige naam">
					<TextField
						value={name}
						onChange={setName}
						placeholder="Mason Garcia"
					/>
				</Field>
				<Field label="E-mail">
					<TextField
						value={email}
						onChange={setEmail}
						placeholder="mason@example.com"
						type="email"
					/>
				</Field>
			</div>
			<div className="grid grid-cols-2 gap-4">
				<Field label="Telefoon (optioneel)">
					<TextField
						value={phone}
						onChange={setPhone}
						placeholder="+1 555 123 4567"
					/>
				</Field>
				<Field label="Land">
					<SelectField
						value={country}
						onChange={setCountry}
						options={COUNTRIES}
					/>
				</Field>
			</div>
			<Field label="Labels">
				<ChipGroup
					value={tags}
					options={TAGS}
					onToggle={(id) =>
						setTags((cur) =>
							cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id],
						)
					}
				/>
			</Field>
		</FormDialog>
	);
}
