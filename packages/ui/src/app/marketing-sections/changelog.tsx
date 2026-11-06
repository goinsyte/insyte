import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/dialog";
import { Link } from "@tanstack/react-router";
import { TravelArrow } from "./link-index";

/**
 * "Nieuw in Insyte": what was added lately, newest first. Every entry is something this console
 * does today, written down in DESIGN.md, and opens the place where it lives — a changelog that
 * describes a feature nobody can find is a promise, not a log.
 */
const ENTRIES: ReadonlyArray<{ at: string; title: string; body: string; to: string; search?: Record<string, unknown> }> = [
	{
		at: "2026-10-27",
		title: "Filters die je bewaart",
		body: "Regels die lezen als een zin, groepen met en/of, en elke filter op te slaan als weergave boven de lijst.",
		to: "/orders",
	},
	{
		at: "2026-10-22",
		title: "Dubbele klanten samenvoegen",
		body: "Insyte vindt profielen van dezelfde persoon en vraagt per groep of ze samen moeten. Met Ongedaan maken.",
		to: "/customers",
	},
	{
		at: "2026-10-16",
		title: "Het leveranciersportaal",
		body: "Leveranciers accepteren bestellingen, verzenden met track & trace en melden problemen, in je eigen werkruimte.",
		to: "/suppliers",
	},
	{
		at: "2026-10-09",
		title: "Mijn werk en Agenda op Start",
		body: "Je to-do's, toegewezen tickets en deadlines op één lijst, en alles met een tijd op één klok.",
		to: "/dashboard",
		search: { view: "werk" },
	},
	{
		at: "2026-10-02",
		title: "Mailboxen in de inbox",
		body: "Gesprekken per gekoppelde mailbox, toe te wijzen aan een collega, met een melding als een koppeling verloopt.",
		to: "/inbox",
	},
];

const date = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" });

export function ChangelogDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[560px]">
				<DialogHeader>
					<DialogTitle>Nieuw in Insyte</DialogTitle>
					<DialogDescription>Wat er de afgelopen weken bij kwam, het nieuwste eerst.</DialogDescription>
				</DialogHeader>
				<ol className="-mx-2 flex flex-col">
					{ENTRIES.map((e) => (
						<li key={e.at}>
							<Link
								to={e.to}
								search={e.search as never}
								onClick={() => onOpenChange(false)}
								className="group/dest grid grid-cols-[88px_minmax(0,1fr)_auto] items-start gap-x-3 rounded-lg px-2 py-3 transition-colors hover:bg-arc-tint focus-visible:bg-arc-tint"
							>
								<time dateTime={e.at} className="pt-0.5 text-ink-3 text-sm">
									{date.format(new Date(`${e.at}T12:00:00`))}
								</time>
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="font-medium text-base text-ink transition-colors group-hover/dest:text-arc-ink">{e.title}</span>
									<span className="text-ink-3 text-sm text-pretty">{e.body}</span>
								</span>
								<TravelArrow className="mt-1 size-4 text-ink-3 group-hover/dest:text-arc-ink" />
							</Link>
						</li>
					))}
				</ol>
			</DialogContent>
		</Dialog>
	);
}
