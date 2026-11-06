import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react"
import { useRef } from "react"
import { ArrowRight, Check } from "../icons.tsx"
import { ConsoleWindow } from "./console-window.tsx"
import { useMarketingLinks } from "./links.tsx"
import { Logo, SecondaryLink } from "./parts.tsx"

/* The hero's arrival: transform only, staggered, from a few pixels low. Opacity is never touched,
   so the headline is painted — and is the LCP — on the first frame, before any JavaScript runs. */
const rise = (i: number) => ({
  initial: { y: 18 },
  animate: { y: 0 },
  transition: { type: "spring" as const, stiffness: 120, damping: 20, delay: 0.05 + i * 0.07 }
})

/**
 * The window rising out of the hero: tilted back and a little low as it enters, lying flat by the
 * time its top reaches the upper third of the screen, on a spring so it settles rather than stops.
 */
function RisingWindow() {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion() === true
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.3"] })
  const eased = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.6 })
  const rotateX = useTransform(eased, [0, 1], [16, 0])
  const y = useTransform(eased, [0, 1], [48, 0])
  const scale = useTransform(eased, [0, 1], [0.93, 1])
  return (
    <motion.div
      ref={ref}
      style={reduced ? {} : { rotateX, y, scale, transformPerspective: 1800, transformOrigin: "50% 0%" }}
      className="mx-auto w-fit max-w-full overflow-hidden rounded-lg outline outline-mesh-ink/20 window-lift"
    >
      <ConsoleWindow />
    </motion.div>
  )
}

/**
 * The hero: a rounded abyss wrapper carrying the brand's Drift hatch and drafting grid at a few
 * percent, the headline in one line, Google and sign-in actions, the no-card line, three true facts, and the console's Start screen
 * rising out of the wrapper's foot onto the paper below, across the boundary.
 */
export function Hero() {
  const links = useMarketingLinks()
  const reduced = useReducedMotion() === true
  const r = (i: number) => (reduced ? {} : rise(i))
  return (
    <div className="px-2 pt-1 sm:px-3 sm:pt-2">
      <div data-ground="dark" className="chapter relative flow-root rounded-xl bg-abyss text-mesh-ink">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          <div className="absolute inset-0 drafting-chalk [mask-image:linear-gradient(180deg,black,transparent_70%)]" />
          <div className="absolute inset-0 hatch-chalk [mask-image:radial-gradient(70%_60%_at_50%_30%,transparent_35%,black_100%)]" />
        </div>
        <div
          id="main"
          tabIndex={-1}
          className="relative mx-auto flex max-w-[1180px] flex-col items-center px-4 pt-20 text-center outline-none sm:px-8 sm:pt-24 lg:pt-28"
        >
          <motion.h1
            {...r(0)}
            className="max-w-[22ch] font-medium text-4xl text-mesh-ink sm:text-display-sm lg:max-w-none lg:text-display"
          >
            De back-end van je dropshipstore.
          </motion.h1>
          <motion.p {...r(1)} className="mt-5 max-w-[58ch] text-lg text-mesh-ink-2 sm:text-xl">
            Orders, klantenservice, leveranciers, chargebacks en automatiseringen op één scherm. De Insyte-agent doet
            het werk, binnen de regels die jij stelt.
          </motion.p>
          <motion.div {...r(2)} className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {
              /* Google sign-in is offered on the access request itself (the console's onboarding), so
                this opens that request; it never creates an account on its own. */
            }
            <a
              href={links.onboarding}
              className="group/btn inline-flex h-12 items-center gap-3 rounded-md bg-paper pr-5 pl-4 font-medium text-abyss text-md transition-colors hover:bg-arc-tint"
            >
              <img src="/logos/google.svg" alt="" width={18} height={18} className="shrink-0" />
              Toegang aanvragen met Google
              <ArrowRight
                size={16}
                className="transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/btn:translate-x-0.5"
              />
            </a>
            <SecondaryLink href={links.login} onDark className="h-12">Inloggen</SecondaryLink>
          </motion.div>
          <motion.p {...r(3)} className="mt-4 text-mesh-ink-2 text-sm">
            <a
              href={links.page("/toegang")}
              className="text-mesh-ink underline decoration-mesh-ink/40 underline-offset-4 hover:decoration-mesh-ink"
            >
              Of vraag aan met je werkmail
            </a>
            <span aria-hidden className="mx-2 text-mesh-ink-3">·</span>
            Geen creditcard nodig
          </motion.p>
          <motion.ul
            {...r(4)}
            className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-mesh-ink-2 text-sm"
          >
            <li className="flex items-center gap-2">
              <Logo vendor="shopify" size={20} />
              Koppelt met je Shopify-winkels
            </li>
            <li className="flex items-center gap-1.5">
              <Check size={14} />
              In het Nederlands
            </li>
            <li className="flex items-center gap-1.5">
              <Check size={14} />
              Private bèta, op uitnodiging
            </li>
          </motion.ul>
        </div>
        {/* The window hangs below the wrapper: the negative margin lets it cross onto the paper. */}
        <div className="relative z-10 mt-12 -mb-24 px-3 sm:mt-16 sm:-mb-40 sm:px-8 lg:-mb-56 xl:px-0">
          <RisingWindow />
        </div>
      </div>
      <p className="mx-auto mt-28 max-w-[1180px] px-4 text-center text-ink-3 text-sm sm:mt-44 sm:px-8 lg:mt-60">
        Voorbeeldwerkruimte: Northwind Clothing Co. is de demowinkel van de console, geen klant.
      </p>
    </div>
  )
}
