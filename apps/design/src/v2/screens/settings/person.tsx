import { useState } from "react"
import { budgetFor, member, relative, roleLabel, ROLES, storesLabel } from "../../fixtures/settings.ts"
import type { Member } from "../../fixtures/settings.ts"
import { Link, navigate, paths } from "../../router.tsx"
import { useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Status } from "../../ui/badge.tsx"
import type { Tone } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { AlertDialog } from "../../ui/dialog.tsx"
import { ArrowUpRight, Key, MessageSquare, Ticket, Trash, UserX } from "../../ui/icons.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { PageSection } from "../../ui/page.tsx"
import { Meter } from "../../ui/progress.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { toast } from "../../ui/toast.tsx"
import { RoleReach, useTeam } from "./invite.tsx"
import { money, SettingsPage } from "./parts.tsx"
import { RoleDialog, TransferDialog, useTeamActions } from "./team.tsx"

const PRESENCE: Readonly<Record<Member["presence"], { tone: Tone; word: string }>> = {
  online: { tone: "good", word: "Online" },
  away: { tone: "warn", word: "Afwezig" },
  offline: { tone: "neutral", word: "Offline" }
}

/**
 * A teammate's page, `/v2/team/:id`: who they are and what they do now, the tickets on their name,
 * the place they mostly work, and the role that decides what they can, with the way to change it.
 * The werkdraad leads from here to their tickets and their area.
 */
