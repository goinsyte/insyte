import { ArrowRight } from "../../icons.tsx"
import { cn } from "../../lib/utils.ts"
import { Frame } from "../frame.tsx"
import type { MarketingLinks } from "../links.tsx"
import { useMarketingLinks } from "../links.tsx"
import { Reveal, RevealItem } from "../motion.tsx"
import { type Area, PRODUCT_PAGES, type ProductConfig } from "./product-data.tsx"
import { HeroBar, MarketingPage, PageHero, SectionHead } from "./shell.tsx"
import { StickySteps } from "./steps.tsx"

/*
 * /product/<area>: one template for every area, in one order — a split hero with one live render,
 * the four-step sticky sequence, six features in a ruled sheet, the rest of the product, the close.
 * Only the content differs, and it comes from `product-data.tsx`.
 */

/** Six features, ruled 3 × 2 by dashed construction lines, each with its glyph. */
function Features({ config }: { readonly config: ProductConfig }) {
  return (
    <section aria-labelledby={`${config.id}-functies`} className="bg-glacier">
      <Frame inner="py-20 sm:py-28">
        <SectionHead id={`${config.id}-functies`} title={config.featuresTitle} />
        <Reveal className="mt-12 grid overflow-hidden rounded-xl bg-paper hairline sm:grid-cols-2 lg:grid-cols-3">
          {config.features.map(({ Icon, line, title }, i) => (
            <RevealItem key={title} className="relative flex flex-col gap-3 p-6 sm:p-8">
              {i > 0 ? <span aria-hidden className="absolute inset-x-0 top-0 h-px dash-x sm:hidden" /> : null}
              {i % 2 === 1
                ? <span aria-hidden className="absolute inset-y-0 left-0 hidden w-px dash-y sm:block lg:hidden" />
                : null}
              {i >= 2
                ? <span aria-hidden className="absolute inset-x-0 top-0 hidden h-px dash-x sm:block lg:hidden" />
                : null}
              {i % 3 !== 0
                ? <span aria-hidden className="absolute inset-y-0 left-0 hidden w-px dash-y lg:block" />
                : null}
              {i >= 3 ? <span aria-hidden className="absolute inset-x-0 top-0 hidden h-px dash-x lg:block" /> : null}
              <span className="flex size-9 items-center justify-center rounded-md bg-abyss text-mesh-ink">
                <Icon size={17} />
              </span>
              <h3 className="font-medium text-ink text-lg">{title}</h3>
              <p className="max-w-[36ch] text-ink-2 text-base">{line}</p>
            </RevealItem>
          ))}
        </Reveal>
      </Frame>
    </section>
  )
}

/** The rest of the product, as the page's way on. */
function MoreProduct({ current }: { readonly current: Area }) {
  const links = useMarketingLinks()
  return (
    <section aria-labelledby="meer-kop" className="bg-paper">
      <Frame inner="py-20 sm:py-28">
        <SectionHead id="meer-kop" title="De rest van Insyte." second="Op hetzelfde scherm." />
        <Reveal className="mt-12 grid gap-px overflow-hidden rounded-xl bg-hairline sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCT_PAGES.filter((a) => a.id !== current).map(({ Icon, id, line, name }) => (
            <RevealItem key={id} className="bg-paper">
              <a
                href={links.page(`/product/${id}`)}
                className="group/area flex h-full flex-col gap-10 p-6 transition-colors hover:bg-arc-tint/40"
              >
                <span className="flex size-10 items-center justify-center rounded-md bg-abyss text-mesh-ink">
                  <Icon size={18} />
                </span>
                <span className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-2 font-medium text-ink text-lg">
                    {name}
                    <ArrowRight
                      size={15}
                      className="text-ink-3 transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/area:translate-x-1 group-hover/area:text-ink"
                    />
                  </span>
                  <span className="text-ink-3 text-sm">{line}</span>
                </span>
              </a>
            </RevealItem>
          ))}
        </Reveal>
      </Frame>
    </section>
  )
}

export function ProductPage({ links, area }: { readonly links: MarketingLinks; readonly area: Area }) {
  const config = PRODUCT_PAGES.find((p) => p.id === area) ?? PRODUCT_PAGES[0]!
  return (
    <MarketingPage links={links}>
      <PageHero
        variant="split"
        title={config.title}
        second={config.second}
        lede={config.lede}
        actions={
          <HeroBar
            primary={{ href: links.page("/toegang"), label: "Toegang aanvragen" }}
            secondary={{ href: links.inApp(config.consolePath), label: "Bekijk in de console" }}
          />
        }
        panel={config.hero(true)}
      />
      <p className={cn("mx-auto max-w-[1180px] px-4 pt-4 text-ink-3 text-sm sm:px-8")}>
        Voorbeeldwerkruimte: Northwind Clothing Co. is de demowinkel van de console, geen klant.
      </p>
      <StickySteps
        id={`${config.id}-stappen`}
        title={config.stepsTitle}
        second={config.stepsSecond}
        steps={config.steps}
      />
      <Features config={config} />
      <MoreProduct current={config.id} />
    </MarketingPage>
  )
}

/** The head tags for an area, for its route. */
export function productMeta(area: Area) {
  return (PRODUCT_PAGES.find((p) => p.id === area) ?? PRODUCT_PAGES[0]!).meta
}
