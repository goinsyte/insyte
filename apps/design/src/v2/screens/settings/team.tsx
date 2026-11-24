import { useState } from "react"
import { INVITE_LINK, LINK_DAYS, member, relative, roleLabel, ROLES, storesLabel } from "../../fixtures/settings.ts"
import type { Invite, Member } from "../../fixtures/settings.ts"
import { STORES } from "../../fixtures/workspace.ts"
import { Link, navigate, paths } from "../../router.tsx"
import { useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Status, Tag } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { AlertDialog, Dialog } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import { FileText, Key, MoreHorizontal, UserPlus, Users } from "../../ui/icons.tsx"
import { Field, SearchField, Select } from "../../ui/input.tsx"
import { List, ListRow } from "../../ui/list.tsx"
import { PageSection } from "../../ui/page.tsx"
import { SettingRow, SettingsSection } from "../../ui/settings.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Toggle } from "../../ui/toggle.tsx"
import { useView } from "../../view.ts"
import { BulkInviteDialog, InviteDialog, RoleReach, useTeam } from "./invite.tsx"
import { CopyValue, SettingsPage, useSaved } from "./parts.tsx"

const NOW = new Date(2026, 10, 23, 14, 30).getTime()
const first = (name: string) => name.split(" ")[0] ?? name
const nameOf = (id: string | undefined) => (id === undefined ? undefined : member(id)?.name)

/** The team's changes that ask first or take back: handing over the workspace and removing someone. */
export function useTeamActions() {
  const team = useTeam()
  const transfer = (m: Member) => {
    const before = team.members
    team.setMembers((all) =>
      all.map((x) =>
        x.id === m.id ? { ...x, roleId: "eigenaar" } : x.id === team.me ? { ...x, roleId: "beheerder" } : x
      )
    )
    toast({
      title: `${m.name} is nu eigenaar`,
      body: "Jij bent nu Beheerder. Na deze melding kan alleen de nieuwe eigenaar dit terugdraaien.",
      tone: "good",
      action: { label: "Ongedaan maken", onClick: () => team.setMembers(before) }
    })
  }
  const remove = (m: Member) => {
    const before = team.members
    team.setMembers((all) => all.filter((x) => x.id !== m.id))
    toast({
      title: `${m.name} verwijderd uit de werkruimte`,
      body: "Wat ze deden blijft op naam staan. De plek is weer vrij.",
      action: { label: "Ongedaan maken", onClick: () => team.setMembers(before) }
    })
  }
  return { transfer, remove }
}

/** The one question before handing over the workspace: the person handing it over loses it. */
export function TransferDialog({ member: m, onClose, onConfirm }: {
  readonly member: Member | null
  readonly onClose: () => void
  readonly onConfirm: (m: Member) => void
}) {
  const name = m === null ? "" : first(m.name)
  return (
    <AlertDialog
      open={m !== null}
      onCancel={onClose}
      onConfirm={() => {
        if (m !== null) onConfirm(m)
        onClose()
      }}
      title={`Werkruimte overdragen aan ${m?.name ?? ""}?`}
      body={`${name} wordt eigenaar en beheert vanaf nu facturatie, het abonnement en het opheffen van de werkruimte. Jij wordt Beheerder en kunt dit daarna niet zelf terugzetten.`}
      confirmLabel={`Overdragen aan ${name}`}
    />
  )
}

/**
 * Team: who works in the workspace, with their role, their stores and who invited them; the
 * invitations still open; and the link that lets someone in with one role. A row opens the person's
 * own page. Invite one or many at once (or from a CSV), hand the workspace over, remove someone with
 * an undo. The current demo's `settings/team`.
 */
