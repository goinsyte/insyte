import { ArrowRight, ArrowUpRight } from "../icons.tsx"
import { useMarketingLinks } from "./links.tsx"
import { Mark, SecondaryLink, Wordmark } from "./parts.tsx"

type FooterLink = { readonly label: string; readonly href: string; readonly external?: boolean }

/**
 * The close and the footer, as one abyss wrapper like the hero's, so the page ends where it began
 * (Mora's closing band, in De Blauwdruk): the mark on its tile, a two-tone line and both actions,
 * then four columns of links and a last row under a dashed rule. Every link goes to a page of this
 * site (or an anchor on the homepage, through `links.page`) or into the product through sign-in.
 */
export function Closing() {
  const links = useMarketingLinks()
  const columns: ReadonlyArray<{ readonly title: string; readonly links: ReadonlyArray<FooterLink> }> = [
    {
      title: "Product",
      links: [
        { label: "Overzicht", href: links.page("/#product") },
        { label: "Bestellingen", href: links.page("/product/bestellingen") },
        { label: "Klantenservice", href: links.page("/product/klantenservice") },
        { label: "Chargebacks", href: links.page("/product/chargebacks") },
        { label: "Automatiseringen", href: links.page("/product/automatiseringen") },
        { label: "Insyte AI", href: links.page("/product/insyte-ai") },
        { label: "Koppelingen", href: links.page("/koppelingen") },
        { label: "Beveiliging", href: links.page("/beveiliging") },
        { label: "Prijzen", href: links.page("/prijzen") }
      ]
    },
    {
      title: "Oplossingen",
      links: [
        { label: "Voor operators", href: links.page("/oplossingen/operators") },
        { label: "Voor leveranciers", href: links.page("/oplossingen/leveranciers") },
        { label: "Voor partners", href: links.page("/oplossingen/partners") }
      ]
    },
    {
      title: "Gebruik",
      links: [
        { label: "Inloggen", href: links.login, external: true },
        { label: "Toegang aanvragen", href: links.page("/toegang") },
        { label: "Vragen", href: links.page("/vragen") },
        { label: "Roadmap", href: links.page("/roadmap") },
        { label: "Changelog", href: links.page("/changelog") }
      ]
    },
    {
      title: "Bedrijf",
      links: [
        { label: "Voorwaarden", href: links.page("/voorwaarden") },
        { label: "Privacy", href: links.page("/privacy") },
        { label: "Verwerkersovereenkomst", href: links.page("/verwerkersovereenkomst") }
      ]
    }
  ]

  return (
    <footer aria-labelledby="slot-kop" className="bg-paper px-2 pt-16 pb-2 sm:px-3 sm:pb-3">
      <div data-ground="dark" className="chapter relative isolate overflow-hidden rounded-xl bg-abyss text-mesh-ink">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 drafting-chalk [mask-image:linear-gradient(180deg,black,transparent_60%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 hatch-chalk [mask-image:radial-gradient(80%_60%_at_80%_0%,black,transparent_70%)]"
        />
        <div className="rails mx-auto max-w-[1180px] px-4 sm:px-8">
          <div className="flex flex-col gap-10 py-20 sm:py-24 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-8">
              <span className="flex size-14 items-center justify-center rounded-lg bg-mesh-ink/[0.08] chalk-line">
                <Mark size={32} tone="white" />
              </span>
              <h2 id="slot-kop" className="max-w-[18ch] font-medium text-4xl text-mesh-ink sm:text-display-sm">
                Het werk is gedaan.
                <span className="block text-mesh-ink-2">Binnen jouw regels.</span>
              </h2>
            </div>
            <div className="flex flex-col gap-4 lg:items-end">
              <p className="max-w-[44ch] text-md text-mesh-ink-2 lg:text-right">
                Insyte is in private bèta en werkt op uitnodiging. Vraag toegang aan, of log in als je er al bent.
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={links.onboarding}
                  className="group/btn inline-flex h-11 items-center gap-3 rounded-md bg-paper pr-5 pl-4 font-medium text-abyss text-md transition-colors hover:bg-arc-tint"
                >
                  <img src="/logos/google.svg" alt="" width={18} height={18} loading="lazy" className="shrink-0" />
                  Toegang aanvragen met Google
                  <ArrowRight
                    size={16}
                    className="transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/btn:translate-x-0.5"
                  />
                </a>
                <SecondaryLink href={links.login} onDark>Inloggen</SecondaryLink>
              </div>
            </div>
          </div>

          <div className="relative grid grid-cols-2 gap-x-6 gap-y-12 py-14 md:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
            <span aria-hidden className="absolute inset-x-0 top-0 h-px dash-x-chalk" />
            <div className="col-span-2 flex flex-col gap-4 md:col-span-1">
              <a href={links.home} aria-label="Insyte, naar het begin" className="w-fit rounded-md">
                <Wordmark tone="white" />
              </a>
              <p className="max-w-[28ch] text-base text-mesh-ink-2">
                Het besturingssysteem voor dropshippers. Rustig standaard, luid waar het telt.
              </p>
            </div>
            {columns.map((col) => (
              <nav key={col.title} aria-label={col.title} className="flex flex-col gap-3">
                <span className="text-mesh-ink-3 text-sm">{col.title}</span>
                <ul className="flex flex-col gap-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        className="inline-flex items-center gap-1 text-base text-mesh-ink hover:text-mesh-ink-2"
                      >
                        {l.label}
                        {l.external === true ? <ArrowUpRight size={13} className="text-mesh-ink-3" /> : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <div className="relative flex flex-col gap-2 py-6 text-mesh-ink-2 text-sm sm:flex-row sm:justify-between">
            <span aria-hidden className="absolute inset-x-0 top-0 h-px dash-x-chalk" />
            <span>© 2026 Insyte</span>
            <span>Logo's van andere diensten zijn van hun eigenaars; Insyte is niet aan hen verbonden.</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
