import { useState } from "react"
import { sheetCounts } from "../../fixtures/sheets.ts"
import type { Sheet } from "../../fixtures/sheets.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { RadioGroup } from "../../ui/checkbox.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import { Archive, Folder, MoreHorizontal, Pin, Plus, Sheet as SheetGlyph, Undo, Users } from "../../ui/icons.tsx"
import { Field, Input, SearchField, Select } from "../../ui/input.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { createFolder, createSheet, patchSheet, useFolders, useSheets } from "./store.ts"
import type { Start } from "./store.ts"

type View = "alle" | "vastgezet" | "gedeeld" | "archief"

/**
 * Sheets: the operator's own calculations on Insyte's figures, by view (`?view=`) and folder
 * (`?folder=`). Rebuilt from `/app/sheets` (`sheets-screen.tsx`). A new sheet starts empty or from the
 * profit template, whose cells read `INSYTE()` so it is right on day one.
 */
export function SheetsList() {
  const access = useAccess("analytics")
  const state = dataState(useView())
  const sheets = useSheets()
  const folders = useFolders()
  const view = (useQuery("view") ?? "alle") as View
  const folder = useQuery("folder")
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const [folderDialog, setFolderDialog] = useState(false)
  const counts = sheetCounts(sheets)

  if (!access.view) {
    return (
      <Page width="text">
        <PageHead title="Sheets" />
        <Denied area="analytics" what="de sheets" />
      </Page>
    )
  }

  const q = search.trim().toLowerCase()
  const shown = sheets
    .filter((s) => (view === "archief" ? s.archived : !s.archived))
    .filter((s) => view !== "vastgezet" || s.pinned)
    .filter((s) => view !== "gedeeld" || (s.owner !== "elena" && s.shared.includes("elena")))
    .filter((s) => folder === null || (folder === "geen" ? s.folderId === null : s.folderId === folder))
    .filter((s) => q === "" || s.title.toLowerCase().includes(q))
    .toSorted((a, b) => Number(b.pinned) - Number(a.pinned) || a.opened - b.opened)

  return (
    <Page>
      <PageHead
        title="Sheets"
        meta={state === "ready" && sheets.length > 0
          ? `${counts.all} ${counts.all === 1 ? "blad" : "bladen"} · ${folders.length} ${
            folders.length === 1 ? "map" : "mappen"
          } · rekenen op de cijfers van Kosten en Analyse`
          : undefined}
        actions={access.edit && state === "ready" && (
          <>
            <Button icon={<Folder />} onClick={() => setFolderDialog(true)}>Nieuwe map</Button>
            <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>Nieuw blad</Button>
          </>
        )}
      />
      {!access.edit && state === "ready" && <ReadOnlyNotice area="analytics" />}
      {state === "loading"
        ? (
          <div aria-busy="true" aria-label="Sheets laden" className="flex flex-col gap-4">
            <Skeleton className="h-9 w-96 max-w-full" />
            {Array.from(
              { length: 5 },
              (_, i) => (
                <div key={i} className="flex h-12 items-center gap-6 border-b border-line">
                  <Skeleton className="h-3 flex-1" style={{ maxWidth: `${30 + i * 8}%` }} />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              )
            )}
          </div>
        )
        : state === "error"
        ? (
          <ErrorState
            title="De sheets kwamen niet binnen"
            detail="GET /v1/sheets · 503 · verzoek 4be2d1"
            action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
          >
            Je bladen zijn niet weg; dit scherm kon ze alleen niet ophalen.
          </ErrorState>
        )
        : sheets.length === 0
        ? (
          <EmptyState
            glyph={SheetGlyph}
            title="Nog geen sheets"
            action={access.edit && (
              <>
                <Button variant="primary" onClick={() => setCreating(true)}>Winst per dag maken</Button>
                <Button onClick={() => navigate(paths.costs)}>Eerst je kosten invullen</Button>
              </>
            )}
          >
            Reken op je eigen cijfers zonder ze over te typen. Een cel leest omzet, advertenties of nettowinst uit
            Insyte en blijft bij, net als in Analyse.
          </EmptyState>
        )
        : (
          <div className="flex flex-col gap-4">
            <Tabs
              label="Weergave"
              value={view}
              onChange={(next) => setQuery({ view: next === "alle" ? null : next })}
              tabs={[
                { value: "alle", label: "Alle", count: counts.all },
                { value: "vastgezet", label: "Vastgezet", count: counts.pinned },
                { value: "gedeeld", label: "Gedeeld met mij", count: counts.shared },
                { value: "archief", label: "Archief", count: counts.archived }
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <SearchField
                value={search}
                onChange={setSearch}
                label="Sheets zoeken"
                placeholder="Zoek op naam"
                className="w-full sm:w-72"
              />
              <Select
                aria-label="Map"
                value={folder ?? ""}
                onChange={(event) => setQuery({ folder: event.target.value === "" ? null : event.target.value })}
                className="w-full sm:w-48"
              >
                <option value="">Alle mappen</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name} ({counts.folder(f.id)})</option>)}
                <option value="geen">Zonder map</option>
              </Select>
            </div>
            {shown.length === 0
              ? (
                <EmptyState
                  size="sm"
                  glyph={SheetGlyph}
                  title={q !== ""
                    ? "Geen sheets met die naam"
                    : view === "archief"
                    ? "Het archief is leeg"
                    : view === "gedeeld"
                    ? "Niemand heeft nog een blad met je gedeeld"
                    : "Hier staat nog niets"}
                  action={(q !== "" || folder !== null) && (
                    <Button
                      onClick={() => {
                        setSearch("")
                        setQuery({ folder: null })
                      }}
                    >
                      Filters wissen
                    </Button>
                  )}
                >
                  {view === "archief" ? "Gearchiveerde bladen blijven hier staan tot je ze terugzet." : undefined}
                </EmptyState>
              )
              : <SheetTable sheets={shown} canEdit={access.edit} />}
          </div>
        )}
      <NewSheet open={creating} onClose={() => setCreating(false)} />
      <NewFolder open={folderDialog} onClose={() => setFolderDialog(false)} />
    </Page>
  )
}

