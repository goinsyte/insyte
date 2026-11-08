import type { IconComponent } from "../../icons";
import type { ReactNode } from "react";

/**
 * Settings, as one grey sheet centred in the window.
 *
 * The sheet is `glacier` on the `paper` content area, up to 1120px wide and the full height of the
 * window, with /login's dot grid in the margin around it. The form sits in a field of its own the
 * way /login's form does, and its inputs are white for the same reason: on a grey ground the slot
 * you type into is the lightest thing there. Sections are headings with their glyph; lists of things
 * (stores, keys, links elsewhere) are grouped white cards of rows with a leading tile and a chevron.
 */
export function SettingsSheet({ title, icon: Icon, children }: { title: string; icon: IconComponent; children: ReactNode }) {
	return (
		<div className="relative isolate flex min-h-full min-w-0 shrink-0 flex-col bg-paper px-3 py-3 sm:px-5 sm:py-5">
			{/* The ground around the sheet carries /login's dot grid, faded toward the middle, so the
			    margin reads as the drawing board the sheet is laid on rather than as empty white. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 bg-dot-grid-ink [mask-image:radial-gradient(ellipse_at_center,transparent_35%,black_85%)]"
			/>
			<div className="settings-sheet mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-8 rounded-2xl bg-glacier px-5 pt-6 pb-10 sm:px-10 sm:pt-8">
				<header className="flex items-center gap-3">
					<span className="flex size-9 items-center justify-center rounded-lg bg-paper text-arc-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
						<Icon className="size-[18px]" strokeWidth={1.75} />
					</span>
					<h1 className="font-medium text-2xl text-ink">{title}</h1>
				</header>
				{children}
			</div>
		</div>
	);
}
