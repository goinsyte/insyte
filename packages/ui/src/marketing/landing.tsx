import { MotionConfig } from "motion/react"
import { Ai } from "./ai.tsx"
import { Bento } from "./bento.tsx"
import { Closing } from "./closing.tsx"
import { Faq } from "./faq.tsx"
import { Hero } from "./hero.tsx"
import { Integrations } from "./integrations.tsx"
import type { MarketingLinks } from "./links.tsx"
import { MarketingLinksProvider } from "./links.tsx"
import { SiteNav } from "./nav.tsx"
import { Personas } from "./personas.tsx"
import { Pricing } from "./pricing.tsx"
import { Stage } from "./stage.tsx"
import { Statement } from "./statement.tsx"
import { Tours } from "./tours.tsx"

/**
 * The landing page: "abyss-blue hero, product first".
 *
 * An abyss wrapper with the nav inside it opens the page, and the console's Start screen rises out
 * of it, live. Under it the overview stage (one tab per area, each with a working miniature), how it
 * works in three columns, the three portals as a carousel, the bento of the product's pieces, the
 * two tours (the reply and the automation builder), the abyss band with every service Insyte works
 * with and the six controls of a team as one ruled sheet, pricing with its comparison, questions,
 * and the close, an abyss wrapper with the footer inside it. Every ground is flat and framed by the
 * dashed construction lines; there is no glow and no black.
 *
 * `light` pins the daylight token map: the night theme is the console's.
 */
export function Landing({ links }: { readonly links: MarketingLinks }) {
  return (
    <MarketingLinksProvider links={links}>
      {/* `user`: every transform and layout animation is skipped when the reader asked for less motion. */}
      <MotionConfig reducedMotion="user">
        <div className="light min-h-svh bg-paper text-ink">
          <SiteNav />
          <main>
            <Hero />
            <Stage />
            <Statement />
            <Ai />
            <Personas />
            <Bento />
            <Tours />
            <Integrations />
            <Pricing />
            <Faq />
          </main>
          <Closing />
        </div>
      </MotionConfig>
    </MarketingLinksProvider>
  )
}
