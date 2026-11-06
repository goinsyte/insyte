import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "../../components/accordion";
import { Button } from "../../components/button";
import { Card } from "../../components/card";
import { Download, FileText, Image, Video } from "../../icons";
import { toast } from "sonner";
import { PageHeader } from "../common/page-header";
import { formatDate } from "../lib/format";
import {
	type AffiliateResource,
	affiliateFaqs,
	affiliateResources,
} from "../../data-source";

const ICONS = {
	logo: FileText,
	image: Image,
	video: Video,
	doc: FileText,
	guide: FileText,
} as const;

/*
 * The demo has no asset bucket, so a download hands over a small text file named after the
 * resource. It saves like the real thing and says plainly what it stands in for.
 */
function download(r: AffiliateResource) {
	const slug = r.name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	const body = `${r.name}\n${r.size} · bijgewerkt ${formatDate(r.updated_at)}\n\nPlaceholderbestand uit de Insyte-demo. In productie downloadt hier het echte bestand.\n`;
	const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = `${slug}.txt`;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
	toast.success(`${r.name} wordt gedownload`);
}

export function Resources() {
	return (
		<div>
			<PageHeader
				title="Materiaal"
			/>
			<div className="grid gap-3 p-6 lg:grid-cols-[1fr_320px]">
				<div className="grid gap-3 sm:grid-cols-2">
					{affiliateResources.map((r) => {
						const Icon = ICONS[r.kind];
						return (
							<Card key={r.id} className="flex items-center gap-3 p-4 font-medium text-xs">
								<div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
									<Icon className="size-4" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="truncate font-medium">{r.name}</div>
									<div className="font-medium text-2xs text-muted-foreground">
										{r.size} · bijgewerkt {formatDate(r.updated_at)}
									</div>
								</div>
								<Button
									size="icon-sm"
									variant="outline"
									aria-label={`${r.name} downloaden`}
									onClick={() => download(r)}
								>
									<Download className="size-3.5" />
								</Button>
							</Card>
						);
					})}
				</div>

				<Card className="p-5">
					<div className="font-medium text-sm text-muted-foreground">
						Veelgestelde vragen
					</div>
					<Accordion type="single" collapsible className="mt-2 font-medium text-xs">
						{affiliateFaqs.map((f, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static FAQ list, never reordered
							<AccordionItem key={i} value={`faq-${i}`}>
								<AccordionTrigger className="font-medium text-xs">{f.q}</AccordionTrigger>
								<AccordionContent className="text-muted-foreground">
									{f.a}
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</Card>
			</div>
		</div>
	);
}