export function TeamScreen() {
  const view = useView()
  const { edit } = useAccess("team")
  const team = useTeam()
  const { members, setMembers, invites, setInvites } = team
  const actions = useTeamActions()
  const [link, setLink] = useSaved("team.link", {
    on: view.staat !== "leeg",
    token: INVITE_LINK.token,
    roleId: INVITE_LINK.roleId as string,
    days: String(INVITE_LINK.days)
  })
  const [query, setSearch] = useState("")
  const [inviting, setInviting] = useState(false)
  const [bulk, setBulk] = useState(false)
  const [roleFor, setRoleFor] = useState<Member | null>(null)
  const [transferTo, setTransferTo] = useState<Member | null>(null)

  const full = team.seats.free === 0
  const q = query.trim().toLowerCase()
  const shown = members.filter((m) =>
    q === "" || `${m.name} ${m.email} ${roleLabel(m.roleId)}`.toLowerCase().includes(q)
  )
  const linkUrl = `https://app.goinsyte.com/join/${link.token}`

  const setActive = (m: Member, active: boolean) => {
    const apply = (on: boolean) => setMembers((all) => all.map((x) => (x.id === m.id ? { ...x, deactivated: !on } : x)))
    apply(active)
    toast({
      title: active ? `${m.name} weer actief` : `${m.name} gedeactiveerd`,
      body: active
        ? "Kan weer inloggen met de rol van eerst."
        : "Kan niet meer inloggen. Toegewezen tickets blijven staan.",
      action: { label: "Ongedaan maken", onClick: () => apply(!active) }
    })
  }
  const resend = (inv: Invite) => {
    setInvites((all) =>
      all.map((x) => (x.id === inv.id ? { ...x, sent: new Date(NOW), expires: new Date(NOW + 7 * 86_400_000) } : x))
    )
    toast({
      title: `Opnieuw verstuurd naar ${inv.email}`,
      body: "De nieuwe link is 7 dagen geldig; de oude werkt niet meer.",
      tone: "good"
    })
  }
  const revoke = (inv: Invite) => {
    setInvites((all) => all.filter((x) => x.id !== inv.id))
    toast({
      title: `Uitnodiging aan ${inv.email} ingetrokken`,
      body: "De link werkt niet meer. De plek is weer vrij.",
      action: { label: "Ongedaan maken", onClick: () => setInvites((all) => [...all, inv]) }
    })
  }
  const table = (
    <MemberTable
      rows={shown}
      edit={edit}
      me={team.me}
      meOwner={team.meOwner}
      onRole={setRoleFor}
      onActive={setActive}
      onTransfer={setTransferTo}
      onRemove={actions.remove}
    />
  )

  return (
    <SettingsPage
      title="Team"
      width="record"
      area="team"
      what="het team"
      meta={
        <>
          <span className="figure">{members.length}</span> {members.length === 1 ? "persoon" : "personen"} ·{" "}
          <span className="figure">{team.seats.used}</span> van <span className="figure">{team.seats.total}</span>{" "}
          plekken in gebruik
        </>
      }
      actions={edit
        ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => navigate(paths.settings("rollen"))}>Rollen</Button>
            {full
              ? (
                <Button size="sm" variant="primary" onClick={() => navigate(paths.settings("facturatie"))}>
                  Plek bijkopen
                </Button>
              )
              : (
                <>
                  <Button size="sm" variant="ghost" icon={<FileText />} onClick={() => setBulk(true)}>
                    Uit een CSV
                  </Button>
                  <Button size="sm" variant="primary" icon={<UserPlus />} onClick={() => setInviting(true)}>
                    Collega's uitnodigen
                  </Button>
                </>
              )}
          </>
        )
        : undefined}
    >
      <PageSection
        id="leden"
        title="Teamleden"
        meta={String(members.length)}
        actions={
          <SearchField
            label="Personen zoeken"
            placeholder="Personen zoeken"
            value={query}
            onChange={setSearch}
            className="w-56"
          />
        }
      >
        {members.length === 1 && q === ""
          ? (
            <>
              {table}
              <EmptyState
                size="sm"
                glyph={Users}
                title="Je werkt hier nog alleen."
                action={edit
                  ? <Button icon={<UserPlus />} onClick={() => setInviting(true)}>Collega's uitnodigen</Button>
                  : undefined}
              >
                Nodig je team uit. Ieder krijgt een rol die bepaalt wat hij ziet en mag.
              </EmptyState>
            </>
          )
          : shown.length === 0
          ? <p className="py-6 text-sm text-ink-3">Niemand gevonden voor “{query}”.</p>
          : table}
      </PageSection>

      <PageSection id="uitnodigingen" title="Openstaande uitnodigingen" meta={String(invites.length)}>
        {invites.length === 0
          ? (
            <EmptyState size="sm" glyph={UserPlus} title="Geen uitnodigingen open.">
              Wie je uitnodigt staat hier tot die accepteert, met wanneer de link verloopt. Je kunt hem opnieuw sturen,
              de rol aanpassen of intrekken.
            </EmptyState>
          )
          : (
            <List divided label="Openstaande uitnodigingen">
              {invites.map((inv) => {
                const expired = inv.expires.getTime() < NOW
                const days = Math.round(Math.abs(inv.expires.getTime() - NOW) / 86_400_000)
                return (
                  <ListRow
                    key={inv.id}
                    padded={false}
                    lead={<Avatar name={inv.email} size={28} />}
                    title={inv.email}
                    meta={`${roleLabel(inv.roleId)} · ${storesLabel(inv.stores)} · door ${
                      first(nameOf(inv.invitedBy) ?? "")
                    } · verstuurd ${relative(inv.sent)}`}
                    trail={
                      <>
                        {expired
                          ? <Status tone="warn">Verlopen</Status>
                          : (
                            <span className="hidden text-ink-3 sm:inline">
                              verloopt over {days} {days === 1 ? "dag" : "dagen"}
                            </span>
                          )}
                        {edit && (
                          <>
                            <Button size="sm" onClick={() => resend(inv)}>
                              {expired ? "Opnieuw versturen" : "Herinneren"}
                            </Button>
                            <DropdownMenu
                              label={`Uitnodiging aan ${inv.email}`}
                              placement="bottom-end"
                              trigger={(props) => (
                                <button
                                  {...props}
                                  type="button"
                                  aria-label="Meer"
                                  className="inline-flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
                                >
                                  <MoreHorizontal size={16} />
                                </button>
                              )}
                            >
                              <DropdownItem
                                onSelect={() => {
                                  void navigator.clipboard?.writeText(`https://app.goinsyte.com/join/${inv.id}`).catch(
                                    () => undefined
                                  )
                                  toast({ title: "Link gekopieerd", tone: "good" })
                                }}
                              >
                                Link kopiëren
                              </DropdownItem>
                              <DropdownSeparator />
                              <DropdownItem tone="danger" onSelect={() => revoke(inv)}>Intrekken</DropdownItem>
                            </DropdownMenu>
                          </>
                        )}
                      </>
                    }
                  />
                )
              })}
            </List>
          )}
      </PageSection>

      <SettingsSection
        id="link"
        title="Uitnodigen via link"
        description="Wie de link opent, komt binnen met de rol die je kiest. Handig voor een tijdelijke kracht; zet hem uit als niemand hem meer nodig heeft."
      >
        <SettingRow
          title={link.on ? "Link staat aan" : "Link staat uit"}
          description={link.on
            ? `${INVITE_LINK.joined} persoon kwam via deze link binnen.`
            : "Niemand kan via een link binnenkomen."}
          control={
            <Toggle
              label="Uitnodigen via link"
              on={link.on}
              disabled={!edit}
              onChange={(on) => {
                setLink({ ...link, on })
                toast({ title: on ? "Link staat aan" : "Link staat uit", tone: on ? "good" : "neutral" })
              }}
            />
          }
        />
        {link.on && (
          <>
            <SettingRow
              title="Rol"
              htmlFor="link-role"
              control={
                <Select
                  id="link-role"
                  className="w-48"
                  disabled={!edit}
                  value={link.roleId}
                  onChange={(e) => setLink({ ...link, roleId: e.target.value })}
                >
                  {ROLES.filter((r) => r.id !== "eigenaar").map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </Select>
              }
            />
            <SettingRow
              title="Geldig"
              htmlFor="link-days"
              control={
                <Select
                  id="link-days"
                  className="w-48"
                  disabled={!edit}
                  value={link.days}
                  onChange={(e) => setLink({ ...link, days: e.target.value })}
                >
                  {LINK_DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </Select>
              }
            />
            <SettingRow
              title="Link"
              stack
              control={
                <div className="flex w-full flex-wrap items-center justify-between gap-2 pb-1">
                  <CopyValue value={linkUrl} label="Link" className="min-w-0 flex-1" />
                  {edit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setLink({ ...link, token: Math.random().toString(36).slice(2, 10) })
                        toast({ title: "Nieuwe link gemaakt", body: "De vorige link werkt niet meer.", tone: "good" })
                      }}
                    >
                      Nieuwe link maken
                    </Button>
                  )}
                </div>
              }
            />
          </>
        )}
      </SettingsSection>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} onBulk={() => setBulk(true)} />
      <BulkInviteDialog open={bulk} onClose={() => setBulk(false)} />
      <RoleDialog
        member={roleFor}
        onClose={() => setRoleFor(null)}
        onSave={(m, roleId) => {
          const before = m.roleId
          setMembers((all) => all.map((x) => (x.id === m.id ? { ...x, roleId } : x)))
          setRoleFor(null)
          toast({
            title: `${first(m.name)} is nu ${roleLabel(roleId)}`,
            body: "Geldt meteen, ook in een sessie die al openstaat.",
            tone: "good",
            action: {
              label: "Ongedaan maken",
              onClick: () => setMembers((all) => all.map((x) => (x.id === m.id ? { ...x, roleId: before } : x)))
            }
          })
        }}
      />
      <TransferDialog member={transferTo} onClose={() => setTransferTo(null)} onConfirm={actions.transfer} />
    </SettingsPage>
  )
}

