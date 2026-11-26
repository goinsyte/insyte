import type { StoreView, SyncStatus } from "@insyte/modules/stores/domain/Stores"
import { AsyncResult } from "effect/reactivity"

/*
 * Where the workspace's first import is, for onboarding's sync step: the stores not read yet, no store to import (or
 * the stores could not be read), still importing, in, or failed (the backfill gave up and the store needs connecting
 * again, `action_required`). An import that is in is in, whatever the store's status says since.
 */

export type FirstImportKind = "loading" | "none" | "importing" | "done" | "failed"

/** The store the import is for: the workspace's one not disconnected. */
export const importedStore = (stores: ReadonlyArray<StoreView>): StoreView | undefined =>
  stores.find((s) => s.status !== "disconnected")

export const firstImportKind = (
  listed: AsyncResult.AsyncResult<ReadonlyArray<StoreView>, unknown>,
  status: SyncStatus | undefined
): FirstImportKind => {
  if (AsyncResult.isFailure(listed)) return "none"
  if (!AsyncResult.isSuccess(listed)) return "loading"
  const store = importedStore(listed.value)
  if (store === undefined) return "none"
  if (status?.lastSyncedAt !== null && status?.lastSyncedAt !== undefined) return "done"
  return (status?.status ?? store.status) === "action_required" ? "failed" : "importing"
}
