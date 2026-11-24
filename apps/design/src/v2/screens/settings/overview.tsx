import { ASSISTANT } from "../../assistant.ts"
import type { Glyph } from "../../fixtures/agents.ts"
import {
  ACCOUNT,
  APPS,
  articlesFor,
  auditFor,
  budgetFor,
  CUSTOM_ROLES,
  customerAgentFor,
  disconnectedStores,
  DOMAIN,
  failingWebhooks,
  hooksFor,
  INTEGRATIONS,
  invitesFor,
  keysFor,
  knowledgeGaps,
  longDate,
  membersFor,
  missingDnsRecords,
  policyFor,
  RENEWAL,
  STORE_ROWS,
  TEMPLATE_LINKS,
  trashFor
} from "../../fixtures/settings.ts"
import { paths } from "../../router.tsx"
import { Status } from "../../ui/badge.tsx"
import type { Tone } from "../../ui/badge.tsx"
import { cx } from "../../ui/cx.ts"
import { AlertTriangle, BookOpen, Building, Mail, Plug, UserPlus, Webhook } from "../../ui/icons.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { PageSection } from "../../ui/page.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { level } from "../../view.ts"
import { useView } from "../../view.ts"
import type { Staat, View } from "../../view.ts"
import { pageArea, SETTINGS_GROUPS } from "./pages.ts"
import { money, readSaved, SettingsPage } from "./parts.tsx"

const NOW = new Date(2026, 10, 23, 14, 30).getTime()

/** The one line under each page in the overview: where it stands now. */
function hintFor(slug: string, staat: Staat): string | undefined {
  const members = membersFor(staat).length
  const open = invitesFor(staat).filter((i) => i.expires.getTime() > NOW).length
  switch (slug) {
    case "profiel":
      return `${readSaved(staat, "account", ACCOUNT).workspace} · ${readSaved(staat, "account", ACCOUNT).country}`
    case "team":
      return `${members} ${members === 1 ? "persoon" : "personen"}${
        open > 0 ? ` · ${open} uitnodiging${open === 1 ? "" : "en"} open` : ""
      }`
    case "rollen":
      return `5 systeemrollen · ${CUSTOM_ROLES.length} eigen rollen`
    case "meldingen":
      return "Wat je hoort en waar, alleen voor jou"
    case "sneltoetsen":
      return "G en een toets gaat naar een pagina"
    case "winkels":
      return `${STORE_ROWS.filter((s) => s.connected).length} van ${STORE_ROWS.length} gekoppeld`
    case "facturatie":
      return `Scale · verlengt ${longDate(RENEWAL)}`
    case "regio":
      return "Nederlands · EUR · Europe/Amsterdam"
    case "btw":
      return "Per winkel, en OSS voor de EU"
    case "retouren":
      return `30 dagen · retourportaal ${staat === "leeg" ? "uit" : "aan"}`
    case "verzending":
      return "Wat de klant leest per status van de vervoerder"
    case "sjablonen": {
      const empty = Object.values(TEMPLATE_LINKS).filter((v) => v === "").length
      return empty === 0 ? "Alle vaste links ingevuld" : `${empty} van 3 vaste links nog leeg`
    }
    case "huisstijl":
      return "Logo, merkkleur en afzender"
    case "e-mail-en-domein":
      return `${DOMAIN.domain} · ${
        staat === "leeg" ? 0 : DOMAIN.records.length - missingDnsRecords()
      } van ${DOMAIN.records.length} records gevonden`
    case "ai/zelfstandigheid": {
      const auto = Object.values(readSaved(staat, "autonomy", policyFor(staat))).filter((l) => l === "auto").length
      return auto === 0 ? "Alles eerst vragen" : `${auto} acties zelf · de rest eerst vragen`
    }
    case "ai/klantagent": {
      const a = customerAgentFor(staat)
      return a.settings.on ? `Aan op de websitechat · ${a.today.conversations} gesprekken vandaag` : "Staat uit"
    }
    case "ai/kennisbank":
      return `${articlesFor(staat).length} hoofdstukken${
        knowledgeGaps(staat) > 0 ? ` · ${knowledgeGaps(staat)} vragen open` : ""
      }`
    case "ai/limieten": {
      const b = budgetFor(staat)
      return b.limit === null
        ? `${money(b.used, true)} deze maand`
        : `${money(b.used, true)} van ${money(b.limit)} deze maand`
    }
    case "agents":
      return "Je eigen agents · MCP binnenkort"
    case "koppelingen":
      return `${INTEGRATIONS.filter((i) => i.status === "connected").length} van ${INTEGRATIONS.length} gekoppeld`
    case "apps":
      return `${staat === "leeg" ? 0 : APPS.length} geïnstalleerd`
    case "api-sleutels":
      return `${keysFor(staat).filter((k) => k.status === "active").length} actief`
    case "webhooks": {
      const n = hooksFor(staat).length
      return n === 0 ? "Nog geen endpoints" : `${n} endpoints · ${failingWebhooks(staat)} met fouten`
    }
    case "beveiliging":
      return "Tweestapsverificatie verplicht"
    case "privacy":
      return "Bewaartermijnen per soort gegevens"
    case "gegevens":
      return "Waar het staat, export en verzoeken van klanten"
    case "logboek":
      return `${auditFor(staat).length} wijzigingen deze maand`
    case "prullenbak": {
      const n = trashFor(staat).length
      return n === 0 ? "Leeg" : `${n} items, de laatste 30 dagen`
    }
    default:
      return undefined
  }
}