export function PersonScreen({ id }: { readonly id: string }) {
  const team = useTeam()
  const seed = team.members.find((x) => x.id === id)
  const { edit } = useAccess("team")
  const actions = useTeamActions()
  const [changing, setChanging] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const budget = budgetFor("gewoon").people.find((p) => p.id === id)

  if (seed === undefined) {
    return (
      <SettingsPage title="Teamlid" area="team">
        <EmptyState
          title="Deze persoon hoort niet (meer) bij de werkruimte"
          action={<ButtonLink to={paths.settings("team")}>Naar het team</ButtonLink>}
        >
          Misschien is de uitnodiging ingetrokken of is het account verwijderd.
        </EmptyState>
      </SettingsPage>
    )
  }
  const m: Member = seed
  const roleId = m.roleId
  const active = m.deactivated !== true
  const role = ROLES.find((r) => r.id === roleId)
  const owner = roleId === "eigenaar"
  const me = m.id === team.me
  const firstName = m.name.split(" ")[0] ?? m.name
  const presence = PRESENCE[m.presence]
  const patch = (next: Partial<Member>) =>
    team.setMembers((all) => all.map((x) => (x.id === m.id ? { ...x, ...next } : x)))
  const setRoleId = (next: string) => patch({ roleId: next })
  const setActive = (on: boolean) => patch({ deactivated: !on })

  return (
    <SettingsPage
      title={m.name}
      width="record"
      area="team"
      what="dit teamlid"
      readOnlyNote={false}
      meta={
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <Status tone={active ? presence.tone : "neutral"}>{active ? presence.word : "Gedeactiveerd"}</Status>
          <span>· {roleLabel(roleId)} · {m.doing}</span>
        </span>
      }
      actions={
        <>
          <ButtonLink size="sm" to={paths.teamChat} icon={<MessageSquare />}>Bericht sturen</ButtonLink>
          {edit && !owner && !me && <Button size="sm" onClick={() => setChanging(true)}>Rol wijzigen</Button>}
        </>
      }
    >
      <div className="flex items-center gap-4">
        <Avatar name={m.name} size={56} presence={m.presence} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-sm text-ink">{m.email}</p>
          <p className="text-xs text-ink-3">
            Lid sinds {m.joined.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      <PageSection id="werk" title={`Waar ${firstName} aan werkt`}>
        <List label="Werk" className="-mx-2">
          <ListRow
            href={m.focus.href}
            lead={
              <GlyphTile>
                <ArrowUpRight size={16} />
              </GlyphTile>
            }
            title={m.focus.label}
            meta={m.focus.detail}
          />
        </List>
      </PageSection>

      <PageSection id="tickets" title="Open tickets" meta={String(m.tickets.length)}>
        {m.tickets.length === 0
          ? <p className="text-sm text-ink-3">Geen open tickets op naam van {firstName}.</p>
          : (
            <List divided label={`Open tickets van ${firstName}`}>
              {m.tickets.map((t) => (
                <ListRow
                  key={t.id}
                  padded={false}
                  href={paths.ticket(t.id)}
                  lead={
                    <GlyphTile>
                      <Ticket size={16} />
                    </GlyphTile>
                  }
                  title={
                    <>
                      <span className="figure text-ink-3">#{t.id}</span> {t.title}
                    </>
                  }
                  meta={`${t.customer} · ${t.note}`}
                  trail={
                    <Status tone={t.tone}>
                      {t.tone === "bad" ? "Spoed" : t.tone === "warn" ? "Wacht op jou" : "Open"}
                    </Status>
                  }
                />
              ))}
            </List>
          )}
      </PageSection>

      <PageSection
        id="rol"
        title="Rol en toegang"
        actions={
          <ButtonLink size="sm" variant="ghost" to={`${paths.settings("rollen")}?open=${roleId}`}>
            Rol bekijken
          </ButtonLink>
        }
      >
        <KeyValue
          items={[
            { label: "Rol", value: roleLabel(roleId) },
            { label: "Winkels", value: storesLabel(m.stores) },
            {
              label: "Uitgenodigd door",
              value: owner
                ? "Maakte de werkruimte"
                : m.invitedBy === undefined
                ? "—"
                : (
                  <Link to={paths.person(m.invitedBy)} className="hover:underline">
                    {member(m.invitedBy)?.name ?? "—"}
                  </Link>
                )
            },
            { label: "Laatst actief", value: m.presence === "online" ? "Nu" : relative(m.lastSeen) },
            ...(role?.refundLimit === undefined || !role.specials.includes("refunds.write")
              ? []
              : [{
                label: "Terugbetalen tot",
                value: role.refundLimit === null ? "Geen grens" : money(role.refundLimit),
                figure: true
              }])
          ]}
        />
        {owner
          ? <p className="text-sm text-ink-2">De eigenaar kan altijd alles en is niet te wijzigen.</p>
          : <RoleReach roleId={roleId} className="pt-1" />}
      </PageSection>

      {budget !== undefined && (
        <PageSection
          id="budget"
          title="AI-budget deze maand"
          actions={<ButtonLink size="sm" variant="ghost" to={paths.settings("ai/limieten")}>Limieten</ButtonLink>}
        >
          {budget.limit === null
            ? (
              <p className="text-sm text-ink-2">
                <span className="figure">{money(budget.used, true)}</span> gebruikt, zonder eigen limiet.
              </p>
            )
            : (
              <Meter
                label={`${firstName} gebruikte`}
                value={budget.used}
                max={budget.limit}
                format={(n) => money(n, n % 1 !== 0)}
                className="max-w-md"
              />
            )}
        </PageSection>
      )}

      {edit && !owner && !me && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {active
            ? (
              <Button variant="ghost" icon={<UserX />} onClick={() => setConfirm(true)}>
                {firstName} deactiveren
              </Button>
            )
            : (
              <Button
                onClick={() => {
                  setActive(true)
                  toast({ title: `${m.name} weer actief`, tone: "good" })
                }}
              >
                Weer activeren
              </Button>
            )}
          <Button
            variant="ghost"
            icon={<Trash />}
            onClick={() => {
              actions.remove(m)
              navigate(paths.settings("team"))
            }}
          >
            Verwijderen uit werkruimte
          </Button>
          {team.meOwner && active && (
            <Button
              variant="ghost"
              icon={<Key />}
              className="sm:ml-auto"
              onClick={() => setTransferring(true)}
            >
              Eigendom overdragen
            </Button>
          )}
        </div>
      )}
      {edit && owner && (
        <p className="pt-2 text-sm text-ink-3">
          De eigenaar kan niet worden verwijderd. Draag de werkruimte eerst over aan iemand anders.
        </p>
      )}

      <RoleDialog
        member={changing ? m : null}
        onClose={() => setChanging(false)}
        onSave={(_, next) => {
          const before = roleId
          setRoleId(next)
          setChanging(false)
          toast({
            title: `${firstName} is nu ${roleLabel(next)}`,
            body: "Geldt meteen, ook in een sessie die al openstaat.",
            tone: "good",
            action: { label: "Ongedaan maken", onClick: () => setRoleId(before) }
          })
        }}
      />
      <TransferDialog
        member={transferring ? m : null}
        onClose={() => setTransferring(false)}
        onConfirm={actions.transfer}
      />
      <AlertDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setActive(false)
          setConfirm(false)
          toast({
            title: `${m.name} gedeactiveerd`,
            body: "Kan niet meer inloggen. Toegewezen tickets blijven staan.",
            action: { label: "Ongedaan maken", onClick: () => setActive(true) }
          })
        }}
        title={`${m.name} deactiveren?`}
        body={`${firstName} kan niet meer inloggen en krijgt geen meldingen. Tickets op ${firstName}s naam blijven staan tot je ze aan een ander geeft. De plek komt vrij.`}
        confirmLabel="Deactiveren"
      />
    </SettingsPage>
  )
}
