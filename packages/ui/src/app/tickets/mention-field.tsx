import { Fragment, type KeyboardEvent, type Ref, useImperativeHandle, useRef, useState } from "react";
import { personStyle } from "../lib/person-color";
import { cn } from "../lib/utils";

/**
 * A comment field that knows the team: "@" opens the people who can be told, arrow keys and Enter
 * pick one, and the name goes in as "@Sophie". What was written is read back the same way, so a
 * mention is highlighted where it is shown and the poster is told who hears about it.
 */

export type Person = { id: string; initial: string; name: string };

const handle = (p: Person) => p.name.split(" ")[0] ?? p.name;

/** The people a comment mentions, in the order they are first named. */
export function mentionsIn(body: string, people: ReadonlyArray<Person>): Person[] {
	const named = [...body.matchAll(/@([\p{L}\p{N}_]+)/gu)].map((m) => m[1]?.toLowerCase());
	return people.filter((p) => named.includes(handle(p).toLowerCase()));
}

/** A comment body with its mentions marked. */
export function MentionText({ body, people }: { body: string; people: ReadonlyArray<Person> }) {
	const known = new Set(people.map((p) => handle(p).toLowerCase()));
	return body.split(/(@[\p{L}\p{N}_]+)/gu).map((part, i) =>
		part.startsWith("@") && known.has(part.slice(1).toLowerCase()) ? (
			<span key={i} className="rounded-sm bg-arc-tint px-0.5 font-medium text-arc-ink">
				{part}
			</span>
		) : (
			<Fragment key={i}>{part}</Fragment>
		),
	);
}

export function MentionField({
	value,
	onChange,
	onSubmit,
	people,
	placeholder,
	className,
	rows,
	placement = "below",
	inputRef,
	onKeyDown: onOtherKey,
}: {
	value: string;
	onChange: (v: string) => void;
	onSubmit: () => void;
	people: ReadonlyArray<Person>;
	placeholder?: string;
	className?: string;
	rows?: number;
	/** Where the picker opens; a composer pinned to the bottom of the screen opens it above. */
	placement?: "below" | "above";
	inputRef?: Ref<HTMLTextAreaElement | null>;
	/** Keys the picker does not use, for the caller's own shortcuts. */
	onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
	const ref = useRef<HTMLTextAreaElement>(null);
	useImperativeHandle(inputRef, () => ref.current as HTMLTextAreaElement, []);
	const [query, setQuery] = useState<string | null>(null);
	const [at, setAt] = useState(0);

	const matches = query === null ? [] : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
	const open = matches.length > 0;

	function read(next: string, caret: number) {
		const m = /(^|\s)@([\p{L}\p{N}_]*)$/u.exec(next.slice(0, caret));
		setQuery(m ? (m[2] ?? "") : null);
		setAt(0);
	}

	function pick(p: Person) {
		const el = ref.current;
		const caret = el?.selectionStart ?? value.length;
		const before = value.slice(0, caret).replace(/@([\p{L}\p{N}_]*)$/u, `@${handle(p)} `);
		const next = before + value.slice(caret);
		onChange(next);
		setQuery(null);
		requestAnimationFrame(() => {
			el?.focus();
			el?.setSelectionRange(before.length, before.length);
		});
	}

	function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (open) {
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				setAt((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
				return;
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				const p = matches[at];
				if (p) pick(p);
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				setQuery(null);
				return;
			}
		}
		if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			onSubmit();
			return;
		}
		onOtherKey?.(e);
	}

	return (
		<div className="relative">
			<textarea
				ref={ref}
				value={value}
				onChange={(e) => {
					onChange(e.target.value);
					read(e.target.value, e.target.selectionStart);
				}}
				onKeyDown={onKeyDown}
				onBlur={() => setQuery(null)}
				placeholder={placeholder}
				rows={rows}
				aria-autocomplete="list"
				aria-expanded={open}
				className={
					className ??
					"field min-h-16 w-full rounded-lg p-3 text-base text-ink leading-[1.6] outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
				}
			/>
			{open ? (
				<ul
					role="listbox"
					aria-label="Een collega vermelden"
					className={cn(
						"absolute left-0 z-10 flex w-56 flex-col gap-px rounded-lg bg-paper p-1 shadow-lg ring-1 ring-ink/8",
						placement === "above" ? "bottom-full mb-1" : "top-full mt-1",
					)}
				>
					{matches.map((p, i) => (
						<li key={p.id} role="option" aria-selected={i === at}>
							<button
								type="button"
								onMouseDown={(e) => {
									e.preventDefault();
									pick(p);
								}}
								onMouseEnter={() => setAt(i)}
								className={cn(
									"flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-base text-ink",
									i === at && "bg-ink/6",
								)}
							>
								<span className="flex size-5 shrink-0 items-center justify-center rounded-full font-medium text-xs" style={personStyle(p.id)}>
									{p.initial}
								</span>
								{p.name}
							</button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