function SheetTable({ sheets, canEdit }: { readonly sheets: ReadonlyArray<Sheet>; readonly canEdit: boolean }) {
  const folders = useFolders()
  return (
    <Table label="Sheets" minWidth={720}>
      <THead>
        <Th>Naam</Th>
        <Th>Map</Th>
        <Th>Eigenaar</Th>
        <Th>Gewijzigd</Th>
        <Th className="w-10">
          <span className="sr-only">Acties</span>
        </Th>
      </THead>
      <TBody>
        {sheets.map((s) => {
          const owner = PEOPLE[s.owner]
          return (
            <Tr key={s.id} onOpen={() => navigate(paths.sheet(s.id))}>
              <Td header>
                <Link to={paths.sheet(s.id)} className="flex min-h-11 items-center gap-2.5 hover:underline">
                  <SheetGlyph size={15} className="shrink-0 text-ink-3" />
                  <span className="max-w-[30rem] truncate font-medium text-ink">{s.title}</span>
                  {s.pinned && <Pin size={13} className="shrink-0 text-ink-3" aria-label="Vastgezet" />}
                  {s.shared.length > 0 && <Users size={13} className="shrink-0 text-ink-3" aria-label="Gedeeld" />}
                </Link>
              </Td>
              <Td muted>{folders.find((f) => f.id === s.folderId)?.name ?? "—"}</Td>
              <Td>
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <Avatar name={owner.name} size={20} />
                  {owner.name}
                </span>
              </Td>
              <Td muted className="whitespace-nowrap">{s.updated}</Td>
              <Td align="right">
                {canEdit && (
                  <DropdownMenu
                    label={`Acties voor ${s.title}`}
                    placement="bottom-end"
                    trigger={(props) => (
                      <IconButton
                        label={`Acties voor ${s.title}`}
                        size="sm"
                        className="pointer-coarse:size-11"
                        {...props}
                      >
                        <MoreHorizontal />
                      </IconButton>
                    )}
                  >
                    {(close) => (
                      <>
                        <DropdownItem
                          glyph={Pin}
                          onSelect={() => {
                            patchSheet(s.id, { pinned: !s.pinned })
                            toast({ title: s.pinned ? "Losgemaakt" : "Vastgezet" })
                            close()
                          }}
                        >
                          {s.pinned ? "Losmaken" : "Vastzetten"}
                        </DropdownItem>
                        <DropdownSeparator />
                        <DropdownLabel>Naar map</DropdownLabel>
                        {folders.map((f) => (
                          <DropdownItem
                            key={f.id}
                            glyph={Folder}
                            checked={s.folderId === f.id}
                            onSelect={() => {
                              const before = s.folderId
                              patchSheet(s.id, { folderId: f.id })
                              toast({
                                title: `Verplaatst naar ${f.name}`,
                                action: {
                                  label: "Ongedaan maken",
                                  onClick: () => patchSheet(s.id, { folderId: before })
                                }
                              })
                              close()
                            }}
                          >
                            {f.name}
                          </DropdownItem>
                        ))}
                        <DropdownSeparator />
                        <DropdownItem
                          glyph={s.archived ? Undo : Archive}
                          onSelect={() => {
                            patchSheet(s.id, { archived: !s.archived })
                            toast({
                              title: s.archived ? "Teruggezet" : "Gearchiveerd",
                              action: {
                                label: "Ongedaan maken",
                                onClick: () => patchSheet(s.id, { archived: s.archived })
                              }
                            })
                            close()
                          }}
                        >
                          {s.archived ? "Terugzetten" : "Archiveren"}
                        </DropdownItem>
                      </>
                    )}
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

function NewSheet({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const folders = useFolders()
  const [start, setStart] = useState<Start>("winst")
  const [title, setTitle] = useState("")
  const [folder, setFolder] = useState("")
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nieuw blad"
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            onClick={() => {
              const id = createSheet(
                title.trim() || (start === "winst" ? "Winst per dag" : "Naamloos blad"),
                folder === "" ? null : folder,
                start
              )
              onClose()
              navigate(paths.sheet(id))
            }}
          >
            Blad maken
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <RadioGroup
          label="Beginnen met"
          value={start}
          onChange={setStart}
          options={[
            {
              value: "winst",
              label: "Winst per dag",
              description: "Omzet, inkoop, advertenties en nettowinst per dag van de week, uit Insyte."
            },
            { value: "leeg", label: "Leeg blad", description: "Typ zelf, of lees een cijfer met INSYTE()." }
          ]}
        />
        <Field label="Naam">
          {(control) => (
            <Input
              {...control}
              value={title}
              placeholder={start === "winst" ? "Winst per dag" : "Naamloos blad"}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </Field>
        <Field label="Map" optional>
          {(control) => (
            <Select {...control} value={folder} onChange={(event) => setFolder(event.target.value)}>
              <option value="">Geen map</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  )
}

function NewFolder({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const [name, setName] = useState("")
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nieuwe map"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            disabled={name.trim() === ""}
            onClick={() => {
              const id = createFolder(name.trim())
              setName("")
              onClose()
              setQuery({ folder: id })
              toast({ title: `Map ‘${name.trim()}’ gemaakt` })
            }}
          >
            Map maken
          </Button>
        </>
      }
    >
      <Field label="Naam">
        {(control) => (
          <Input
            {...control}
            value={name}
            placeholder="Bijvoorbeeld: Financiën"
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
    </Dialog>
  )
}
