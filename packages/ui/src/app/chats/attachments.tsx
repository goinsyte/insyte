import { FileText, Image as ImageIcon, X } from "../../icons";
import { cn } from "../lib/utils";

/**
 * Files in a chat. Nothing is uploaded: a file picked or dropped in this tab is shown from the
 * browser's own copy, so an image previews for as long as the tab is open. After a reload the
 * message still names the file and its size, and says the preview is gone rather than faking one.
 */
export type Attachment = { id: string; name: string; size: number; type: string };

const PREVIEWS = new Map<string, string>();

export function fromFiles(files: Iterable<File>): Attachment[] {
	return [...files].map((f) => {
		const id = `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
		if (f.type.startsWith("image/")) PREVIEWS.set(id, URL.createObjectURL(f));
		return { id, name: f.name, size: f.size, type: f.type };
	});
}

export function forget(id: string) {
	const url = PREVIEWS.get(id);
	if (url) URL.revokeObjectURL(url);
	PREVIEWS.delete(id);
}

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

const kindOf = (a: Attachment) => (a.type.startsWith("image/") ? "Afbeelding" : (a.name.split(".").pop()?.toUpperCase() ?? "Bestand"));

/** An attachment as sent: the image itself when this tab still has it, otherwise a file tile. */
export function AttachmentTile({ a }: { a: Attachment }) {
	const url = PREVIEWS.get(a.id);
	if (url)
		return (
			<a href={url} target="_blank" rel="noreferrer" className="block w-fit overflow-hidden rounded-lg bg-mist" title={a.name}>
				<img src={url} alt={a.name} className="max-h-56 max-w-[320px] object-cover" />
			</a>
		);
	const Glyph = a.type.startsWith("image/") ? ImageIcon : FileText;
	return (
		<span className="flex w-fit max-w-[320px] items-center gap-2.5 rounded-lg bg-mist py-2 pr-3.5 pl-2">
			<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-paper text-ink-2">
				<Glyph className="size-4" strokeWidth={1.75} />
			</span>
			<span className="flex min-w-0 flex-col">
				<span className="truncate font-medium text-sm text-ink">{a.name}</span>
				<span className="text-xs text-ink-3 tabular-nums">
					{kindOf(a)} · {formatSize(a.size)}
					{a.type.startsWith("image/") ? " · voorbeeld niet bewaard" : ""}
				</span>
			</span>
		</span>
	);
}

/** What is about to be sent, each with a way to take it back out. */
export function PendingAttachments({ items, onRemove }: { items: ReadonlyArray<Attachment>; onRemove: (id: string) => void }) {
	if (items.length === 0) return null;
	return (
		<ul aria-label="Bijgevoegde bestanden" className="flex flex-wrap gap-1.5 px-3 pt-3">
			{items.map((a) => {
				const url = PREVIEWS.get(a.id);
				return (
					<li key={a.id} className="flex h-9 items-center gap-2 rounded-lg bg-mist py-1 pr-1 pl-1">
						{url ? (
							<img src={url} alt="" className="size-7 rounded-md object-cover" />
						) : (
							<span className="flex size-7 items-center justify-center rounded-md bg-paper text-ink-3">
								<FileText className="size-3.5" strokeWidth={1.75} />
							</span>
						)}
						<span className="flex max-w-40 flex-col leading-tight">
							<span className="truncate font-medium text-sm text-ink">{a.name}</span>
							<span className="text-xs text-ink-3 tabular-nums">{formatSize(a.size)}</span>
						</span>
						<button
							type="button"
							aria-label={`${a.name} verwijderen`}
							onClick={() => onRemove(a.id)}
							className={cn("flex size-6 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink")}
						>
							<X className="size-3.5" strokeWidth={1.75} />
						</button>
					</li>
				);
			})}
		</ul>
	);
}
