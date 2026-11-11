import { Edit3, Mail, MessagesSquare, Sparkle, Truck } from "../../icons";
import { BrandLogo } from "../marketplace/brand-logos";
import { SOURCE } from "../lib/ticket-source";
import type { TicketSource } from "../lib/types/domain";
import { cn } from "../lib/utils";

/**
 * Where a ticket came from, as a mark: the connected service's own logo on the neutral tile every
 * integration logo sits on, or Insyte's glyph for the sources that are not a vendor — a chat, one of
 * its automations, a ticket written by hand. Titled with the source's name for the pointer and for
 * assistive tech.
 */
const GLYPH = { email: Mail, chat: MessagesSquare, insyte: Sparkle, manual: Edit3, supplier: Truck } as const;

export function SourceMark({ source, size = 16, className }: { source: TicketSource; size?: number; className?: string }) {
	const meta = SOURCE[source];
	if (meta.brand) {
		return (
			<span title={`Via ${meta.label}`} className={cn("inline-flex shrink-0", className)}>
				<BrandLogo brand={meta.brand} name={meta.label} size={size} />
			</span>
		);
	}
	const Glyph = GLYPH[source as keyof typeof GLYPH];
	return (
		<span
			title={meta.label}
			aria-label={meta.label}
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-[5px]",
				source === "insyte" ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-2",
				className,
			)}
			style={{ width: size, height: size }}
		>
			<Glyph style={{ width: size * 0.62, height: size * 0.62 }} strokeWidth={1.75} />
		</span>
	);
}
