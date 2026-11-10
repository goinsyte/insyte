import { Clock, Moon, Sun, Ticket, Truck } from "../../icons";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Glyph } from "../common/glyph";
import { getGreeting } from "../lib/greetings";

/**
 * The top of Home: the greeting and the date on one line, and under it the day in one sentence.
 *
 * It used to be a 40px greeting over a line of figures, which spent the first fifth of the screen
 * saying hello. Now the greeting is one 30px line with the date beside it, and the sentence under
 * it carries the figure that matters — how many things need a decision before the day ends, rolling
 * when a decision takes one off — and the three other things worth knowing before the first click,
 * each a link to the screen that settles it. The greeting's words rising in is the screen's one
 * authored entrance.
 *
 * The figures are the host's (`Hero` for the design app, the console from `Queue.list`); a brief at 0 is left out.
 */
export function HeroView({ name, needsYou, evidence = 0, delayed = 0, urgent = 0, firstDay = false }: { name: string; needsYou: number; evidence?: number; delayed?: number; urgent?: number; firstDay?: boolean }) {
	const still = useReducedMotion();
	const first = name.split(" ")[0] ?? name;
	const now = new Date();
	const greeting = getGreeting(first, now);
	const night = greeting.mode === "evening" || greeting.mode === "latenight" || greeting.mode === "predawn";
	const date = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(now);


	const words = greeting.salutation.split(" ");

	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
				<h1 className="font-medium text-3xl text-ink" aria-label={greeting.salutation}>
					{words.map((w, i) => (
						<motion.span
							// biome-ignore lint/suspicious/noArrayIndexKey: the words of one sentence, in order
							key={i}
							aria-hidden
							className="inline-block whitespace-pre"
							initial={still ? false : { opacity: 0, y: 8, filter: "blur(6px)" }}
							animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
							transition={{ duration: 0.42, delay: 0.05 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
						>
							{i < words.length - 1 ? `${w} ` : w}
						</motion.span>
					))}
				</h1>
				<p className="flex items-center gap-1.5 text-sm text-ink-3">
					<Glyph icon={night ? Moon : Sun} size={13} draw={false} className="text-ink-3" />
					{date}
				</p>
			</div>
			<motion.div
				className="flex flex-wrap items-center gap-x-1 gap-y-1 text-base text-ink-2"
				initial={still ? false : { opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.3, delay: 0.05 + words.length * 0.06 }}
			>
				{firstDay ? (
					<span>Je werkruimte staat klaar.</span>
				) : (
					<>
						<span className="mr-2 flex items-baseline gap-1.5">
							<Figure value={needsYou} />
							<span>
								{needsYou === 1 ? "zaak wacht op jou voordat de dag om is" : "zaken wachten op jou voordat de dag om is"}
							</span>
						</span>
						{evidence > 0 ? (
							<Brief to="/chargebacks" icon={Clock} text={`${evidence} ${evidence === 1 ? "chargeback heeft" : "chargebacks hebben"} bewijs nodig`} />
						) : null}
						{delayed > 0 ? (
							<Brief to="/orders" icon={Truck} text={`${delayed} ${delayed === 1 ? "bestelling is" : "bestellingen zijn"} vertraagd`} />
						) : null}
						{urgent > 0 ? (
							<Brief to="/tickets" icon={Ticket} text={`${urgent} ${urgent === 1 ? "urgent ticket" : "urgente tickets"}`} />
						) : null}
					</>
				)}
			</motion.div>
		</div>
	);
}

function Brief({ to, icon, text }: { to: string; icon: typeof Clock; text: string }) {
	return (
		<Link
			to={to}
			className="glyph-host flex h-7 items-center gap-1.5 rounded-md px-2 text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
		>
			<Glyph icon={icon} size={14} draw={false} className="text-ink-3" />
			{text}
		</Link>
	);
}

/**
 * The figure, which rolls rather than swaps: the old number lifts out as the new one rises into its
 * place, so a decision taken is a count that visibly went down rather than a digit that changed.
 */
function Figure({ value }: { value: number }) {
	const still = useReducedMotion();
	return (
		<span className="relative inline-flex overflow-hidden py-0.5" aria-live="polite">
			<AnimatePresence initial={false} mode="popLayout">
				<motion.span
					key={value}
					className="figure text-2xl text-arc-ink"
					initial={still ? false : { y: "70%", opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					exit={still ? { opacity: 0 } : { y: "-70%", opacity: 0 }}
					transition={{ type: "spring", stiffness: 420, damping: 34 }}
				>
					{value}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}
