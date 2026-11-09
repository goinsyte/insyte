import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "../../components/dialog";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "../../icons";
import { type ReactNode, useRef } from "react";
import { cn } from "../lib/utils";
import { RecordBody } from "../loading/page-skeletons";
import { Stream } from "../loading/stream";

/**
 * One record, shown two ways.
 *
 * Opened from its list, a record is a modal over that list: you looked something up, you did not
 * leave. Opened from a link or a reload, the same record is a page, because there is no list behind
 * it to go back to and a modal floating over an empty canvas is a page wearing a costume.
 *
 * Which one it is comes from the navigation itself — the list passes `state: { modal: true }` when
 * it opens a row — so the URL is identical either way. The link a colleague pastes into chat opens
 * the page; the row you clicked opens the modal; the back button closes it.
 *
 * It also replaced four hand-written detail headers. Each had grown its own stack: a back link, a
 * 40px record number, a badge, a copy button, then a sentence of metadata under that. The trail
 * carries the "back", the title carries the record, and the metadata is one line beside it.
 */

/* One flag on the history entry, declared where the two sides of it can see each other. */
declare module "@tanstack/react-router" {
	interface HistoryState {
		modal?: boolean;
	}
}

/** True when this route was opened by clicking a row rather than by following a URL. */
export function useOpenedAsModal(): boolean {
	return useRouterState({ select: (s) => s.location.state.modal === true });
}

/** What a list passes to `navigate` so the record opens over it. */
export const OPEN_AS_MODAL: { modal: true } = { modal: true };

export function DetailShell({
	crumb,
	title,
	badge,
	meta,
	actions,
	arriving,
	children,
}: {
	/** The list this record belongs to. Rendered as the trail, and as the modal's way out. */
	crumb: { label: string; to: string };
	title: ReactNode;
	badge?: ReactNode;
	/** One line of facts, never a sentence of explanation. */
	meta?: ReactNode;
	actions?: ReactNode;
	/**
	 * Whether the host is still reading the record's body. Absent, the body arrives at the reference's simulated pace;
	 * given, the same skeleton covers the same reserved box until the host has it (false at once on a server render).
	 */
	arriving?: boolean;
	children: ReactNode;
}) {
	const router = useRouter();
	const asModal = useOpenedAsModal();
	const popup = useRef<HTMLDivElement>(null);
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	/* The header is the row the operator clicked, already in the list's cache, so it is drawn at once;
	   the record's body (its lines, its history, its facts) is the part that has to be fetched. */
	const body = arriving === undefined ? (
		<Stream id={`record:${pathname}`} after={420} fallback={<RecordBody />} reserve>
			{children}
		</Stream>
	) : (
		<Arriving pending={arriving}>{children}</Arriving>
	);


	if (asModal) {
		return (
			<Dialog
				open
				onOpenChange={(open) => {
					if (!open) router.history.back();
				}}
			>
				<DialogContent
					ref={popup}
					/* `sm:max-w-*` as well as `max-w-*`: the dialog primitive sets `sm:max-w-lg`, and a
					   bare `max-w-` does not override a variant of itself — the record would open in a
					   512px column with its right-hand panel cut off. */
					className="flex max-h-[88vh] w-full max-w-[calc(100vw-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1120px,calc(100vw-4rem))]"
					/* Focus lands on the record, not inside it. Base UI's default is the first tabbable
					   control, which here is the copy-order-number button: opening an order drew a focus
					   ring around an icon nobody reached for. Nothing in a record is the thing you came
					   to type into, so the popup itself takes it. `initialFocus={false}` was tried first
					   and takes Escape with it, because the key handler is on the popup. */
					initialFocus={popup}
				>
					<header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 pr-12">
						<DialogTitle className="font-medium text-lg text-ink">
							{title}
						</DialogTitle>
						{badge}
						{meta ? (
							<p className="font-medium text-xs text-ink-3 tabular-nums">
								{meta}
							</p>
						) : null}
						{actions ? (
							<div className="ml-auto flex shrink-0 items-center gap-1.5">
								{actions}
							</div>
						) : null}
					</header>
					<div className="min-h-0 flex-1 overflow-y-auto bg-glacier px-4 pt-3 pb-4">
						{body}
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<div className="flex min-w-0 flex-col">
			<header className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5">
				<nav
					aria-label="Kruimelpad"
					className="flex min-w-0 items-center gap-1.5"
				>
					<Link
						to={crumb.to}
						className="rounded-sm font-medium text-sm text-ink-3 transition-colors hover:text-ink"
					>
						{crumb.label}
					</Link>
					<ChevronRight
						className="size-3.5 shrink-0 text-ink-4"
						strokeWidth={2}
						aria-hidden
					/>
					<h1 className="truncate font-medium text-xl text-ink">{title}</h1>
				</nav>
				{badge}
				{meta ? (
					<p className="font-medium text-xs text-ink-3 tabular-nums">{meta}</p>
				) : null}
				{actions ? (
					<div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
						{actions}
					</div>
				) : null}
			</header>
			<div className={cn("min-w-0 px-5 pb-6")}>{body}</div>
		</div>
	);
}

/* `Stream`'s reserved box, for a body the host is really reading: laid out hidden under the record's skeleton, and
   settling in when it has come, exactly as the reference draws it at its pace. */
function Arriving({ pending, children }: { pending: boolean; children: ReactNode }) {
	const waited = useRef(pending);
	if (pending) waited.current = true;
	return (
		<div className="relative">
			<div className={cn("h-full", !pending && waited.current && "stream-in")} style={pending ? { visibility: "hidden" } : undefined} inert={pending || undefined}>
				{children}
			</div>
			{pending ? <div className="absolute inset-0 overflow-hidden"><RecordBody /></div> : null}
		</div>
	);
}
