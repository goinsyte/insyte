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
