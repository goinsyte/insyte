
import { FieldRow, SelectInput, UnsavedBar } from "./form";
import { useState } from "react";
import { toast } from "sonner";
import { SettingCard } from "./setting-card";

export function RegionalPage() {
	const initial = {
		language: "Nederlands",
		currency: "EUR · euro",
		dateFormat: "DD MMM YYYY",
		timeFormat: "24-uurs",
		weekStart: "Maandag",
		timezone: "Europe/Amsterdam (UTC+1)",
	};
	const [saved, setSaved] = useState(initial);
	const [form, setForm] = useState(initial);
	const dirty = (Object.keys(form) as Array<keyof typeof form>).some((k) => form[k] !== saved[k]);
	const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

	return (
		<>
		<SettingCard title="Taal en notatie">
			<div className="flex flex-col">
				<FieldRow label="Taal">
					<SelectInput
						value={form.language}
						onChange={(v) => set("language", v)}
						options={[
							"Nederlands",
							"English (United States)",
							"English (United Kingdom)",
							"Deutsch",
							"Français",
						]}
					/>
				</FieldRow>
				<FieldRow label="Valuta">
					<SelectInput
						value={form.currency}
						onChange={(v) => set("currency", v)}
						options={[
							"EUR · euro",
							"USD · Amerikaanse dollar",
							"GBP · Brits pond",
							"JPY · Japanse yen",
						]}
					/>
				</FieldRow>
				<FieldRow label="Datumnotatie">
					<SelectInput
						value={form.dateFormat}
						onChange={(v) => set("dateFormat", v)}
						options={["DD MMM YYYY", "MMM DD, YYYY", "YYYY-MM-DD"]}
					/>
				</FieldRow>
				<FieldRow label="Tijdnotatie">
					<SelectInput
						value={form.timeFormat}
						onChange={(v) => set("timeFormat", v)}
						options={["24-uurs", "12-uurs"]}
					/>
				</FieldRow>
				<FieldRow label="Week begint op">
					<SelectInput
						value={form.weekStart}
						onChange={(v) => set("weekStart", v)}
						options={["Maandag", "Zondag", "Zaterdag"]}
					/>
				</FieldRow>
				<FieldRow label="Tijdzone">
					<SelectInput
						value={form.timezone}
						onChange={(v) => set("timezone", v)}
						options={[
							"Europe/Amsterdam (UTC+1)",
							"Europe/London (UTC+0)",
							"America/New_York (UTC-5)",
							"Asia/Tokyo (UTC+9)",
						]}
					/>
				</FieldRow>
			</div>
		</SettingCard>
		<UnsavedBar
			visible={dirty}
			onDiscard={() => setForm(saved)}
			onSave={() => {
				setSaved(form);
				toast.success("Taal en notatie opgeslagen");
			}}
		/>
		</>
	);
}

