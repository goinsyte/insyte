import { useEffect, useState } from "react";
import { Field, FormDialog, TextAreaField, TextField } from "../common/form-dialog";
import type { Address } from "../lib/types/domain";

/** An internal note on an order: for the team, never sent to the customer. */
export function OrderNoteDialog({
	open,
	onOpenChange,
	initial,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initial: string;
	onSave: (note: string) => void;
}) {
	const [note, setNote] = useState(initial);
	useEffect(() => {
		if (open) setNote(initial);
	}, [open, initial]);
	return (
		<FormDialog
			open={open}
			onOpenChange={onOpenChange}
			title={initial ? "Interne notitie bewerken" : "Interne notitie toevoegen"}
			description="Alleen je team ziet dit. Het blijft bij de bestelling."
			primaryLabel="Notitie opslaan"
			width={480}
			disabled={note.trim() === initial.trim()}
			onSubmit={() => {
				onSave(note.trim());
				onOpenChange(false);
			}}
		>
			<Field label="Notitie">
				<TextAreaField value={note} onChange={setNote} placeholder="Klant vroeg het bij de buren af te geven." rows={4} />
			</Field>
		</FormDialog>
	);
}

const EMPTY: Address = { line1: "", city: "", region: "", postal_code: "", country: "" };

/** The shipping address, edited where the operator reads it. */
export function ShippingDialog({
	open,
	onOpenChange,
	name,
	initial,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	name: string;
	initial: Address | undefined;
	onSave: (address: Address) => void;
}) {
	const [address, setAddress] = useState<Address>(initial ?? EMPTY);
	useEffect(() => {
		if (open) setAddress(initial ?? EMPTY);
	}, [open, initial]);
	const set = (key: keyof Address) => (value: string) => setAddress((a) => ({ ...a, [key]: value }));
	const complete = address.line1.trim() !== "" && address.city.trim() !== "" && address.postal_code.trim() !== "";
	return (
		<FormDialog
			open={open}
			onOpenChange={onOpenChange}
			title={`Verzenden naar ${name}`}
			description="Wijzigingen gaan bij de volgende statussynchronisatie naar de leverancier. Een pakket dat al is overgedragen houdt zijn oude verzendlabel."
			primaryLabel="Adres opslaan"
			width={520}
			disabled={!complete}
			onSubmit={() => {
				onSave(address);
				onOpenChange(false);
			}}
		>
			<Field label="Straat en huisnummer">
				<TextField value={address.line1} onChange={set("line1")} placeholder="Herengracht 182" />
			</Field>
			<div className="grid grid-cols-[1fr_140px] gap-3">
				<Field label="Plaats">
					<TextField value={address.city} onChange={set("city")} placeholder="Amsterdam" />
				</Field>
				<Field label="Postcode">
					<TextField value={address.postal_code} onChange={set("postal_code")} placeholder="1016 BR" />
				</Field>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<Field label="Provincie of regio">
					<TextField value={address.region} onChange={set("region")} placeholder="Noord-Holland" />
				</Field>
				<Field label="Landcode">
					<TextField value={address.country} onChange={set("country")} placeholder="NL" />
				</Field>
			</div>
		</FormDialog>
	);
}
