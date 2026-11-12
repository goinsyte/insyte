/*
 * The rights a flow's service account can hold (widgets/05 §1.5). A flow acts as itself, never as a person, so what it
 * may touch is listed here and granted per flow; a step whose right is switched off cannot run, and says so.
 */

export const SCOPES: ReadonlyArray<{ readonly id: string; readonly label: string }> = [
  { id: "orders.read", label: "Bestellingen lezen" },
  { id: "orders.write", label: "Bestellingen bewerken" },
  { id: "customers.read", label: "Klanten lezen" },
  { id: "customers.write", label: "Klanten labelen" },
  { id: "customers.email", label: "Klanten mailen" },
  { id: "tickets.write", label: "Tickets maken" },
  { id: "team.notify", label: "Collega's berichten" },
  { id: "suppliers.message", label: "Leveranciers berichten" },
  { id: "refunds.write", label: "Terugbetalen" },
  { id: "payments.read", label: "Betalingen lezen" },
  { id: "disputes.write", label: "Geschillen beantwoorden" },
  { id: "stock.read", label: "Voorraad lezen" },
  { id: "marketing.write", label: "Campagnes beheren" },
  { id: "accounting.write", label: "Boekhouding boeken" },
  { id: "files.write", label: "Bestanden bewerken" },
  { id: "ai.draft", label: "AI laten opstellen" }
]

export const SCOPE_IDS: ReadonlyArray<string> = SCOPES.map((s) => s.id)

export const SCOPE_LABEL: Readonly<Record<string, string>> = Object.fromEntries(SCOPES.map((s) => [s.id, s.label]))

/* ── what a right lets a flow do ───────────────────────────────────────────────────────────── */

type Grant = { readonly area: string; readonly level: 1 | 2 | 3; readonly special?: string }

/**
 * What each of a flow's rights lets its service account do, in the permission catalogue's terms (one vocabulary with
 * the API keys): an area at a level, and for money and disputes the special that guards them. Whoever hands a flow a
 * right must hold its grants themselves.
 */
export const SCOPE_GRANTS: Readonly<Record<string, ReadonlyArray<Grant>>> = {
  "orders.read": [{ area: "orders", level: 1 }],
  "orders.write": [{ area: "orders", level: 2 }],
  "customers.read": [{ area: "customers", level: 1 }],
  "customers.write": [{ area: "customers", level: 2 }],
  "customers.email": [{ area: "customers", level: 1 }, { area: "support", level: 2 }],
  "tickets.write": [{ area: "support", level: 2 }],
  "team.notify": [{ area: "team", level: 1 }],
  "suppliers.message": [{ area: "suppliers", level: 2 }],
  "refunds.write": [{ area: "orders", level: 2, special: "refunds.write" }],
  "payments.read": [{ area: "orders", level: 1 }],
  "disputes.write": [{ area: "chargebacks", level: 2, special: "disputes.write" }],
  "stock.read": [{ area: "products", level: 1 }],
  "marketing.write": [{ area: "customers", level: 2 }],
  "accounting.write": [{ area: "data", level: 2 }],
  "files.write": [{ area: "data", level: 2 }],
  "ai.draft": [{ area: "support", level: 1 }]
}

/** The rights a flow holds: what the version needs, less what was switched off, plus what was added. */
export const accountScopes = (
  required: ReadonlyArray<string>,
  settings: { readonly scopesOff: ReadonlyArray<string>; readonly scopesExtra: ReadonlyArray<string> }
): ReadonlyArray<string> => {
  const held = new Set([...required.filter((s) => !settings.scopesOff.includes(s)), ...settings.scopesExtra])
  return SCOPE_IDS.filter((s) => held.has(s))
}