type Attention = {
  readonly slug: string
  readonly glyph: Glyph
  /** A connected service the item is about, shown by its logo instead of the glyph. */
  readonly service?: string
  readonly title: string
  readonly meta: string
  readonly tone: Tone
  readonly word: string
  readonly href?: string
}

function attentionFor(staat: Staat): ReadonlyArray<Attention> {
  const items: Array<Attention> = []
  const uk = STORE_ROWS.find((s) => !s.connected)
  if (disconnectedStores() > 0 && uk !== undefined) {
    items.push({
      slug: "winkels",
      glyph: Building,
      title: `${uk.name} is ontkoppeld`,
      meta: "Nieuwe bestellingen komen niet binnen tot je hem opnieuw koppelt",
      tone: "bad",
      word: "Ontkoppeld"
    })
  }
  const us = STORE_ROWS.find((s) => s.incidents.some((i) => i.resolved === null))
  if (us !== undefined) {
    items.push({
      slug: "winkels",
      glyph: AlertTriangle,
      title: `${us.name} stuurt geen webhooks sinds 03:12`,
      meta: `${ASSISTANT} haalt de wijzigingen zelf op`,
      tone: "warn",
      word: "Loopt"
    })
  }
  const expired = invitesFor(staat).filter((i) => i.expires.getTime() < NOW)
  if (expired.length > 0) {
    items.push({
      slug: "team",
      glyph: UserPlus,
      title: `Uitnodiging voor ${expired[0]?.email ?? ""} verlopen`,
      meta: "Opnieuw versturen of intrekken",
      tone: "warn",
      word: "Verlopen"
    })
  }
  const failing = hooksFor(staat).filter((h) => h.failures > 0)
  if (failing.length > 0) {
    const h = failing[0]
    items.push({
      slug: "webhooks",
      glyph: Webhook,
      title: `Webhook naar ${h?.url.replace(/^https:\/\//, "").split("/")[0] ?? ""} mislukt`,
      meta: `${h?.failures ?? 0} leveringen achter elkaar · ${h?.description ?? ""}`,
      tone: "bad",
      word: "Mislukt",
      href: `${paths.settings("webhooks")}?endpoint=${h?.id ?? ""}`
    })
  }
  if (INTEGRATIONS.some((i) => i.status === "action")) {
    items.push({
      slug: "koppelingen",
      glyph: Plug,
      service: "PayPal",
      title: "PayPal vraagt om opnieuw koppelen",
      meta: "Geschillen van PayPal komen niet binnen",
      tone: "warn",
      word: "Actie nodig"
    })
  }
  if (knowledgeGaps(staat) > 0) {
    items.push({
      slug: "ai/kennisbank",
      glyph: BookOpen,
      title: `${knowledgeGaps(staat)} vragen die de kennisbank niet beantwoordde`,
      meta: "De klantagent droeg ze over aan het team",
      tone: "neutral",
      word: "Open"
    })
  }
  if (staat !== "leeg" && missingDnsRecords() > 0) {
    items.push({
      slug: "e-mail-en-domein",
      glyph: Mail,
      title: `${missingDnsRecords()} DNS-records van ${DOMAIN.domain} ontbreken`,
      meta: "Mail kan in spam belanden tot ze er staan",
      tone: "warn",
      word: "Onvolledig"
    })
  }
  return items
}

const allowed = (view: View, slug: string) => {
  const area = pageArea(slug)
  return area === null || level(view, area) >= 1
}

/**
 * Instellingen: what needs attention first (a store that lost its connection, an invitation that
 * lapsed, a failing webhook), then every page in its group with one line on where it stands. Pages
 * the role cannot open are left out, so Klantenservice sees its own few.
 */
export function OverviewScreen() {
  const view = useView()
  const attention = attentionFor(view.staat).filter((a) => allowed(view, a.slug))
  const members = membersFor(view.staat).length
  return (
    <SettingsPage
      title="Instellingen"
      width="record"
      area={null}
      meta={`${ACCOUNT.workspace} · ${members} ${
        members === 1 ? "persoon" : "personen"
      } · ${STORE_ROWS.length} winkels`}
    >
      {attention.length > 0 && (
        <PageSection id="aandacht" title="Vraagt aandacht" meta={String(attention.length)}>
          <List divided label="Vraagt aandacht">
            {attention.map((a) => {
              const G = a.glyph
              return (
                <ListRow
                  key={a.title}
                  padded={false}
                  href={a.href ?? paths.settings(a.slug)}
                  lead={a.service === undefined
                    ? (
                      <GlyphTile>
                        <G size={16} />
                      </GlyphTile>
                    )
                    : <ServiceLogo service={a.service} size={32} />}
                  title={a.title}
                  meta={a.meta}
                  trail={<Status tone={a.tone}>{a.word}</Status>}
                />
              )
            })}
          </List>
        </PageSection>
      )}

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
        {SETTINGS_GROUPS.map((group) => {
          const pages = group.pages.filter((p) => allowed(view, p.slug))
          if (pages.length === 0) return null
          return (
            <PageSection key={group.title} id={`groep-${group.title}`} title={group.title}>
              <List label={group.title} className={cx("-mx-2")}>
                {pages.map((p) => {
                  const G = p.glyph
                  return (
                    <ListRow
                      key={p.slug}
                      href={paths.settings(p.slug)}
                      lead={
                        <GlyphTile>
                          <G size={16} />
                        </GlyphTile>
                      }
                      title={p.title}
                      meta={hintFor(p.slug, view.staat)}
                    />
                  )
                })}
              </List>
            </PageSection>
          )
        })}
      </div>
    </SettingsPage>
  )
}
