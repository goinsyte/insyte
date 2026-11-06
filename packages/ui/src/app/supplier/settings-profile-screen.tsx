
import { Upload } from "../../icons";
import { useRef, useState } from "react";
import { PageGuide } from "../common/page-guide";
import { FieldRow, INPUT_CLASS, TextInput, UnsavedBar } from "../settings/form";
import { SettingCard } from "../settings/setting-card";
import { undoable } from "../lib/undo";
import { type SupplierProfile, useSupplier } from "../stores/supplier-store";

const GUIDE = [
	{ title: "Je bedrijf", body: "Staat op je pakbonnen en in de antwoorden van Northwind over een retour.", art: "parcel" },
	{ title: "Contact", body: "Voor Northwind, niet voor klanten.", art: "people" },
] as const;

/** The supplier's business as Northwind and its customers see it: on packing slips and in replies about a refund. */
export function SupplierProfilePage() {
	const saved = useSupplier((s) => s.profile);
	const save = useSupplier((s) => s.saveProfile);
	const [form, setForm] = useState<SupplierProfile>(saved);
	const file = useRef<HTMLInputElement>(null);
	const set = (p: Partial<SupplierProfile>) => setForm((f) => ({ ...f, ...p }));
	const dirty = JSON.stringify(form) !== JSON.stringify(saved);

	function pickLogo(f: File | undefined) {
		if (!f || !f.type.startsWith("image/")) return;
		// Kept as a data URL so the logo survives a reload, like the rest of the profile.
		const reader = new FileReader();
		reader.onload = () => set({ logo: String(reader.result) });
		reader.readAsDataURL(f);
	}

	return (
		<div className="flex flex-col gap-10">
			<SettingCard title="Bedrijf">
				<div className="flex flex-col rounded-xl bg-paper px-5 py-3">
					<FieldRow label="Logo" hint="Vierkant, minstens 200 pixels.">
						<span className="flex items-center gap-3">
							<span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-mist font-medium text-ink-3 text-sm">
								{form.logo ? <img src={form.logo} alt="Logo" className="size-full object-cover" /> : form.name.slice(0, 2).toUpperCase()}
							</span>
							<button
								type="button"
								onClick={() => file.current?.click()}
								className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-mist px-3 font-medium text-ink text-sm hover:bg-ink/8"
							>
								<Upload className="size-3.5" strokeWidth={1.75} />
								{form.logo ? "Ander logo" : "Logo kiezen"}
							</button>
							{form.logo ? (
								<button type="button" onClick={() => set({ logo: null })} className="cursor-pointer text-ink-3 text-sm hover:text-ink">
									Verwijderen
								</button>
							) : null}
							<input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
						</span>
					</FieldRow>
					<FieldRow label="Bedrijfsnaam">
						<TextInput value={form.name} onChange={(name) => set({ name })} />
					</FieldRow>
					<FieldRow label="Wat je levert" hint="Categorieën, levertijden, minimale afname.">
						<textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={3} className={`${INPUT_CLASS} h-auto py-2`} />
					</FieldRow>
				</div>
			</SettingCard>
			<SettingCard title="Contact">
				<div className="flex flex-col rounded-xl bg-paper px-5 py-3">
					<FieldRow label="E-mailadres">
						<TextInput type="email" value={form.contact_email} onChange={(contact_email) => set({ contact_email })} />
					</FieldRow>
					<FieldRow label="Telefoon">
						<TextInput type="tel" value={form.contact_phone} onChange={(contact_phone) => set({ contact_phone })} />
					</FieldRow>
				</div>
			</SettingCard>
			<UnsavedBar
				visible={dirty}
				onDiscard={() => setForm(saved)}
				onSave={() => {
					if (!form.name.trim()) return;
					const before = saved;
					save({ ...form, name: form.name.trim() });
					undoable("Bedrijfsprofiel opgeslagen", () => save(before));
				}}
			/>
			<PageGuide id="supplier.settings.profile" title="Bedrijfsprofiel" steps={GUIDE} />
		</div>
	);
}
