import { useState } from "react";
import { toast } from "sonner";
import {
	Field,
	FormDialog,
	SelectField,
	TextField,
} from "../common/form-dialog";

const PLATFORMS = ["Shopify", "Shopify Plus"] as const;

export type AddStoreInput = {
	name: string;
	domain: string;
	platform: (typeof PLATFORMS)[number];
	apiKey: string;
};

export function AddStoreDialog({
	open,
	onOpenChange,
	onAdd,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onAdd: (input: AddStoreInput) => void;
}) {
	const [name, setName] = useState("");
	const [domain, setDomain] = useState("");
	const [platform, setPlatform] =
		useState<(typeof PLATFORMS)[number]>("Shopify");
	const [apiKey, setApiKey] = useState("");

	function reset() {
		setName("");
		setDomain("");
		setPlatform("Shopify");
		setApiKey("");
	}

	function submit() {
		if (!name.trim() || !domain.trim()) {
			toast.error("Winkelnaam en domein zijn verplicht");
			return;
		}
		onAdd({ name, domain, platform, apiKey });
		toast.success(`${name} staat klaar om te koppelen`);
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
			title="Winkel toevoegen"
			description="Koppel een Shopify-winkel. Bestellingen, producten en klanten worden binnen enkele minuten gesynchroniseerd."
			primaryLabel="Winkel koppelen"
			onSubmit={submit}
			disabled={!name.trim() || !domain.trim()}
		>
			<div className="grid grid-cols-2 gap-4">
				<Field label="Winkelnaam">
					<TextField value={name} onChange={setName} placeholder="Allure DE" />
				</Field>
				<Field label="Domein">
					<TextField
						value={domain}
						onChange={setDomain}
						placeholder="allure-de.myshopify.com"
					/>
				</Field>
			</div>
			<Field label="Platform">
				<SelectField
					value={platform}
					onChange={setPlatform}
					options={PLATFORMS}
				/>
			</Field>
			<Field
				label="API-toegangstoken"
				hint="Maak er een aan in Shopify → Apps en verkoopkanalen → Apps ontwikkelen."
			>
				<TextField value={apiKey} onChange={setApiKey} placeholder="shpat_…" />
			</Field>
		</FormDialog>
	);
}
