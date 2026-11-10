import { useState } from "react";
import { AlertTriangle, ClipboardCheck, Image as ImageIcon, Upload, Video, X } from "../../icons";
import { CHECK_KIND_LABEL, CHECK_STATUS_LABEL, checkOverdue, DELIVERABLE_LABEL, type QualityCheck } from "../lib/quality";
import { cn } from "../lib/utils";
import type { CheckAnswer } from "./link-source";

/*
 * One quality check from the supplier's side (PLAN 26): what the brand asked for, with the date, and a well to drop
 * the photos and video in, the batch number and a note, then Controle insturen. A rejected check shows why and can be
 * sent again. Its host sends the answer: the partner portal, or the check's link (M9.4).
 */

const due = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));

/** One check, from the supplier's side: what was asked, and the well to answer it in. Its host sends the answer. */
export function CheckCard({ c, brand, send }: { c: QualityCheck; brand: string; send: (answer: CheckAnswer) => Promise<string | null> }) {
	const now = Date.now();
	const open = c.status === "requested" || c.status === "rejected";
	const [photos, setPhotos] = useState<Array<{ name: string; url: string; video: boolean; file: File }>>([]);
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const [batch, setBatch] = useState("");
	const [note, setNote] = useState("");
	const late = checkOverdue(c, now);
	const needsPhotos = c.deliver.includes("photos");
	const needsBatch = c.deliver.includes("batch");
	const ready = (!needsPhotos || photos.some((p) => !p.video)) && (!needsBatch || batch.trim() !== "");
	return (
		<div className={cn("flex flex-col gap-3 rounded-xl px-4 py-4", open ? "bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]" : "bg-mist")}>
			<div className="flex flex-wrap items-center gap-2">
				<ClipboardCheck className="size-4 text-ink-3" strokeWidth={1.75} />
				<span className="font-medium text-ink">{CHECK_KIND_LABEL[c.kind]}</span>
				<span className={cn("rounded-sm px-1.5 py-px text-xs", late ? "bg-signal-red-bg text-signal-red" : c.status === "approved" ? "bg-signal-green-bg text-signal-green" : c.status === "rejected" ? "bg-signal-red-bg text-signal-red" : c.status === "submitted" ? "bg-signal-amber-bg text-signal-amber" : "bg-arc-tint text-arc-ink")}>
					{late ? "Te laat" : c.status === "submitted" ? "Ingestuurd" : CHECK_STATUS_LABEL[c.status]}
				</span>
				<span className="ml-auto text-ink-3 text-sm">vóór {due(c.due)}</span>
			</div>
			<p className="text-ink text-sm leading-relaxed">{c.note}</p>
			<p className="text-ink-2 text-sm">
				Aanleveren: {c.deliver.map((d) => DELIVERABLE_LABEL[d].toLowerCase()).join(", ")} · {c.variants.length ? c.variants.join(", ") : "alle maten"}
			</p>
			{c.status === "rejected" && c.verdict?.reason ? (
				<p className="flex items-start gap-2 rounded-lg bg-signal-red-bg px-3 py-2 text-ink text-sm">
					<AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-signal-red" strokeWidth={2} />
					<span>
						<span className="font-medium">{brand} keurde af:</span> {c.verdict.reason}
					</span>
				</p>
			) : null}
			{c.status === "submitted" ? <p className="text-ink-2 text-sm">Ingestuurd op {due(c.submission?.at ?? c.requestedAt)}. {brand} beoordeelt het.</p> : null}
			{open ? (
				<div className="flex flex-col gap-3">
					<label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg bg-mist px-4 py-6 text-center text-ink-2 text-sm transition-colors hover:bg-ink/6">
						<Upload className="size-5 text-ink-3" strokeWidth={1.75} />
						<span className="font-medium text-ink">Foto's en video kiezen</span>
						<span>Of sleep ze hierheen</span>
						<input
							type="file"
							accept="image/*,video/*"
							multiple
							className="sr-only"
							onChange={(e) => {
								const files = [...(e.target.files ?? [])];
								setPhotos((x) => [...x, ...files.map((f) => ({ name: f.name, url: URL.createObjectURL(f), video: f.type.startsWith("video/"), file: f }))].slice(0, 12));
								e.target.value = "";
							}}
						/>
					</label>
					{photos.length ? (
						<ul className="flex flex-wrap gap-2">
							{photos.map((p) => (
								<li key={p.url} className="relative">
									{p.video ? (
										<span className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-lg bg-mist text-ink-2 text-xs">
											<Video className="size-4" strokeWidth={1.75} />
											Video
										</span>
									) : (
										<img src={p.url} alt={p.name} className="size-16 rounded-lg object-cover" />
									)}
									<button type="button" aria-label={`${p.name} weghalen`} onClick={() => setPhotos((x) => x.filter((y) => y.url !== p.url))} className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-paper text-ink-2 shadow-[0_1px_3px_rgb(0_0_0/0.15)]">
										<X className="size-3" strokeWidth={2} />
									</button>
								</li>
							))}
						</ul>
					) : null}
					<div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
						<input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder={needsBatch ? "Batchnummer" : "Batchnummer (optioneel)"} aria-label="Batchnummer" className="field h-9 rounded-md px-3 text-ink text-sm outline-none placeholder:text-ink-3 focus:bg-paper" />
						<input value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Notitie voor ${brand} (optioneel)`} aria-label="Notitie" className="field h-9 rounded-md px-3 text-ink text-sm outline-none placeholder:text-ink-3 focus:bg-paper" />
					</div>
					<button
						type="button"
						disabled={!ready || busy}
						onClick={async () => {
							setBusy(true);
							const failed = await send({ files: photos.map((p) => p.file), batch: batch.trim() || undefined, note: note.trim() || undefined });
							setBusy(false);
							setProblem(failed);
							if (failed === null) setPhotos([]);
						}}
						className="flex h-9 w-fit items-center gap-1.5 rounded-md bg-abyss px-3.5 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2 disabled:cursor-not-allowed disabled:bg-ink/8 disabled:text-ink-3 disabled:shadow-none"
					>
						<ImageIcon className="size-3.5" strokeWidth={1.75} />
						Controle insturen
					</button>
					{problem ? (
						<p role="alert" className="flex items-start gap-2 rounded-lg bg-signal-red-bg px-3 py-2 text-ink text-sm">
							<AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-signal-red" strokeWidth={2} />
							<span>{problem}</span>
						</p>
					) : null}
					{!ready ? <p className="text-ink-3 text-xs">{needsPhotos && !photos.some((p) => !p.video) ? "Minstens één foto nodig." : "Vul het batchnummer in."}</p> : null}
				</div>
			) : null}
		</div>
	);
}
