/** The well's Markdown, read: `##` headings, `-` and `1.` lists, paragraphs. Nothing else is needed here. */
export function Markdown({ text }: { text: string }) {
	const blocks = text.split(/\n{2,}/);
	return (
		<div className="flex max-w-[68ch] flex-col gap-3 text-base text-ink leading-[1.65]">
			{blocks.map((b, i) => {
				const lines = b.split("\n").filter(Boolean);
				if (lines.length === 0) return null;
				if (lines[0]!.startsWith("## ")) return <h3 key={i} className="pt-1 font-medium text-ink text-md">{lines[0]!.slice(3)}</h3>;
				if (lines.every((l) => /^- /.test(l))) return <ul key={i} className="flex list-disc flex-col gap-1 pl-5">{lines.map((l) => <li key={l}>{l.slice(2)}</li>)}</ul>;
				if (lines.every((l) => /^\d+\. /.test(l))) return <ol key={i} className="flex list-decimal flex-col gap-1 pl-5">{lines.map((l) => <li key={l}>{l.replace(/^\d+\. /, "")}</li>)}</ol>;
				return <p key={i}>{lines.join(" ")}</p>;
			})}
		</div>
	);
}
