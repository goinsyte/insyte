import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import {
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from "react"
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Factory,
  type IconComponent,
  Inbox,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Users,
  Workflow,
  X
} from "../icons.tsx"
import { cn } from "../lib/utils.ts"
import { INCOMING } from "./demo-data.ts"
import { useMarketingLinks } from "./links.tsx"
import { Logo, Mark, type Vendor, VENDORS, Wordmark } from "./parts.tsx"

/*
 * The navbar: a full-width bar on paper above the hero, with a one-line banner above it.
 *
 * The wordmark, then the menu left-aligned after it; at the right a quiet Vragen, an outlined
 * Inloggen menu and the solid Toegang aanvragen. 72px tall and flat at the top of the page. Only
 * the bar is sticky: once the banner has scrolled away it holds the top, a little shorter, with a
 * hairline and a soft shadow under it. No blur, no glow.
 *
 * Three menus — Product, Oplossingen and Inloggen — share ONE panel. Moving between them, the panel
 * glides under the new trigger and takes the new menu's size, while the old content leaves toward
 * the side it came from and the new one arrives from the other (the way Linear and Vercel do it).
 * A highlight slides between the triggers (`layoutId`). Every menu opens on hover after a short
 * intent delay, on click, on Enter and on ArrowDown (which moves focus into it); Escape closes it and
 * returns focus to its trigger, and it closes when focus or the pointer leaves the nav.
 */

type MenuId = "product" | "oplossingen" | "koppelingen" | "inloggen"

const ORDER: ReadonlyArray<MenuId> = ["product", "oplossingen", "koppelingen", "inloggen"]

type Area = {
  readonly id: string
  readonly Icon: IconComponent
  readonly title: string
  readonly line: string
  readonly path: string
  /** This site's page about the area, where it has one; otherwise the screen in the product. */
  readonly page?: string
}

const AREAS: ReadonlyArray<Area> = [
  { id: "start", Icon: LayoutDashboard, title: "Start", line: "De dag, voorgetekend", path: "/dashboard" },
  {
    id: "orders",
    Icon: ShoppingBag,
    title: "Bestellingen",
    line: "Elke winkel in één lijst",
    path: "/orders",
    page: "/product/bestellingen"
  },
  {
    id: "tickets",
    Icon: Inbox,
    title: "Klantenservice",
    line: "Tickets met een concept eronder",
    path: "/tickets",
    page: "/product/klantenservice"
  },
  {
    id: "chargebacks",
    Icon: ShieldCheck,
    title: "Chargebacks",
    line: "Bewijs vóór de deadline",
    path: "/chargebacks",
    page: "/product/chargebacks"
  },
  {
    id: "suppliers",
    Icon: Factory,
    title: "Leveranciers",
    line: "Elke overdracht in de bestelling",
    path: "/suppliers",
    page: "/oplossingen/leveranciers"
  },
  {
    id: "automations",
    Icon: Workflow,
    title: "Automatiseringen",
    line: "In gewoon Nederlands",
    path: "/automations",
    page: "/product/automatiseringen"
  }
]

type Portal = {
  readonly Icon: IconComponent
  readonly title: string
  readonly line: string
  readonly anchor: string
  readonly login: "operator" | "supplier" | "partner"
}

/** The three personas, each with its own portal and its own visibility (PRODUCT.md). */
const PORTALS: ReadonlyArray<Portal> = [
  {
    Icon: LayoutDashboard,
    title: "Voor operators",
    line: "De console: bestellingen, klantenservice, chargebacks en automatiseringen.",
    anchor: "/oplossingen/operators",
    login: "operator"
  },
  {
    Icon: Factory,
    title: "Voor leveranciers",
    line: "Een eigen portaal om bestellingen te accepteren, over te dragen en af te rekenen.",
    anchor: "/oplossingen/leveranciers",
    login: "supplier"
  },
  {
    Icon: Users,
    title: "Voor partners",
    line: "Eigen links, verwijzingen en uitbetalingen, en verder niets.",
    anchor: "/oplossingen/partners",
    login: "partner"
  }
]

const LOGINS: ReadonlyArray<
  { readonly Icon: IconComponent; readonly title: string; readonly line: string; readonly key: Portal["login"] }
