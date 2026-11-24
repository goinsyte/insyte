import { ASSISTANT } from "../assistant.ts"
import { formatValue } from "../charts/format.ts"
import { AGENTS, hoursSaved } from "../fixtures/agents.ts"
import { Link, navigate, paths } from "../router.tsx"
import { AgentAvatar } from "../ui/avatar.tsx"
import { Tag } from "../ui/badge.tsx"
import { Button } from "../ui/button.tsx"
import { Plus } from "../ui/icons.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../ui/table.tsx"

/**
 * The workspace's agents as a list, not a card grid: what each does, where it works, how much it did
 * today and in total, and whether it is on. A row opens the agent.
 */
export function AgentsScreen() {
  const runsToday = AGENTS.reduce((sum, agent) => sum + agent.runsToday, 0)
  const hours = AGENTS.reduce((sum, agent) => sum + hoursSaved(agent), 0)
  return (
    <div className="pane-scroll flex-1">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-ink">Mijn agents</h1>
            <p className="text-sm text-ink-2">
              <span className="figure">{AGENTS.filter((a) => a.active).length}</span> van de{" "}
              <span className="figure">{AGENTS.length}</span> aan het werk. Vandaag{" "}
              <span className="figure">{formatValue(runsToday, "count")}</span> uitvoeringen; samen naar schatting{" "}
              <span className="figure">± {formatValue(hours, "count")} u</span> bespaard sinds de start.
            </p>
          </div>
          <Button variant="primary" icon={<Plus />} onClick={() => navigate(paths.newChat("Nieuwe agent"))}>
            Nieuwe agent
          </Button>
        </header>

        <Table label="Agents">
          <THead>
            <Th>Agent</Th>
            <Th>Werkt in</Th>
            <Th align="right">Vandaag</Th>
            <Th align="right">Totaal</Th>
            <Th align="right">Bespaard (±)</Th>
            <Th className="pl-6">Laatst</Th>
          </THead>
          <TBody>
            {AGENTS.map((agent) => (
              <Tr key={agent.id} onOpen={() => navigate(paths.agent(agent.id))} className="group">
                <Td header className="py-2.5">
                  <Link to={paths.agent(agent.id)} className="flex items-center gap-3">
                    <AgentAvatar glyph={agent.glyph} size={32} active={agent.active} />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium text-ink group-hover:underline">{agent.name}</span>
                      <span className="truncate text-xs text-ink-3">{agent.purpose}</span>
                    </span>
                  </Link>
                </Td>
                <Td>{agent.works}</Td>
                <Td figure>{agent.runsToday}</Td>
                <Td figure>{formatValue(agent.runs, "count")}</Td>
                <Td figure>± {hoursSaved(agent)} u</Td>
                <Td className="pl-6">{agent.active ? agent.lastWorked : <Tag>Gepauzeerd</Tag>}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <p className="text-xs text-ink-3">
          Bespaard is een schatting: uitvoeringen × de minuten die een collega gemiddeld aan dezelfde taak kwijt is.
          Elke agent werkt binnen de regels op zijn eigen pagina; {ASSISTANT} maakt een nieuwe agent met je in een chat.
        </p>
      </div>
    </div>
  )
}
