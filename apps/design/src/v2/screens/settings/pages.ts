import type { Glyph } from "../../fixtures/agents.ts"
import {
  Archive,
  Bell,
  BookOpen,
  Bot,
  Building,
  CreditCard,
  Database,
  FileText,
  Globe,
  Key,
  Keyboard,
  LayoutGrid,
  Mail,
  MessageCircle,
  MessageSquareText,
  Palette,
  Plug,
  Receipt,
  Returns,
  Shield,
  ShieldCheck,
  Sparkles,
  Truck,
  User,
  UserCog,
  Users,
  Wallet,
  Webhook
} from "../../ui/icons.tsx"
import type { PermArea } from "../../view.ts"

/**
 * Instellingen's pages, in the menu's groups: the slug after `/v2/instellingen/`, the title and the
 * page in the current demo it is rebuilt from (`src/app/routes/_admin/settings/`).
 */
export type SettingsPage = {
  readonly slug: string
  readonly title: string
  readonly glyph: Glyph
  readonly from: string
}

export const SETTINGS_GROUPS: ReadonlyArray<{ readonly title: string; readonly pages: ReadonlyArray<SettingsPage> }> = [
  {
    title: "Jij en het team",
    pages: [
      { slug: "profiel", title: "Account", glyph: User, from: "settings/profile" },
      { slug: "team", title: "Team", glyph: Users, from: "settings/team" },
      { slug: "rollen", title: "Rollen", glyph: UserCog, from: "settings/roles" },
      { slug: "meldingen", title: "Meldingen", glyph: Bell, from: "settings/notifications" },
      { slug: "sneltoetsen", title: "Sneltoetsen", glyph: Keyboard, from: "settings/shortcuts" }
    ]
  },
  {
    title: "Werkruimte",
    pages: [
      { slug: "winkels", title: "Winkels", glyph: Building, from: "settings/stores" },
      { slug: "facturatie", title: "Facturatie", glyph: CreditCard, from: "settings/billing" },
      { slug: "regio", title: "Regio", glyph: Globe, from: "settings/regional" },
      { slug: "btw", title: "Btw", glyph: Receipt, from: "settings/vat" }
    ]
  },
  {
    title: "Winkel",
    pages: [
      { slug: "retouren", title: "Retouren", glyph: Returns, from: "settings/returns" },
      { slug: "verzending", title: "Verzending", glyph: Truck, from: "settings/shipping" },
      { slug: "sjablonen", title: "Sjablonen", glyph: MessageSquareText, from: "settings/templates" },
      { slug: "huisstijl", title: "Huisstijl", glyph: Palette, from: "settings/brand" },
      { slug: "e-mail-en-domein", title: "E-mail en domein", glyph: Mail, from: "settings/email-domain" }
    ]
  },
  {
    title: "Magnus",
    pages: [
      { slug: "ai/zelfstandigheid", title: "Zelfstandigheid", glyph: Sparkles, from: "settings/ai/autonomy" },
      { slug: "ai/klantagent", title: "Klantagent", glyph: MessageCircle, from: "settings/ai/customer-agent" },
      { slug: "ai/kennisbank", title: "Kennisbank", glyph: BookOpen, from: "settings/ai/knowledge" },
      { slug: "ai/limieten", title: "Limieten", glyph: Wallet, from: "settings/ai/limits" },
      { slug: "agents", title: "Agents en MCP", glyph: Bot, from: "settings/agents" }
    ]
  },
  {
    title: "Koppelingen",
    pages: [
      { slug: "koppelingen", title: "Koppelingen", glyph: Plug, from: "settings/integrations" },
      { slug: "apps", title: "Apps", glyph: LayoutGrid, from: "settings/apps" },
      { slug: "api-sleutels", title: "API-sleutels", glyph: Key, from: "settings/api-keys" },
      { slug: "webhooks", title: "Webhooks", glyph: Webhook, from: "settings/webhooks" }
    ]
  },
  {
    title: "Beveiliging en gegevens",
    pages: [
      { slug: "beveiliging", title: "Beveiliging", glyph: Shield, from: "settings/security" },
      { slug: "privacy", title: "Gegevens en privacy", glyph: ShieldCheck, from: "settings/privacy" },
      { slug: "gegevens", title: "Je gegevens", glyph: Database, from: "settings/data" },
      { slug: "logboek", title: "Logboek", glyph: FileText, from: "settings/log" },
      { slug: "prullenbak", title: "Prullenbak", glyph: Archive, from: "settings/trash" }
    ]
  }
]

export const SETTINGS_PAGES: ReadonlyArray<SettingsPage> = SETTINGS_GROUPS.flatMap((g) => g.pages)

/**
 * The permission each page reads (`null`: a page about yourself, open to every role). Team and roles
 * read Team, billing reads Facturatie, the connections read Koppelingen, Je gegevens reads Data; the
 * rest is Instellingen.
 */
const PAGE_AREA: Readonly<Record<string, PermArea | null>> = {
  team: "team",
  rollen: "team",
  meldingen: null,
  sneltoetsen: null,
  facturatie: "billing",
  agents: "integrations",
  koppelingen: "integrations",
  apps: "integrations",
  "api-sleutels": "integrations",
  webhooks: "integrations",
  gegevens: "data"
}

export const pageArea = (slug: string): PermArea | null => (slug in PAGE_AREA ? PAGE_AREA[slug] ?? null : "settings")
