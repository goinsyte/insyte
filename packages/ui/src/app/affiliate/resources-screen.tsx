import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "../../components/accordion";
import { Button } from "../../components/button";
import { Card } from "../../components/card";
import { Download, FileText, Image, Video } from "../../icons";
import { PageHeader } from "../common/page-header";
import { formatDate } from "../lib/format";
import { useAffiliatePortal } from "./source";

const ICONS = {
	logo: FileText,
	image: Image,
	video: Video,
	doc: FileText,
	guide: FileText,
} as const;

/** The brand's material to share, and the programme's questions answered. Empty, the grid says so. */
export function Resources() {
	const { useResources, download, preview } = useAffiliatePortal();
	const { resources: affiliateResources, faqs: affiliateFaqs } = useResources();
	return (
		<div>
			<PageHeader
				title="Materiaal"
			/>
			<div className="grid gap-3 p-6 lg:grid-cols-[1fr_320px]">
				<div className="grid gap-3 sm:grid-cols-2">
					{affiliateResources.length === 0 ? (
						<p className="text-ink-3 text-sm sm:col-span-2">Nog geen materiaal. Zodra er iets klaarstaat, vind je het hier.</p>
					) : null}
					{affiliateResources.map((r) => {
						const Icon = ICONS[r.kind];
						return (
							<Card key={r.id} className="flex items-center gap-3 p-4 font-medium text-xs">
								<div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
									<Icon className="size-4" />
								</div>
								<div className="min-w-0 flex-1">
									{preview && r.previewable ? (
										<button type="button" onClick={() => preview(r)} className="block max-w-full cursor-pointer truncate text-left font-medium hover:underline">
											{r.name}
										</button>
									) : (
										<div className="truncate font-medium">{r.name}</div>
									)}
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
