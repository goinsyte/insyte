import { ArrowUpRight, Box, Inbox, LayoutGrid, Sparkle, UserPlus, Workflow } from "../../icons";
import { Link } from "@tanstack/react-router";
import { Glyph } from "../common/glyph";
import { PageGuide } from "../common/page-guide";
import { DashboardClosing } from "../marketing-sections/closings";
import { setScenario } from "../../data-source";
import { appHref } from "../../data-source/hrefs";
import { useHome } from "../stores/home-store";
import { useWorkspace } from "../stores/workspace-store";
import { Areas } from "./areas";
import { SetupChecklist, SetupPlate } from "./setup-checklist";
import { useSetupTasks } from "./widgets";

const GUIDE = [
	{ title: "Inrichten", body: "Volg de stappen tot Insyte draait. Wat je overslaat, kan later onder Instellingen.", art: "flow" },
	{ title: "Je wachtrij", body: "Loopt een bestelling vast, schrijft een klant of wordt een betaling betwist, dan staat het hier, op volgorde van resterende tijd.", art: "hours" },
	{ title: "Insyte leest mee", body: "Bestellingen, tickets, inbox en geschillen, in alle gekoppelde winkels.", art: "log" },
	{ title: "En tekent een voorstel", body: "Een antwoord, een bewijspakket, een bericht aan de leverancier: getekend, niet verstuurd.", art: "chat" },
	{ title: "Binnen jouw regels", body: "Wat geld of klanten raakt, legt Insyte eerst aan je voor: uitvoeren, opnieuw tekenen of negeren.", art: "rules" },
] as const;

/**
 * The home on the first day, when every list is empty. A board of zeros would be the product saying
 * nothing in nine places, so the first day opens on the plate: how far setup is and the one next
 * step, with the steps drawn as the Drift mark's offset squares filling in. Under it the checklist,
 * the empty queue on the plate ground its proposals will arrive on, and where to go next. What
 * Insyte will do once there is work lives in the page guide.
 */
export function FirstRun() {
	const tasks = useSetupTasks();
	const toggleTask = useHome((s) => s.toggleTask);
	const setBoard = useHome((s) => s.setBoardOnFirstDay);
	const workspace = useWorkspace((s) => s.account.workspace);

	return (
		<div className="flex flex-col gap-5">
			<SetupPlate
				tasks={tasks}
				workspace={workspace}
				actions={
					<button
						type="button"
						onClick={() => setScenario("settled", appHref("/dashboard"))}
						className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 font-medium text-mesh-ink-2 text-sm transition-colors hover:bg-mesh-ink/10 hover:text-mesh-ink"
					>
						Bekijk een gewone dinsdag
						<ArrowUpRight className="size-3.5" strokeWidth={2} />
					</button>
				}
			/>

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
				<SetupChecklist tasks={tasks} onToggle={toggleTask} />

				<section aria-labelledby="queue-empty" className="relative isolate flex flex-col gap-4 overflow-hidden rounded-xl bg-stripe-mesh-dark p-5 text-mesh-ink">
					<div className="pointer-events-none absolute inset-0 -z-0 bg-dot-grid opacity-25" aria-hidden />
					<div className="relative flex items-center gap-2">
						<Glyph icon={Inbox} tile="mesh" size={14} draw={false} />
						<h2 id="queue-empty" className="font-medium text-md">
							Je wachtrij
						</h2>
					</div>
					<p className="relative text-base text-mesh-ink-2">Nog leeg.</p>
					<div className="relative mt-auto flex flex-wrap gap-2 pt-1">
						<Link to="/ask" className="flex h-8 items-center gap-1.5 rounded-md bg-paper px-3 font-medium text-abyss text-sm hover:bg-paper/90">
							<Sparkle className="size-3.5" strokeWidth={1.75} />
							Vraag Insyte iets
						</Link>
					</div>
				</section>
			</div>

			<section aria-labelledby="first-steps" className="flex flex-col gap-2">
				<h2 id="first-steps" className="px-1 font-medium text-md text-ink">
					Je eerste week
				</h2>
				<ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
					{[
						{ to: "/products", icon: Box, title: "Je catalogus importeren", body: "Producten en varianten uit Shopify, met foto's en voorraad." },
						{ to: "/settings/team", icon: UserPlus, title: "Je team uitnodigen", body: "Wie tickets beantwoordt en wie leveranciers aanspoort." },
						{ to: "/automations", icon: Workflow, title: "Een startflow aanzetten", body: "Late bestellingen melden voordat de klant erom vraagt." },
						{ to: "/inbox", icon: Inbox, title: "Je inbox koppelen", body: "Dan stelt Insyte antwoorden op voor elke nieuwe vraag." },
					].map((s) => (
						<li key={s.to}>
							<Link to={s.to} className="glyph-host flex h-full items-start gap-3 rounded-xl bg-paper px-3.5 py-3 transition-colors hover:bg-paper/70">
								<Glyph icon={s.icon} tile="mist" size={15} draw={false} />
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="font-medium text-base text-ink">{s.title}</span>
									<span className="text-sm text-ink-3">{s.body}</span>
								</span>
							</Link>
						</li>
					))}
				</ul>
			</section>

			<Areas />

			<DashboardClosing firstDay />

			<button
				type="button"
				onClick={() => setBoard(true)}
				className="glyph-host flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm text-ink-2 hover:bg-ink/6 hover:text-ink"
			>
				<Glyph icon={LayoutGrid} size={14} draw={false} className="text-ink-3" />
				Toch het bord tonen
			</button>
			<PageGuide id="home.first-run" title="Je eerste dag" steps={GUIDE} />
		</div>
	);
}

