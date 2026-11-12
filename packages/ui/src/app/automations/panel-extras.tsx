import { ArrowRight, ChevronDown, Plus, X } from "../../icons";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCustomers, useProducts } from "../hooks/use-operator-data";
import { type AutomationTemplate, TEMPLATES } from "../lib/automation-templates";
import { cn } from "../lib/utils";
import { useWorkspace } from "../stores/workspace-store";
import { recommendations } from "./library";
import { draftFromTemplate } from "./demo-source";
import { VARIANTS_BY_ID } from "./node-types";
import { runLabel } from "./runs";
import { RUN_DOT } from "./runs-tab";
import { StepTile } from "./step-tile";
import { useWorkflows } from "./workflow-store";

const PROMO_KEY = "insyte.automations.promo";

function readDismissed(): string[] {
	try {
		const v = JSON.parse(localStorage.getItem(PROMO_KEY) ?? "[]");
		return Array.isArray(v) ? v : [];
	} catch {
		return [];
	}
}

/** "vandaag 10:42", "gisteren 18:05", "22 mei". */
function when(at: string) {
	const d = new Date(at);
	const today = new Date();
	const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
	const diff = (day(today) - day(d)) / 86_400_000;
	const time = d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
	if (diff === 0) return `vandaag ${time}`;
	if (diff === 1) return `gisteren ${time}`;
	return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }).replace(".", "");
}

/**
 * The rest of the automations panel, under its views: a few templates that fold, the last five runs
 * across every flow (a dot, the flow, when), and one template worth starting with on the `abyss` plate,
 * which can be put away. Pins follow, as in every area.
 */
export function AutomationsPanelExtras() {
	const navigate = useNavigate();
	const workflows = useWorkflows();
	const [templatesOpen, setTemplatesOpen] = useState(true);
	const [dismissed, setDismissed] = useState(readDismissed);
	const orders = useWorkspace((s) => s.orders);
	const chargebacks = useWorkspace((s) => s.chargebacks);
	const tickets = useWorkspace((s) => s.tickets);
	const { data: products } = useProducts();
	const { data: customers } = useCustomers();

	const runs = useMemo(
		() =>
			Object.values(workflows)
				.flatMap((w) => w.history.map((r) => ({ run: r, flow: w })))
				.sort((a, b) => Date.parse(b.run.at) - Date.parse(a.run.at))
				.slice(0, 5),
		[workflows],
	);

	const promo = useMemo(() => {
		const rec = recommendations({ orders, products, customers, chargebacks, tickets }, workflows).map((r) => r.template);
		const used = new Set(Object.values(workflows).map((w) => w.name));
		return [...rec, ...TEMPLATES].find((t) => !dismissed.includes(t.id) && !used.has(t.name)) ?? null;
	}, [orders, products, customers, chargebacks, tickets, workflows, dismissed]);

	function start(t: AutomationTemplate) {
		const id = draftFromTemplate(t);
		navigate({ to: "/automations/$automationId", params: { automationId: id } });
		toast(`Concept opgesteld vanuit “${t.name}”`, { description: "Het draait pas als je het publiceert." });
	}

	function dismiss(t: AutomationTemplate) {
		const next = [...dismissed, t.id];
		setDismissed(next);
		try {
			localStorage.setItem(PROMO_KEY, JSON.stringify(next));
		} catch {
			// A private window forgets it on reload; nothing else depends on it.
		}
	}

	return (
		<div className="flex flex-col">
			<button
				type="button"
				onClick={() => setTemplatesOpen((o) => !o)}
				aria-expanded={templatesOpen}
				className="flex items-center gap-1 px-2 pt-3 pb-1 font-medium text-ink-3 text-xs hover:text-ink"
			>
				Sjablonen
				<ChevronDown className={cn("size-3 transition-transform duration-150", !templatesOpen && "-rotate-90")} />
				<span className="ml-auto tabular-nums">{TEMPLATES.length}</span>
			</button>
			{templatesOpen ? (
				<ul className="flex flex-col">
					{TEMPLATES.slice(0, 3).map((t) => {
						const v = VARIANTS_BY_ID[t.steps[1]?.variantId ?? t.steps[0]?.variantId ?? ""];
						return (
							<li key={t.id}>
								<button
									type="button"
									onClick={() => start(t)}
									title={t.description}
									className="density-row flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink"
								>
									{v ? <StepTile variant={v} size={14} /> : null}
									<span className="min-w-0 flex-1 truncate">{t.name.split(" → ")[0]}</span>
									<Plus className="size-3 shrink-0 text-ink-3" />
								</button>
							</li>
						);
					})}
					<li>
						<button
							type="button"
							onClick={() => navigate({ to: "/automations", search: { view: "templates" } })}
							className="density-row flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-arc-ink text-sm hover:bg-arc-tint"
						>
							Alle sjablonen
							<ArrowRight className="size-3" />
						</button>
					</li>
				</ul>
			) : null}

			<div className="px-2 pt-3 pb-1 font-medium text-ink-3 text-xs">Laatste runs</div>
			{runs.length === 0 ? (
				<p className="px-2 py-1 text-ink-3 text-xs leading-[1.5]">Nog geen runs. Ze staan hier zodra een flow draait.</p>
			) : (
				<ul className="flex flex-col">
					{runs.map(({ run, flow }) => (
						<li key={run.id}>
							<button
								type="button"
								onClick={() => navigate({ to: "/automations/$automationId", params: { automationId: flow.automationId }, search: { tab: "runs", run: run.id } })}
								title={`${flow.name} · ${runLabel(run)}`}
								className="density-row flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-ink/6"
							>
								<span className={cn("size-1.5 shrink-0 rounded-full", RUN_DOT[run.status])} aria-label={runLabel(run)} />
								<span className="min-w-0 flex-1 truncate text-ink-2">{flow.name}</span>
								<span className="shrink-0 text-ink-3 text-xs tabular-nums">{when(run.at)}</span>
							</button>
						</li>
					))}
				</ul>
			)}

			{promo ? (
				<div className="relative mt-3 flex flex-col gap-1.5 rounded-lg bg-abyss px-3 pt-2.5 pb-3 text-mesh-ink">
					<span className="text-mesh-ink-3 text-xs">Sjabloon</span>
					<span className="pr-5 font-medium text-sm leading-[1.35]">{promo.name}</span>
					<button
						type="button"
						onClick={() => start(promo)}
						className="mt-0.5 flex items-center gap-1 self-start font-medium text-mesh-ink-2 text-xs transition-colors hover:text-mesh-ink"
					>
						Begin hiermee
						<ArrowRight className="size-3" />
					</button>
					<button
						type="button"
						onClick={() => dismiss(promo)}
						aria-label="Sjabloon wegleggen"
						className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-sm text-mesh-ink-3 hover:bg-mesh-ink/12 hover:text-mesh-ink"
					>
						<X className="size-3" />
					</button>
				</div>
			) : null}
		</div>
	);
}
