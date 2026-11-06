import { MessageSquare, Plus, Sparkle, Trash2 } from "../../icons";
import { Link } from "@tanstack/react-router";
import { useAgentEntries } from "../stores/agent-log-store";
import { InsyteMark, SourceList } from "./parts";
import { Thread } from "./thread";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useAsk } from "../stores/ask-store";

/**
 * Ask Insyte, full page: conversations on the left, the thread in the middle at a reading measure,
 * and on the right what the latest answer read and what it proposed. The same thread the drawer
 * shows; the page is where an operator works a longer question through.
 */
export function AskPage() {
	const conversations = useAsk((s) => s.conversations);
	const active = useAsk((s) => s.active);
	const open = useAsk((s) => s.open);
	const start = useAsk((s) => s.start);
	const remove = useAsk((s) => s.remove);
	const conv = conversations.find((c) => c.id === active);
	const actions = useAgentEntries().length;
	const last = [...(conv?.turns ?? [])].reverse().find((t) => t.role === "assistant");
	const settled = last?.role === "assistant" && last.settled ? last : undefined;

	return (
		<div className="flex min-h-0 flex-1">
			<aside className="hidden w-60 shrink-0 flex-col gap-1 bg-mist px-2 py-3 md:flex">
				<button
					type="button"
					onClick={start}
					className="mb-2 flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-abyss font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2"
				>
					<Plus className="size-3.5" strokeWidth={2} />
					Nieuw gesprek
				</button>
				<Link
					to="/ask/activity"
					className="flex h-8 items-center gap-2 rounded-md px-2 text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
				>
					<Sparkle className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />
					<span className="flex-1 truncate">Wat Insyte deed</span>
					<span className="text-ink-3 text-sm tabular-nums">{actions || null}</span>
				</Link>
				<h2 className="px-2 pt-2 pb-1 font-medium text-ink-3 text-xs">Gesprekken</h2>
				{conversations.length === 0 ? <p className="px-2 text-sm text-ink-3">Nog geen.</p> : null}
				{conversations.map((c) => (
					<div key={c.id} className="group/conv relative">
						<button
							type="button"
							onClick={() => open(c.id)}
							className={cn(
								"flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 pr-7 text-left text-base transition-colors",
								c.id === active ? "bg-arc-tint font-medium text-arc-ink" : "text-ink-2 hover:bg-ink/6 hover:text-ink",
							)}
						>
							<MessageSquare className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />
							<span className="truncate">{c.title}</span>
						</button>
						<button
							type="button"
							aria-label={`“${c.title}” verwijderen`}
							onClick={() => {
								remove(c.id);
								undoable("Gesprek verwijderd", () => useAsk.setState((s) => ({ conversations: [c, ...s.conversations] })));
							}}
							className="absolute top-1.5 right-1.5 hidden size-5 cursor-pointer items-center justify-center rounded-sm text-ink-3 hover:bg-ink/8 hover:text-ink group-hover/conv:flex"
						>
							<Trash2 className="size-3" strokeWidth={1.75} />
						</button>
					</div>
				))}
			</aside>

			<section aria-label="Gesprek" className="flex min-w-0 flex-1 flex-col bg-paper">
				<Thread />
			</section>

			<aside className="hidden w-72 shrink-0 flex-col gap-5 bg-glacier px-4 py-5 xl:flex">
				<div className="flex items-center gap-2">
					<InsyteMark size={20} />
					<h2 className="font-medium text-base text-ink">Wat Insyte las</h2>
				</div>
				{settled && settled.script.sources.length > 0 ? (
					<SourceList sources={settled.script.sources} />
				) : (
					<p className="text-sm text-ink-3 leading-relaxed">Hier staan de records achter het laatste antwoord, zodat je elk getal kunt herleiden.</p>
				)}
				{settled?.script.tools.length ? (
					<div className="flex flex-col gap-1.5">
						<h3 className="font-medium text-ink-3 text-xs">Gebruikte tools</h3>
						{settled.script.tools.map((t) => (
							<p key={`${t.verb}-${t.object}`} className="text-sm text-ink-2">
								<span className="text-ink-3">{t.verb}</span> {t.object}
							</p>
						))}
					</div>
				) : null}
				<p className="mt-auto text-xs text-ink-3 leading-relaxed">
					Antwoorden in deze demo zijn gescript op basis van de werkruimte op het scherm. Een voorstel uitvoeren wijzigt de werkruimte, met Ongedaan maken.
				</p>
			</aside>
		</div>
	);
}
