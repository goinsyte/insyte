import { ImageOff } from "../../icons";
import { CheckCard } from "./check-card";
import { useQualityLinkSource } from "./link-source";

/*
 * A quality check answered through its link (`/kwaliteit/$checkId`, M9.4), until the partner portal: the supplier
 * opens it from the team's message, sees what was asked for which product, and sends the photos, the video and the
 * batch number. The store's page, like the returns portal: its name at the head, "Mogelijk gemaakt door Insyte" at
 * the foot, nothing of the console. What it reads and sends is its host's.
 */

export function QualityLinkScreen() {
	const source = useQualityLinkSource();
	const c = source.check;
	return (
		<div className="flex min-h-svh flex-col bg-glacier text-base text-ink">
			<header className="flex h-16 items-center justify-center px-4">
				<span className="font-medium text-ink text-lg tracking-tight">{c ? source.brand : "Kwaliteitscontrole"}</span>
			</header>
			<main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 px-4 pb-10">
				{c ? (
					<>
						<div className="flex items-center gap-3">
							{c.productImage ? (
								<img src={c.productImage} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
							) : (
								<span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-mist text-ink-3">
									<ImageOff className="size-5" strokeWidth={1.75} />
								</span>
							)}
							<div className="flex min-w-0 flex-col gap-0.5">
								<h1 className="text-balance font-medium text-ink text-xl leading-snug">{c.productTitle}</h1>
								<p className="text-ink-2 text-sm">
									{source.brand} vraagt {c.supplierName} om een kwaliteitscontrole.
								</p>
							</div>
						</div>
						<CheckCard c={c} brand={source.brand} send={source.send} />
					</>
				) : (
					<section className="flex flex-col gap-2 rounded-xl bg-paper px-5 py-6 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
						<h1 className="font-medium text-ink text-xl">Deze link werkt niet meer</h1>
						<p className="text-ink-2">Vraag je opdrachtgever om een nieuwe link naar de kwaliteitscontrole.</p>
					</section>
				)}
			</main>
			<footer className="flex justify-center px-4 pb-6 text-ink-3 text-xs">Mogelijk gemaakt door Insyte</footer>
		</div>
	);
}
