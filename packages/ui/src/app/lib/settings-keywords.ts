/*
 * The settings inside each settings page, as the area panel's filter finds them ("2fa" is Beveiliging, "stille uren"
 * Meldingen, "csv" Team), in the pages' own words. A page's name is found without them. Per path, so the panel and its
 * test read the same list.
 */
export const SETTINGS_KEYWORDS = {
  "/settings/me": ["naam", "je naam", "e-mail", "persoonlijk", "profiel bewerken"],
  "/settings/profile": [
    "werkruimte",
    "naam werkruimte",
    "rechtspersoon",
    "btw-nummer",
    "factuur-e-mail",
    "land",
    "late bestelling",
    "groot geschil",
    "drempels",
    "werkruimte verwijderen"
  ],
  "/settings/team": [
    "collega's uitnodigen",
    "uitnodiging",
    "csv",
    "importeren",
    "uitnodigen via link",
    "plekken",
    "leden",
    "deactiveren",
    "eigenaar overdragen"
  ],
  "/settings/roles": ["rechten", "toegang", "bekijken", "bewerken", "beheren", "nieuwe rol", "toegangsverzoeken"],
  "/settings/stores": ["shopify", "winkel koppelen", "winkel toevoegen", "synchronisatie"],
  "/settings/billing": ["abonnement", "betaalmethode", "facturen", "kaart", "plekken bijkopen", "opzeggen"],
  "/settings/regional": ["taal", "tijdzone", "valuta", "datumnotatie", "tijdnotatie", "week begint op"],
  "/settings/returns": ["termijnen", "redenen", "oplossingen", "retourportaal", "retourlabel", "terugbetaling"],
  "/settings/shipping": ["volgen", "track & trace", "17track", "zending", "vervoerder"],
  "/settings/templates": ["e-mails", "sjabloon", "pakket bezorgd", "vaste links"],
  "/settings/brand": [
    "logo",
    "merkkleur",
    "kleur",
    "lettertype",
    "afzender",
    "afzendernaam",
    "supportadres",
    "website",
    "chatvenster"
  ],
  "/settings/vat": ["oss", "oss-nummer", "eu", "verzendkosten", "per winkel"],
  "/settings/notifications": [
    "stille uren",
    "weekend",
    "dagelijks overzicht",
    "e-mail",
    "push",
    "slack",
    "volg automatisch",
    "toegewezen",
    "vermeld"
  ],
  "/settings/shortcuts": ["toetsen", "ga naar", "opdrachtenpalet", "toetsenbord"],
  "/settings/ai/autonomy": ["ai", "per actie", "goedkeuren", "geschiedenis"],
  "/settings/ai/customer-agent": ["ai", "chatbot", "openingstijden", "overdragen", "toon", "kanalen"],
  "/settings/ai/knowledge": ["ai", "hoofdstukken", "antwoorden", "artikelen"],
  "/settings/ai/limits": ["ai", "maandbudget", "budget", "kosten", "per persoon"],
  "/settings/integrations": ["koppelen", "klaviyo", "aftership", "sendcloud", "stripe", "google", "verbindingen"],
  "/settings/apps": ["marketplace", "app installeren"],
  "/settings/security": [
    "wachtwoord",
    "tweestapsverificatie",
    "2fa",
    "verplichten",
    "google sso",
    "sso",
    "sessies",
    "actieve sessies",
    "uitloggen",
    "auditlog"
  ],
  "/settings/api-keys": ["sleutel", "api", "token", "intrekken", "roteren"],
  "/settings/webhooks": ["endpoint", "leveringen", "ondertekening", "geheim"],
  "/settings/email-domain": ["domein", "dns", "afzenders", "antwoorden naar", "spf", "dkim"],
  "/settings/agents": ["mcp", "mcp-server", "eigen agents"],
  "/settings/data": [
    "export",
    "exporteren",
    "downloaden",
    "verzoeken van klanten",
    "avg",
    "gdpr",
    "wat insyte bewaart"
  ],
  "/settings/privacy": [
    "bewaartermijnen",
    "bewaren",
    "verwijderen",
    "avg",
    "gdpr",
    "insyte-support mag meekijken",
    "support",
    "meekijken"
  ],
  "/settings/log": ["auditlog", "wijzigingen", "geschiedenis"],
  "/settings/trash": ["verwijderd", "terugzetten", "definitief verwijderen"]
} as const satisfies Record<string, ReadonlyArray<string>>
