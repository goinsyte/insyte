import { Fragment } from "react"
import { AREAS } from "./areas.ts"
import { BrandScreen } from "./brand/brand-screen.tsx"
import { useRoute } from "./router.tsx"
import { AgentScreen } from "./screens/agent.tsx"
import { AgentsScreen } from "./screens/agents.tsx"
import { BoardScreen } from "./screens/board.tsx"
import { ChatScreen } from "./screens/chat.tsx"
import { HomeScreen } from "./screens/home.tsx"
import { KitScreen } from "./screens/kit/kit.tsx"
import { LiveScreen } from "./screens/live.tsx"
import { LogScreen } from "./screens/log.tsx"
import { MoreScreen } from "./screens/more.tsx"
import { NewChatScreen } from "./screens/new-chat.tsx"
import { SoonScreen } from "./screens/soon.tsx"
import { BareLayout } from "./shell/bare.tsx"
import { BootScreen } from "./shell/loading.tsx"
import { PortalShell } from "./shell/portal-shell.tsx"
import { Shell } from "./shell/shell.tsx"
import { VariantsButton } from "./shell/variants.tsx"
import { useView } from "./view.ts"

/**
 * The route table's screens in their frame: the shell, a portal's shell, or none (sign-in and the
 * public pages). Each screen owns its own scrolling. An area's page is keyed by its address, so a new
 * record starts with fresh state, and so does a page whose data state changes (a first visit's
 * skeleton gives way to the page, `shell/loading.tsx`). The Varianten button floats over all three
 * frames; the cold start's boot screen over everything, once.
 */
export function App() {
  return (
    <>
      <Screens />
      <VariantsButton />
      <BootScreen />
    </>
  )
}

function Screens() {
  const { route, pathname } = useRoute()
  const { staat } = useView()
  const at = `${pathname}|${staat}`
  if (route.name === "area") {
    const area = AREAS[route.area]
    const page = <area.Screen key={at} route={route} />
    if (route.layout === "bare") return <BareLayout>{page}</BareLayout>
    if (route.layout === "portal") return <PortalShell area={area} route={route}>{page}</PortalShell>
    return <Shell>{page}</Shell>
  }
  return (
    <Shell>
      <Fragment key={at}>
        {route.name === "home" && <HomeScreen />}
        {route.name === "new-chat" && <NewChatScreen key={route.context ?? ""} context={route.context} />}
        {route.name === "chat" && <ChatScreen key={route.chatId} chatId={route.chatId} />}
        {route.name === "agents" && <AgentsScreen />}
        {route.name === "agent" && <AgentScreen key={route.agentId} agentId={route.agentId} />}
        {route.name === "log" && <LogScreen />}
        {route.name === "board" && <BoardScreen key={route.boardId ?? "week"} boardId={route.boardId ?? "week"} />}
        {route.name === "live" && <LiveScreen />}
        {route.name === "parts" && <KitScreen />}
        {route.name === "brand" && <BrandScreen />}
        {route.name === "more" && <MoreScreen />}
        {route.name === "soon" && <SoonScreen section={route.section} page={route.page} />}
      </Fragment>
    </Shell>
  )
}
