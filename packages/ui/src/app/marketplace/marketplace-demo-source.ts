import { toast } from "sonner"
import { extensions } from "../../data-source"
import { useMarketplaceState } from "../hooks/use-marketplace-state"
import { undoable } from "../lib/undo"
import { useSettings } from "../stores/settings-store"
import type { MarketplaceSource } from "./marketplace-source"

/*
 * The Marketplace over the design app's stores, as it was before the seam (`marketplace-source.ts`): every app
 * installs at once from the seeded catalogue, uninstalls with a toast, takes scopes back with Ongedaan maken, and keeps
 * feedback in the settings store.
 */

const RECOMMENDED = ["ext_klaviyo", "ext_gorgias", "ext_zapier", "ext_loop"]

export function useDemoMarketplace(): MarketplaceSource {
  const state = useMarketplaceState()
  const revoked = useSettings((s) => s.revokedScopes)
  const setRevokedScopes = useSettings((s) => s.setRevokedScopes)
  const addFeedback = useSettings((s) => s.addFeedback)
  return {
    ...state,
    apps: extensions,
    status: "ready",
    recommended: RECOMMENDED,
    soon: () => false,
    install: (ext) => {
      state.install(ext.id)
      toast.success(`${ext.name} geïnstalleerd`)
    },
    uninstall: (ext) => {
      state.uninstall(ext.id)
      toast(`${ext.name} verwijderd`)
    },
    revokedScopes: (id) => revoked[id] ?? [],
    canRescope: () => true,
    setRevokedScopes: (ext, next) => {
      const before = revoked[ext.id] ?? []
      setRevokedScopes(ext.id, [...next])
      const n = next.length
      undoable(
        n === 0 ? `${ext.name} heeft al zijn rechten` : `${ext.name} is ${n} ${n === 1 ? "recht" : "rechten"} kwijt`,
        () => setRevokedScopes(ext.id, before)
      )
    },
    sendFeedback: (input) => {
      addFeedback({ ...input, at: Date.now() })
      return Promise.resolve(true)
    }
  }
}
