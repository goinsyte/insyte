import type { ReactNode } from "react"
import { ChannelConnectDialog } from "../inbox/channel-parts"
import { useWorkspace, type WorkspaceIntegration } from "../stores/workspace-store"
import { type IntegrationsSource, IntegrationsSourceProvider } from "./integrations-source"

/*
 * Koppelingen over the design app's workspace store, as it was before the seam (`integrations-source.tsx`): Koppelen
 * goes through the provider's approval (simulated), a connected service syncs or lets go with Ongedaan maken, and the
 * chat channels open their connect dialog.
 */
export function DemoIntegrationsSource({ children }: { children: ReactNode }) {
  const integrations = useWorkspace((s) => s.integrations)
  const connect = useWorkspace((s) => s.connectIntegration)
  const disconnect = useWorkspace((s) => s.disconnectIntegration)
  const sync = useWorkspace((s) => s.syncIntegration)
  const source: IntegrationsSource = {
    integrations,
    connect,
    sync,
    disconnect,
    // The row as it was before Ontkoppelen: one of the store's own, handed back.
    restore: (item) =>
      useWorkspace.setState((s) => ({
        integrations: s.integrations.map((i) => (i.key === item.key ? item as WorkspaceIntegration : i))
      })),
    ChannelDialog: ChannelConnectDialog
  }
  return <IntegrationsSourceProvider value={source}>{children}</IntegrationsSourceProvider>
}
