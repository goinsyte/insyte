import { useEffect, useMemo, useState } from "react";
import { Field, FormDialog, SelectField, TextField } from "../common/form-dialog";
import { QrCode } from "./qr";
import { type Medium, useAffiliatePortal } from "./source";

const MEDIUM: Record<string, string> = { social: "Social media", video: "Video", email: "Nieuwsbrief", blog: "Blog of website", print: "Print" };

const slug = (s: string) =>
	s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");

/**
 * A new link: what it is for, where it lands, and how it is tagged so the brand's analytics see where
 * the click came from. The finished address and its QR code are shown before it is made.
 */
export function NewLinkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
	const { useDestinations, previewUrl, createLink } = useAffiliatePortal();
	const DESTINATIONS = useDestinations();
	const [label, setLabel] = useState("");
	const [dest, setDest] = useState<string>("home");
	const [medium, setMedium] = useState("social");

	useEffect(() => {
		if (open) {
			setLabel("");
			setDest("home");
			setMedium("social");
		}
	}, [open]);

	const url = useMemo(() => previewUrl(dest, medium as Medium, slug(label) || "link"), [previewUrl, dest, medium, label]);

	return (
		<FormDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Nieuwe link"
			description="Elke klik en elke bestelling via deze link komt op jouw naam."
			primaryLabel="Link maken"
			disabled={label.trim() === ""}
			width={560}
			onSubmit={() => {
				createLink({ label: label.trim(), destinationId: dest, medium: medium as Medium, campaign: slug(label) || "link" }, { message: `Link “${label.trim()}” gemaakt` });
				onOpenChange(false);
			}}
		>
			<Field label="Waar gebruik je hem">
				<TextField value={label} onChange={setLabel} placeholder="Bijvoorbeeld: TikTok-video zomerjassen" />
			</Field>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Komt uit op">
					<SelectField value={dest} onChange={setDest} options={DESTINATIONS.map((d) => d.id)} renderLabel={(id) => DESTINATIONS.find((d) => d.id === id)?.label ?? id} />
				</Field>
				<Field label="Kanaal">
					<SelectField value={medium} onChange={setMedium} options={Object.keys(MEDIUM)} renderLabel={(m) => MEDIUM[m] ?? m} />
				</Field>
			</div>
			<div className="flex items-center gap-4 rounded-xl bg-mist p-3">
				<QrCode text={`https://${url}`} size={88} className="shrink-0 rounded-md" />
				<p className="min-w-0 break-all text-ink-2 text-sm">https://{url}</p>
			</div>
		</FormDialog>
	);
}