> = [
  { Icon: LayoutDashboard, title: "Console", line: "Voor de winkel en het team", key: "operator" },
  { Icon: Factory, title: "Leveranciersportaal", line: "Voor fulfilmentpartners", key: "supplier" },
  { Icon: Users, title: "Partnerportaal", line: "Voor affiliates", key: "partner" }
]

const LINKS = [
  { label: "Beveiliging", href: "/beveiliging" },
  { label: "Prijzen", href: "/prijzen" }
] as const

/** Where each portal's sign-in goes: the app's login, carrying `?redirect=` to the portal's start. */
function usePortalHref() {
  const links = useMarketingLinks()
  return (key: Portal["login"]) =>
    key === "operator"
      ? links.login
      : key === "supplier"
      ? links.inApp("/supplier/dashboard")
      : links.inApp("/affiliate/dashboard")
}

/* ── The banner ─────────────────────────────────────────────────────────────────────────────────── */

const BANNER_KEY = "insyte:banner:beta"

/**
 * One true sentence above the bar, on the brand's light tint. Shown on the server and on the first
 * client render, so a first visit never shifts; a visitor who closed it before has it read from
 * storage in an effect and folded away (height and opacity), which is the only shift there is.
 */
function Banner() {
  const links = useMarketingLinks()
  const reduced = useReducedMotion() === true
  const [shown, setShown] = useState(true)

  useEffect(() => {
    try {
      if (globalThis.localStorage.getItem(BANNER_KEY) === "1") setShown(false)
    } catch {
      /* Storage blocked: the banner stays, which is harmless. */
    }
  }, [])

  const dismiss = () => {
    setShown(false)
    try {
      globalThis.localStorage.setItem(BANNER_KEY, "1")
    } catch {
      /* Storage blocked: closed for this visit only. */
    }
  }

  return (
    <AnimatePresence initial={false}>
      {shown
        ? (
          <motion.div
            key="banner"
            role="region"
            aria-label="Melding"
            exit={{ height: 0, opacity: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
            className="overflow-hidden bg-arc-tint text-arc-ink"
          >
            <div className="relative mx-auto flex min-h-10 max-w-[1180px] items-center justify-center py-2 pr-10 pl-3 sm:px-12">
              <p className="flex min-w-0 flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-center text-sm sm:gap-x-3">
                <span className="flex min-w-0 items-center gap-2">
                  <Sparkles size={14} className="shrink-0" />
                  <span className="line-clamp-2 text-ink">
                    <span className="hidden sm:inline">Insyte is in private bèta voor Nederlandse dropshipstores.</span>
                    <span className="sm:hidden">Insyte is in private bèta.</span>
                  </span>
                </span>
                <a
                  href={links.page("/toegang")}
                  className="group/chip inline-flex shrink-0 items-center gap-1 font-medium text-arc-ink text-sm underline-offset-4 hover:underline"
                >
                  <span className="hidden sm:inline">Toegang aanvragen</span>
                  <span className="sm:hidden">Aanvragen</span>
                  <ArrowRight
                    size={13}
                    className="transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/chip:translate-x-0.5"
                  />
                </a>
              </p>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Melding sluiten"
                className="absolute right-2 flex size-8 items-center justify-center rounded-md text-arc-ink transition-colors hover:bg-paper/70 sm:right-4"
              >
                <X size={15} />
              </button>
            </div>
          </motion.div>
        )
        : null}
    </AnimatePresence>
  )
}

/** Whether the bar has stuck to the top: the banner above it has scrolled away. */
function useStuck(ref: { readonly current: HTMLElement | null }) {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      const top = ref.current?.getBoundingClientRect().top ?? 1
      setStuck(top <= 0 && globalThis.scrollY > 0)
    }
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(read)
    }
    read()
    globalThis.addEventListener("scroll", onScroll, { passive: true })
    globalThis.addEventListener("resize", onScroll)
    return () => {
      globalThis.removeEventListener("scroll", onScroll)
      globalThis.removeEventListener("resize", onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [ref])
  return stuck
}

/* ── The mega menus ─────────────────────────────────────────────────────────────────────────────── */

/** The content column every menu sits on: the bar's own, so a menu lines up with the hero under it. */
const CONTAINER = "px-2 sm:px-3"
const INNER = "px-3 sm:px-5 lg:px-6"

/** A column's small heading. */
const ColHead = ({ children }: { readonly children: ReactNode }) => (
  <span className="text-ink-3 text-sm">{children}</span>
)

const LINK_CLASS =
  "w-fit rounded-sm font-medium text-ink text-md underline-offset-4 decoration-ink-4 transition-colors hover:text-arc-ink hover:underline"

/** The product areas, each with the two lines Harvey-style menus give an entry. */
const ENTRIES: ReadonlyArray<
  { readonly title: string; readonly body: string } & ({ readonly path: string } | { readonly anchor: string })
> = [
  {
    title: "Start",
    body: "De dag, voorgetekend: de zaken die vandaag op je wachten, elk met het voorstel erbij.",
    path: "/dashboard"
  },
  {
    title: "Bestellingen",
    body: "Elke winkel in één lijst, de vertraagde bovenaan en het bericht aan de leverancier klaar.",
    anchor: "/product/bestellingen"
  },
  {
    title: "Klantenservice",
    body: "Gmail en Outlook in één inbox. Onder elk ticket staat een concept in jouw toon.",
    anchor: "/product/klantenservice"
  },
  {
    title: "Chargebacks",
    body: "Insyte verzamelt het bewijs per geschil, ruim voor de deadline van Klarna, PayPal of Stripe.",
    anchor: "/product/chargebacks"
  },
  {
    title: "Leveranciers",
    body: "Elke overdracht zit in de bestelling, en leveranciers werken in hun eigen portaal.",
    anchor: "/oplossingen/leveranciers"
  },
  {
    title: "Automatiseringen",
    body: "Beschrijf wat er moet gebeuren; Insyte zet de stappen neer met de diensten die je al hebt.",
    anchor: "/product/automatiseringen"
  },
  {
    title: "Insyte AI",
    body: "Een agent die het werk doet binnen jouw regels. Wat geld of klanten raakt, legt hij eerst aan je voor.",
    anchor: "/product/insyte-ai"
  },
  {
    title: "Analytics",
    body: "Insyte leest je cijfers en schrijft op wat het vond, elke bevinding met een eigen grafiek en bron.",
    anchor: "/product/insyte-ai#analytics"
  }
]

/** A featured tile: a picture on its ground, then a title and one line on the paper under it. */
function Feature(
  { children, title, line, href, onPick, ground }: {
    readonly children: ReactNode
    readonly title: string
    readonly line: string
    readonly href: string
    readonly onPick: () => void
    readonly ground: "abyss" | "mist"
  }
) {
  return (
    <a href={href} onClick={onPick} className="group/feat flex flex-col gap-3 rounded-lg">
      <div
        aria-hidden
        className={cn(
          "relative isolate overflow-hidden rounded-lg",
          ground === "abyss" ? "bg-abyss text-mesh-ink" : "bg-mist text-ink"
        )}
      >
        {ground === "abyss"
          ? (
            <div className="pointer-events-none absolute inset-0 -z-10 drafting-chalk [mask-image:linear-gradient(180deg,black,transparent_85%)]" />
          )
          : null}
        {children}
      </div>
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1 font-medium text-base text-ink">
          {title}
          <ArrowRight
            size={14}
            className="text-ink-3 transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/feat:translate-x-0.5"
          />
        </span>
        <span className="text-ink-3 text-sm">{line}</span>
      </span>
    </a>
  )
}

/** The proposal plate for Allure, as the console draws it, on its abyss ground. */
function ProposalTile() {
  const item = INCOMING[0]
  const p = item?.proposal
  if (item === undefined || p === undefined) return null
  return (
    <div className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center gap-2 text-mesh-ink-2 text-xs">
        <Sparkles size={12} />
        Voorstel van Insyte
        <span className="ml-auto rounded-sm bg-mesh-ink/12 px-1.5 text-2xs text-mesh-ink">Wacht op jou</span>
      </div>
      <div className="flex flex-col gap-2 rounded-md p-3 plate">
        <span className="font-medium text-mesh-ink text-sm">{p.heading}</span>
        <span className="text-mesh-ink-2 text-xs leading-relaxed">{p.body}</span>
        <span className="flex flex-wrap gap-1">
          {p.sources.map((s) => (
            <span key={s} className="rounded-sm bg-mesh-ink/10 px-1.5 py-0.5 text-2xs text-mesh-ink-2">
              {s}
            </span>
          ))}
        </span>
        <span className="flex items-center gap-1.5 pt-1">
          <span className="inline-flex h-6 items-center gap-1 rounded-sm bg-arc px-2 font-medium text-2xs text-mesh-ink">
            <Check size={11} />
            Versturen
          </span>
          <span className="inline-flex h-6 items-center rounded-sm bg-mesh-ink/10 px-2 text-2xs text-mesh-ink">
            Bewerken
          </span>
          <span className="ml-auto text-2xs text-mesh-ink-3 tabular-nums">{item.value} · {item.store}</span>
        </span>
      </div>
    </div>
  )
}

function ProductMenu({ onPick }: { readonly onPick: () => void }) {
  const links = useMarketingLinks()
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px] gap-x-12 py-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_400px] xl:gap-x-16">
      <ul className="col-span-2 grid grid-cols-2 gap-x-12 gap-y-8 xl:gap-x-16">
        {ENTRIES.map((e) => (
          <li key={e.title}>
            <a
              href={"anchor" in e ? links.page(e.anchor) : links.inApp(e.path)}
              onClick={onPick}
              className="group/entry flex flex-col gap-1.5 rounded-md"
            >
              <span className="font-medium text-base text-ink transition-colors group-hover/entry:text-arc-ink">
                {e.title}
              </span>
              <span className="max-w-[46ch] text-ink-3 text-sm">{e.body}</span>
            </a>
          </li>
        ))}
      </ul>
      <Feature
        ground="abyss"
        href={links.inApp("/dashboard")}
        onPick={onPick}
        title="Het voorstel staat al klaar"
        line="Insyte schrijft het bericht aan Allure; jij verstuurt, past aan of negeert."
      >
        <ProposalTile />
      </Feature>
    </div>
  )
}

