import { useState } from "react"
import { ACCOUNT, ALERTS, COUNTRIES, membersFor, RETENTION_CHOICES, STORE_ROWS } from "../../fixtures/settings.ts"
import { paths } from "../../router.tsx"
import { useAccess } from "../../ui/access.tsx"
import { Button } from "../../ui/button.tsx"
import { RadioGroup } from "../../ui/checkbox.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { Building, CreditCard, Database, Download, Trash, Users } from "../../ui/icons.tsx"
import { Field, Input, Select } from "../../ui/input.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { SettingRow, SettingsSection } from "../../ui/settings.tsx"
import { toast } from "../../ui/toast.tsx"
import { useView } from "../../view.ts"
import { SaveBar, SettingsPage, useDraft, useSaved } from "./parts.tsx"

/**
 * Account: the workspace's own facts (its name, the legal entity on invoices, where invoices go),
 * the two thresholds that decide when the team hears of a late order or a large dispute, and what
 * happens to a store's data when it closes. The current demo's `settings/profile`.
 */
export function AccountScreen() {
  const view = useView()
  const { edit } = useAccess("settings")
  const workspace = useDraft("account", { ...ACCOUNT })
  const alerts = useDraft("alerts", {
    delayHours: String(ALERTS.delayHours),
    disputeAmount: String(ALERTS.disputeAmount)
  })
  const [retention, setRetention] = useSaved("retention", 90)
  const [choosing, setChoosing] = useState<number | null>(null)
  const people = membersFor(view.staat).length
  const connected = STORE_ROWS.filter((s) => s.connected).length

  const saveWorkspace = () => {
    workspace.commit()
    toast({ title: "Werkruimte opgeslagen", tone: "good" })
  }
  const hours = Number(alerts.draft.delayHours)
  const amount = Number(alerts.draft.disputeAmount.replace(",", "."))
  const alertsInvalid = !(hours > 0) || !(amount >= 0) || alerts.draft.disputeAmount.trim() === ""
  const saveAlerts = () => {
    if (alertsInvalid) {
      toast({
        title: "Drempels voor meldingen hebben een getal nodig: meer dan 0 uur, een bedrag van 0 of meer",
        tone: "bad"
      })
      return
    }
    alerts.commit()
    toast({ title: "Drempels voor meldingen opgeslagen", tone: "good" })
  }

  return (
    <SettingsPage
      title="Account"
      meta="De gegevens van je werkruimte, en wanneer het team een melding krijgt"
      area="settings"
      what="de accountinstellingen"
    >
      <SettingsSection
        id="werkruimte"
        title="Werkruimte"
        description="Staat op je facturen en in de mails die Insyte namens je verstuurt."
        footer={<SaveBar disabled={!edit} dirty={workspace.dirty} onSave={saveWorkspace} onReset={workspace.reset} />}
      >
        <div className="grid gap-4 py-3 sm:grid-cols-2">
          <Field label="Naam werkruimte">
            {(c) => (
              <Input
                {...c}
                value={workspace.draft.workspace}
                disabled={!edit}
                onChange={(e) => workspace.patch({ workspace: e.target.value })}
              />
            )}
          </Field>
          <Field label="Rechtspersoon">
            {(c) => (
              <Input
                {...c}
                value={workspace.draft.legalEntity}
                disabled={!edit}
                onChange={(e) => workspace.patch({ legalEntity: e.target.value })}
              />
            )}
          </Field>
          <Field label="Btw-nummer">
            {(c) => (
              <Input
                {...c}
                value={workspace.draft.vat}
                disabled={!edit}
                onChange={(e) => workspace.patch({ vat: e.target.value })}
              />
            )}
          </Field>
          <Field label="Factuur-e-mail" hint="Facturen van Insyte gaan hierheen.">
            {(c) => (
              <Input
                {...c}
                type="email"
                value={workspace.draft.billingEmail}
                disabled={!edit}
                onChange={(e) => workspace.patch({ billingEmail: e.target.value })}
              />
            )}
          </Field>
          <Field label="Land">
            {(c) => (
              <Select
                {...c}
                value={workspace.draft.country}
                disabled={!edit}
                onChange={(e) => workspace.patch({ country: e.target.value })}
              >
                {COUNTRIES.map((country) => <option key={country}>{country}</option>)}
              </Select>
            )}
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        id="drempels"
        title="Meldingen"
        description="Wanneer het team hoort dat er iets misgaat. Wie wat hoort, kiest ieder zelf onder Meldingen."
        footer={<SaveBar disabled={!edit} dirty={alerts.dirty} onSave={saveAlerts} onReset={alerts.reset} />}
      >
        <SettingRow
          title="Late bestelling"
          htmlFor="delay-hours"
          description="Een bestelling die na zoveel uur nog niet verzonden is."
          control={
            <Input
              id="delay-hours"
              inputMode="numeric"
              suffix="uur"
              className="w-32"
              disabled={!edit}
              value={alerts.draft.delayHours}
              aria-invalid={!(hours > 0) || undefined}
              onChange={(e) => alerts.patch({ delayHours: e.target.value })}
            />
          }
        />
        <SettingRow
          title="Groot geschil"
          htmlFor="dispute-amount"
          description="Een chargeback vanaf dit bedrag krijgt een eigen melding."
          control={
            <Input
              id="dispute-amount"
              inputMode="decimal"
              prefix="€"
              className="w-32"
              disabled={!edit}
              value={alerts.draft.disputeAmount}
              onChange={(e) => alerts.patch({ disputeAmount: e.target.value })}
            />
          }
        />
      </SettingsSection>

      <SettingsSection id="rond" title="Rond de werkruimte">
        <List label="Rond de werkruimte" className="-mx-2 pb-2">
          <ListRow
            href={paths.settings("team")}
            lead={
              <GlyphTile>
                <Users size={16} />
              </GlyphTile>
            }
            title="Team en rollen"
            meta={`${people} ${people === 1 ? "persoon" : "personen"}`}
          />
          <ListRow
            href={paths.settings("winkels")}
            lead={
              <GlyphTile>
                <Building size={16} />
              </GlyphTile>
            }
            title="Winkels"
            meta={`${connected} van ${STORE_ROWS.length} gekoppeld aan Shopify`}
          />
          <ListRow
            href={paths.settings("facturatie")}
            lead={
              <GlyphTile>
                <CreditCard size={16} />
              </GlyphTile>
            }
            title="Facturatie"
            meta="Abonnement, betaalmethode en facturen"
          />
        </List>
      </SettingsSection>

      <SettingsSection id="je-data" title="Je data">
        <List label="Je data" className="-mx-2 pb-2">
          <ListRow
            href={paths.settings("gegevens")}
            lead={
              <GlyphTile>
                <Download size={16} />
              </GlyphTile>
            }
            title="Je data downloaden"
            meta="Alles in één bestand"
          />
          <ListRow
            onClick={edit ? () => setChoosing(retention) : undefined}
            lead={
              <GlyphTile>
                <Database size={16} />
              </GlyphTile>
            }
            title="Als een winkel sluit"
            meta={`Gegevens blijven ${retention} dagen leesbaar, daarna gaan ze naar het archief`}
            trail={edit ? <span className="text-xs text-ink-3">Wijzigen</span> : undefined}
          />
          <ListRow
            href={`${paths.settings("gegevens")}#verwijderen`}
            lead={
              <GlyphTile>
                <Trash size={16} />
              </GlyphTile>
            }
            title="Werkruimte verwijderen"
            meta="Na 7 dagen wachten, onder Je gegevens"
          />
        </List>
      </SettingsSection>

      <Dialog
        open={choosing !== null}
        onClose={() => setChoosing(null)}
        title="Als een winkel sluit"
        description="Als je een winkel ontkoppelt of sluit, worden nieuwe bestellingen niet meer gesynchroniseerd. De bestellingen, klanten, tickets en geschillen blijven leesbaar, zodat je een late chargeback nog kunt beantwoorden, en gaan daarna naar het archief. Gearchiveerde gegevens kun je op verzoek terugzetten."
        footer={
          <>
            <Button variant="ghost" onClick={() => setChoosing(null)}>Annuleren</Button>
            <Button
              variant="primary"
              onClick={() => {
                const days = choosing ?? retention
                setRetention(days)
                setChoosing(null)
                toast({ title: `Gesloten winkels blijven ${days} dagen leesbaar`, tone: "good" })
              }}
            >
              Opslaan
            </Button>
          </>
        }
      >
        <RadioGroup
          label="Hoe lang leesbaar"
          value={String(choosing ?? retention)}
          onChange={(v) => setChoosing(Number(v))}
          options={RETENTION_CHOICES.map((c) => ({
            value: String(c.days),
            label: `${c.days} dagen`,
            description: c.detail
          }))}
        />
      </Dialog>
    </SettingsPage>
  )
}