function MemberTable({ rows, edit, me, meOwner, onRole, onActive, onTransfer, onRemove }: {
  readonly rows: ReadonlyArray<Member>
  readonly edit: boolean
  readonly me: string
  readonly meOwner: boolean
  readonly onRole: (m: Member) => void
  readonly onActive: (m: Member, active: boolean) => void
  readonly onTransfer: (m: Member) => void
  readonly onRemove: (m: Member) => void
}) {
  return (
    <Table label="Teamleden" minWidth={760}>
      <THead>
        <Th>Teamlid</Th>
        <Th>Rol</Th>
        <Th>Winkels</Th>
        <Th>Laatst actief</Th>
        <Th>Uitgenodigd door</Th>
        <Th>Status</Th>
        <Th width={44}>
          <span className="sr-only">Acties</span>
        </Th>
      </THead>
      <TBody>
        {rows.map((m) => {
          const busy = m.id.startsWith("busy-")
          const owner = m.roleId === "eigenaar"
          return (
            <Tr key={m.id} onOpen={busy ? undefined : () => navigate(paths.person(m.id))}>
              <Td header>
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={m.name} size={28} presence={m.presence} />
                  <span className="flex min-w-0 flex-col">
                    {busy
                      ? <span className="truncate text-sm text-ink">{m.name}</span>
                      : (
                        <Link to={paths.person(m.id)} className="truncate text-sm text-ink hover:underline">
                          {m.name}
                        </Link>
                      )}
                    <span className="truncate text-xs text-ink-3">{m.email}</span>
                  </span>
                </span>
              </Td>
              <Td>{roleLabel(m.roleId)}</Td>
              <Td>{m.stores === "all" ? "Alle" : `${m.stores.length} van ${STORES.length}`}</Td>
              <Td muted>{m.presence === "online" ? "Nu" : relative(m.lastSeen)}</Td>
              <Td muted>{owner && m.invitedBy === undefined ? "Maakte de werkruimte" : nameOf(m.invitedBy) ?? "—"}</Td>
              <Td>
                {m.deactivated === true
                  ? <Status tone="neutral">Gedeactiveerd</Status>
                  : <Status tone="good">Actief</Status>}
              </Td>
              <Td align="right">
                {owner || m.id === me
                  ? <Tag>{owner ? "Eigenaar" : "Jij"}</Tag>
                  : (
                    <DropdownMenu
                      label={`Acties voor ${m.name}`}
                      placement="bottom-end"
                      trigger={(props) => (
                        <button
                          {...props}
                          type="button"
                          aria-label={`Acties voor ${m.name}`}
                          className="inline-flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      )}
                    >
                      {!busy && <DropdownItem onSelect={() => navigate(paths.person(m.id))}>Openen</DropdownItem>}
                      <DropdownItem disabled={!edit} onSelect={() => onRole(m)}>Rol wijzigen</DropdownItem>
                      {meOwner && m.deactivated !== true && (
                        <DropdownItem
                          glyph={Key}
                          disabled={!edit}
                          onSelect={() => onTransfer(m)}
                        >
                          Eigendom overdragen
                        </DropdownItem>
                      )}
                      <DropdownSeparator />
                      {m.deactivated === true
                        ? (
                          <DropdownItem disabled={!edit} onSelect={() => onActive(m, true)}>
                            Weer activeren
                          </DropdownItem>
                        )
                        : <DropdownItem disabled={!edit} onSelect={() => onActive(m, false)}>Deactiveren</DropdownItem>}
                      <DropdownItem tone="danger" disabled={!edit} onSelect={() => onRemove(m)}>
                        Verwijderen uit werkruimte
                      </DropdownItem>
                    </DropdownMenu>
                  )}
              </Td>
            </Tr>
          )
        })}
      </TBody>
    </Table>
  )
}

export function RoleDialog({ member: m, onClose, onSave }: {
  readonly member: Member | null
  readonly onClose: () => void
  readonly onSave: (m: Member, roleId: string) => void
}) {
  const [roleId, setRoleId] = useState<string | null>(null)
  const current = roleId ?? m?.roleId ?? "alleen-lezen"
  return (
    <Dialog
      open={m !== null}
      onClose={() => {
        setRoleId(null)
        onClose()
      }}
      title={m === null ? "Rol wijzigen" : `Rol van ${m.name}`}
      description="De nieuwe rol geldt meteen, ook in een sessie die al openstaat."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            disabled={m === null || current === m.roleId}
            onClick={() => {
              if (m !== null) onSave(m, current)
              setRoleId(null)
            }}
          >
            Opslaan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Rol" hint={ROLES.find((r) => r.id === current)?.description}>
          {(c) => (
            <Select {...c} value={current} onChange={(e) => setRoleId(e.target.value)}>
              {ROLES.filter((r) => r.id !== "eigenaar").map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          )}
        </Field>
        <RoleReach roleId={current} />
      </div>
    </Dialog>
  )
}