/** Shopify, the inbox, a payment provider and a carrier, each drawn into Insyte as a line. */
export function ConnectionsTile() {
  const reduced = useReducedMotion() === true
  const rows: ReadonlyArray<Vendor> = ["shopify", "gmail", "klarna", "postnl"]
  return (
    <div className="flex flex-col gap-3 p-5">
      {rows.map((v, i) => (
        <div key={v} className="flex items-center gap-3">
          <Logo vendor={v} size={28} />
          <span className="w-16 shrink-0 text-ink-2 text-xs">{VENDORS[v].name}</span>
          <span className="relative h-px flex-1 overflow-hidden">
            <span className="absolute inset-0 bg-ink-5" />
            <motion.span
              className="absolute inset-0 origin-left bg-arc"
              initial={reduced ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.6, delay: 0.08 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
            />
          </span>
          <Mark size={20} />
        </div>
      ))}
    </div>
  )
}

function SolutionsMenu({ onPick }: { readonly onPick: () => void }) {
  const links = useMarketingLinks()
  const href = usePortalHref()
  const col = "flex flex-col gap-4 py-8 pr-8 pl-8 first:pl-0"
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_340px] divide-x divide-hairline xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_400px]">
      <div className={col}>
        <ColHead>Per rol</ColHead>
        <ul className="flex flex-col gap-3">
          {PORTALS.map((p) => (
            <li key={p.anchor}>
              <a href={links.page(p.anchor)} onClick={onPick} className={LINK_CLASS}>
                {p.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className={col}>
        <ColHead>Per werk</ColHead>
        <ul className="flex flex-col gap-3">
          {ENTRIES.flatMap((
            e
          ) => ("anchor" in e && e.anchor.startsWith("/product/") && !e.anchor.includes("#") ? [e] : [])).map((
            e
          ) => (
            <li key={e.title}>
              <a href={links.page(e.anchor)} onClick={onPick} className={LINK_CLASS}>
                {e.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className={col}>
        <ColHead>Eigen portalen</ColHead>
        <ul className="flex flex-col gap-3">
          {LOGINS.map((l) => (
            <li key={l.key}>
              <a href={href(l.key)} onClick={onPick} className={cn(LINK_CLASS, "inline-flex items-center gap-1")}>
                {l.title}
                <ArrowUpRight size={13} className="text-ink-3" />
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="py-8 pl-8">
        <Feature
          ground="mist"
          href={links.page("/koppelingen")}
          onPick={onPick}
          title="Eén keer koppelen"
          line="Je winkel, je inbox, je betaalproviders en je vervoerders lopen Insyte in."
        >
          <ConnectionsTile />
        </Feature>
      </div>
    </div>
  )
}

/** The services Insyte connects to, by what they do (workspace-store, marketplace, the builder). */
const INTEGRATIONS: ReadonlyArray<{ readonly group: string; readonly vendors: ReadonlyArray<Vendor> }> = [
  { group: "Commerce", vendors: ["shopify"] },
  { group: "Betalingen", vendors: ["stripe", "klarna", "paypal"] },
  { group: "E-mail", vendors: ["gmail", "outlook"] },
  { group: "Marketing", vendors: ["klaviyo"] },
  { group: "Verzending", vendors: ["dhl", "postnl", "aftership"] },
  { group: "Team", vendors: ["slack", "teams", "sheets", "zapier"] }
]

function IntegrationsMenu({ onPick }: { readonly onPick: () => void }) {
  const links = useMarketingLinks()
  return (
    <div className="grid grid-cols-6 divide-x divide-hairline">
      {INTEGRATIONS.map(({ group, vendors }, i) => (
        <div key={group} className={cn("flex flex-col gap-4 py-8", i === 0 ? "pr-4 xl:pr-6" : "px-4 xl:px-6")}>
          <ColHead>{group}</ColHead>
          <ul className="flex flex-col gap-2.5">
            {vendors.map((v) => (
              <li key={v}>
                <a
                  href={links.page(`/koppelingen#${v}`)}
                  onClick={onPick}
                  className="group/logo flex items-center gap-2.5 rounded-md font-medium text-base text-ink"
                >
                  <Logo vendor={v} size={28} />
                  <span className="leading-tight transition-colors group-hover/logo:text-arc-ink">
                    {VENDORS[v].name}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {i === 0
            ? (
              <a
                href={links.page("/koppelingen")}
                onClick={onPick}
                className="group/all mt-auto inline-flex w-fit items-center gap-1 font-medium text-arc-ink text-sm underline-offset-4 hover:underline"
              >
                Alle koppelingen
                <ArrowRight
                  size={13}
                  className="transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/all:translate-x-0.5"
                />
              </a>
            )
            : null}
        </div>
      ))}
    </div>
  )
}

function LoginMenu({ onPick }: { readonly onPick: () => void }) {
  const href = usePortalHref()
  return (
    <ul className="flex flex-col gap-0.5 p-2">
      {LOGINS.map(({ Icon, key, line, title }) => (
        <li key={key}>
          <a
            href={href(key)}
            onClick={onPick}
            className="group/login flex items-center gap-3 rounded-lg p-2.5 outline-none transition-colors hover:bg-mist focus-visible:bg-mist"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-mist text-ink-2">
              <Icon size={16} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-base text-ink">{title}</span>
              <span className="text-ink-3 text-sm">{line}</span>
            </span>
            <ArrowUpRight
              size={14}
              className="text-ink-3 transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/login:translate-x-0.5 group-hover/login:-translate-y-0.5"
            />
          </a>
        </li>
      ))}
    </ul>
  )
}

/* ── The shared panel ───────────────────────────────────────────────────────────────────────────── */

const slide = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 32 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -32 })
}

/**
 * The one sheet the three mega menus open in: full width, flush under the bar with a hairline at its
 * top, on paper. Between menus its height follows the new content on a spring while the old
 * content leaves toward one side and the new arrives from the other.
 */
function MegaPanel({ open, dir, id, onPick }: {
  readonly open: Exclude<MenuId, "inloggen"> | null
  readonly dir: number
  readonly id: string
  readonly onPick: () => void
}) {
  const reduced = useReducedMotion() === true
  const [height, setHeight] = useState<number | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (node === null) return
    observer.current?.disconnect()
    setHeight(node.offsetHeight)
    observer.current = new ResizeObserver(() => setHeight(node.offsetHeight))
    observer.current.observe(node)
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])

  return (
    <AnimatePresence>
      {open === null ? null : (
        <motion.div
          key="mega"
          id={id}
          initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: height ?? "auto" }}
          exit={reduced
            ? { opacity: 0, transition: { duration: 0 } }
            : { opacity: 0, height: 0, transition: { duration: 0.18, ease: [0.25, 1, 0.5, 1] } }}
          transition={reduced
            ? { duration: 0 }
            : { height: { type: "spring", stiffness: 380, damping: 40, mass: 0.8 }, opacity: { duration: 0.14 } }}
          className="absolute inset-x-0 top-full overflow-hidden bg-paper text-left text-ink shadow-[inset_0_1px_0_var(--hairline),0_24px_40px_-28px_color-mix(in_oklch,var(--abyss)_45%,transparent)]"
        >
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={open}
              ref={measure}
              custom={dir}
              variants={slide}
              initial={reduced ? false : "enter"}
              animate="center"
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : "exit"}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className={cn("absolute inset-x-0 top-0", CONTAINER)}
            >
              <div className={INNER}>
                {open === "product"
                  ? <ProductMenu onPick={onPick} />
                  : open === "oplossingen"
                  ? <SolutionsMenu onPick={onPick} />
                  : <IntegrationsMenu onPick={onPick} />}
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ── The bar ────────────────────────────────────────────────────────────────────────────────────── */

const MEGA: ReadonlyArray<{ readonly id: Exclude<MenuId, "inloggen">; readonly label: string }> = [
  { id: "product", label: "Product" },
  { id: "oplossingen", label: "Oplossingen" },
  { id: "koppelingen", label: "Koppelingen" }
]

/** The active trigger's mark: a bar at the foot of the nav that slides between triggers. */
function Underline() {
  return (
    <motion.span
      layoutId="nav-underline"
      transition={{ type: "spring", stiffness: 480, damping: 40 }}
      className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-abyss"
    />
  )
}

export function SiteNav() {
  const links = useMarketingLinks()
  const portalHref = usePortalHref()
  const reduced = useReducedMotion() === true
  const root = useRef<HTMLDivElement | null>(null)
  const stuck = useStuck(root)
  const [open, setOpen] = useState<MenuId | null>(null)
  const [dir, setDir] = useState(0)
  const [sheet, setSheet] = useState(false)
  const panelId = useId()
  const loginId = useId()
  const triggers = useRef<Partial<Record<MenuId, HTMLButtonElement | null>>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const last = useRef<MenuId | null>(null)

  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }

  const show = useCallback((next: MenuId | null) => {
    const prev = last.current
    setDir(prev === null || next === null ? 0 : Math.sign(ORDER.indexOf(next) - ORDER.indexOf(prev)))
    last.current = next
    setOpen(next)
  }, [])

  const close = useCallback((focus: boolean) => {
    clear()
    const was = last.current
    show(null)
    if (focus && was !== null) triggers.current[was]?.focus()
  }, [show])

  useEffect(() => {
    if (open === null && !sheet) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (open !== null) close(true)
      setSheet(false)
    }
    const onDown = (e: PointerEvent) => {
      if (root.current !== null && !root.current.contains(e.target as Node)) {
        close(false)
        setSheet(false)
      }
    }
    globalThis.addEventListener("keydown", onKey)
    globalThis.addEventListener("pointerdown", onDown)
    return () => {
      globalThis.removeEventListener("keydown", onKey)
      globalThis.removeEventListener("pointerdown", onDown)
    }
  }, [open, sheet, close])

  useEffect(() => clear, [])

  /* Hover intent: 120ms before the first menu opens, none between menus, 200ms grace to leave. */
  const enter = (id: MenuId) => {
    clear()
    if (last.current !== null) show(id)
    else timer.current = setTimeout(() => show(id), 120)
  }
  const leave = () => {
    clear()
    timer.current = setTimeout(() => show(null), 200)
  }

  const onTriggerKey = (id: MenuId) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowDown") return
    e.preventDefault()
    show(id)
    const target = id === "inloggen" ? loginId : panelId
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.getElementById(target)?.querySelector<HTMLElement>("a,button")?.focus()
      })
    )
  }

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null
    if (next === null || root.current?.contains(next) !== true) {
      if (last.current !== null) show(null)
    }
  }

  const chevron = (id: MenuId) => (
    <ChevronDown
      size={14}
      className={cn(
        "transition-transform duration-[240ms] ease-[var(--ease-out-expo)]",
        open === id && "rotate-180",
        reduced && "transition-none"
      )}
    />
  )

  const triggerProps = (id: MenuId) => ({
    ref: (n: HTMLButtonElement | null) => {
      triggers.current[id] = n
    },
    type: "button" as const,
    "aria-expanded": open === id,
    "aria-controls": open === id ? (id === "inloggen" ? loginId : panelId) : undefined,
    "aria-haspopup": "true" as const,
    onClick: () => {
      clear()
      show(open === id ? null : id)
    },
    onKeyDown: onTriggerKey(id),
    onPointerEnter: () => enter(id)
  })

  const ITEM_CLASS =
    "relative flex h-full items-center gap-1 rounded-sm px-3 font-medium text-base transition-colors xl:px-3.5"
  const mega = open === "inloggen" ? null : open

  return (
    <>
      <Banner />
      <div
        ref={root}
        onBlur={onBlur}
        onPointerLeave={leave}
        onPointerEnter={() => {
          if (last.current !== null) clear()
        }}
        className={cn(
          "sticky top-0 z-50 bg-paper transition-shadow duration-[240ms] ease-[var(--ease-out-quart)]",
          stuck && open === null &&
            "shadow-[inset_0_-1px_0_var(--hairline),0_8px_24px_-20px_color-mix(in_oklch,var(--abyss)_40%,transparent)]"
        )}
      >
        <nav aria-label="Hoofdmenu" className={CONTAINER}>
          <div className="relative">
            <div
              className={cn(
                "flex items-stretch gap-2 transition-[height] duration-[240ms] ease-[var(--ease-out-quart)]",
                INNER,
                stuck ? "h-16" : "h-[72px]"
              )}
            >
              <a
                href={links.home}
                aria-label="Insyte, naar het begin"
                className="mr-6 flex w-fit shrink-0 items-center self-center rounded-md xl:mr-10"
              >
                <Wordmark tone="ink" />
              </a>

              <LayoutGroup id="nav">
                <ul className="hidden items-stretch gap-1 lg:flex xl:gap-2">
                  {MEGA.map(({ id, label }) => (
                    <li key={id} className="flex">
                      <button
                        {...triggerProps(id)}
                        className={cn(ITEM_CLASS, open === id ? "text-ink" : "text-ink-2 hover:text-ink")}
                      >
                        {label}
                        {chevron(id)}
                        {open === id ? <Underline /> : null}
                      </button>
                    </li>
                  ))}
                  {LINKS.map((l) => (
                    <li key={l.href} className="flex">
                      <a
                        href={links.page(l.href)}
                        onPointerEnter={leave}
                        className={cn(ITEM_CLASS, "text-ink-2 hover:text-ink")}
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </LayoutGroup>

              <div className="ml-auto flex items-center gap-2">
                <a
                  href={links.page("/vragen")}
                  onPointerEnter={leave}
                  className="hidden h-9 items-center rounded-sm px-2 font-medium text-base text-ink-2 transition-colors hover:text-ink xl:inline-flex"
                >
                  Vragen
                </a>
                <div className="relative hidden h-9 sm:flex">
                  <button
                    {...triggerProps("inloggen")}
                    className={cn(
                      "flex items-center gap-1 rounded-sm px-3 font-medium text-base transition-colors",
                      open === "inloggen" ? "text-ink" : "text-ink-2 hover:text-ink"
                    )}
                  >
                    Inloggen
                    {chevron("inloggen")}
                  </button>
                  <AnimatePresence>
                    {open === "inloggen"
                      ? (
                        <motion.div
                          id={loginId}
                          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={reduced
                            ? { opacity: 0, transition: { duration: 0 } }
                            : { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
                          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                          className="absolute top-full right-0 w-[340px] origin-top-right pt-3"
                        >
                          <div className="rounded-xl bg-paper text-left text-ink window-lift">
                            <LoginMenu onPick={() => close(false)} />
                          </div>
                        </motion.div>
                      )
                      : null}
                  </AnimatePresence>
                </div>
                <a
                  href={links.page("/toegang")}
                  onPointerEnter={leave}
                  className="group/cta inline-flex h-9 items-center gap-1.5 rounded-md bg-abyss px-4 font-medium text-base text-mesh-ink transition-colors hover:bg-abyss-2"
                >
                  Toegang aanvragen
                  <ArrowRight
                    size={14}
                    className="hidden transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/cta:translate-x-0.5 sm:block"
                  />
                </a>
                <button
                  type="button"
                  aria-expanded={sheet}
                  aria-controls="nav-sheet"
                  aria-label={sheet ? "Menu sluiten" : "Menu openen"}
                  onClick={() => {
                    close(false)
                    setSheet((v) => !v)
                  }}
                  className="inline-flex size-9 items-center justify-center rounded-md text-ink-2 hover:bg-mist hover:text-ink lg:hidden"
                >
                  {sheet ? <X size={18} /> : <Menu size={18} />}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {sheet
                ? (
                  <motion.div
                    id="nav-sheet"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    className="absolute inset-x-0 top-full max-h-[calc(100svh-88px)] overflow-y-auto overscroll-contain rounded-xl bg-paper p-2 text-ink window-lift lg:hidden"
                  >
                    <SheetGroup title="Product">
                      <ul className="grid grid-cols-2 gap-0.5">
                        {AREAS.map(({ Icon, id, page, path, title }) => (
                          <li key={id}>
                            <a
                              href={page === undefined ? links.inApp(path) : links.page(page)}
                              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-mist"
                            >
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-arc-tint text-arc-ink">
                                <Icon size={15} />
                              </span>
                              <span className="truncate font-medium text-base">{title}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </SheetGroup>
                    <SheetGroup title="Oplossingen">
                      <ul className="flex flex-col gap-0.5">
                        {PORTALS.map(({ Icon, anchor, title }) => (
                          <li key={anchor}>
                            <a
                              href={links.page(anchor)}
                              onClick={() => setSheet(false)}
                              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-mist"
                            >
                              <Icon size={16} className="text-ink-3" />
                              <span className="font-medium text-base">{title}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </SheetGroup>
                    <ul className="flex flex-col gap-0.5 border-hairline border-t py-2">
                      {[
                        { label: "Insyte AI", href: "/product/insyte-ai" },
                        { label: "Analytics", href: "/product/insyte-ai#analytics" },
                        { label: "Koppelingen", href: "/koppelingen" },
                        ...LINKS,
                        { label: "Vragen", href: "/vragen" }
                      ]
                        .map((l) => (
                          <li key={l.href}>
                            <a
                              href={links.page(l.href)}
                              onClick={() => setSheet(false)}
                              className="block rounded-lg px-2.5 py-2 font-medium text-base hover:bg-mist"
                            >
                              {l.label}
                            </a>
                          </li>
                        ))}
                    </ul>
                    <SheetGroup title="Inloggen">
                      <ul className="flex flex-col gap-0.5">
                        {LOGINS.map(({ Icon, key, line, title }) => (
                          <li key={key}>
                            <a
                              href={portalHref(key)}
                              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-mist"
                            >
                              <Icon size={16} className="text-ink-3" />
                              <span className="flex flex-1 flex-col">
                                <span className="font-medium text-base">{title}</span>
                                <span className="text-ink-3 text-sm">{line}</span>
                              </span>
                              <ArrowUpRight size={14} className="text-ink-3" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </SheetGroup>
                    <a
                      href={links.page("/toegang")}
                      className="mt-1 flex h-11 items-center justify-center gap-2 rounded-lg bg-abyss font-medium text-md text-mesh-ink"
                    >
                      Toegang aanvragen
                      <ArrowRight size={16} />
                    </a>
                  </motion.div>
                )
                : null}
            </AnimatePresence>
          </div>
        </nav>
        <div className="hidden lg:block">
          <MegaPanel open={mega} dir={dir} id={panelId} onPick={() => close(false)} />
        </div>
      </div>
    </>
  )
}

function SheetGroup({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-hairline border-t py-2 first:border-t-0 first:pt-1">
      <span className="px-2.5 text-ink-3 text-sm">{title}</span>
      {children}
    </div>
  )
}
