import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { NotePrefs } from "@insyte/modules/notifications/domain/Notifications"
import { counted } from "@insyte/ui/app/lib/counted"
import type { PushHere } from "@insyte/ui/app/settings/notifications-source"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { NOTES } from "../data/frame.ts"
import { notifyWrites, pushDevicesAtom } from "../data/notifications.ts"
import { failureOf } from "../frame/refusals.ts"

/*
 * Push in the browser the console is open in (M11 step 13.5): the service worker (`public/sw.js`) registered at the
 * root, the browser subscribed with the environment's VAPID key, and the subscription handed to
 * `Notifications.subscribePush`. Whether this browser is one of the member's is told by the SHA-256 of its endpoint
 * (`PushDevice.endpointHash`): the endpoint itself is never read back. A subscription the server no longer has (the
 * push service said it was gone, or the browser went to a colleague) reads as off; turning push on again hands it back.
 */

const SW = "/sw.js"

const fromB64url = (text: string) => {
  const plain = text.replaceAll("-", "+").replaceAll("_", "/")
  return Uint8Array.from(atob(plain + "=".repeat((4 - (plain.length % 4)) % 4)), (c) => c.charCodeAt(0))
}

const sameBytes = (a: ArrayBuffer | null | undefined, b: Uint8Array) => {
  if (a === null || a === undefined || a.byteLength !== b.length) return false
  const view = new Uint8Array(a)
  return view.every((byte, i) => byte === b[i])
}

const hashOf = async (endpoint: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("")

const supported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window &&
  "Notification" in window && window.isSecureContext

/** "Chrome op macOS": what the member sees the browser as, from its user agent. */
const labelOf = (ua: string) => {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
    ? "Firefox"
    : /OPR\//.test(ua)
    ? "Opera"
    : /Chrome\//.test(ua)
    ? "Chrome"
    : /Safari\//.test(ua)
    ? "Safari"
    : "Browser"
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
    ? "Android"
    : /Mac OS X|Macintosh/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
    ? "Windows"
    : /Linux/.test(ua)
    ? "Linux"
    : null
  return os === null ? browser : `${browser} op ${os}`
}

/** This browser's subscription, if it has one under the environment's key; one under another key is let go. */
const currentSubscription = async (key: Uint8Array) => {
  const registration = await navigator.serviceWorker.getRegistration("/")
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription === null || subscription === undefined) return null
  if (!sameBytes(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe()
    return null
  }
  return subscription
}

type Known = "unknown" | "unsupported" | "blocked" | "off" | { readonly hash: string }

export function useBrowserPush(prefs: NotePrefs): { push: PushHere; testPush: (() => void) | undefined } {
  const devices = Option.getOrUndefined(AsyncResult.value(useAtomValue(pushDevicesAtom)))
  const subscribe = useAtomSet(notifyWrites.subscribePush, { mode: "promiseExit" })
  const unsubscribe = useAtomSet(notifyWrites.unsubscribePush, { mode: "promiseExit" })
  const test = useAtomSet(notifyWrites.testPush, { mode: "promiseExit" })
  const [here, setHere] = useState<Known>("unknown")
  const [busy, setBusy] = useState(false)
  const key = prefs.pushKey

  // What this browser has, once in the browser and again when the environment's key changes.
  useEffect(() => {
    if (key === null) return
    if (!supported()) return setHere("unsupported")
    if (Notification.permission === "denied") return setHere("blocked")
    let live = true
    void currentSubscription(fromB64url(key)).then(async (subscription) => {
      const next: Known = subscription === null ? "off" : { hash: await hashOf(subscription.endpoint) }
      if (live) setHere(next)
    }, () => live && setHere("off"))
    return () => {
      live = false
    }
  }, [key])

  const mine = typeof here === "object" ? devices?.find((d) => d.endpointHash === here.hash) : undefined
  const state: PushHere["state"] = key === null
    ? "unavailable"
    : here === "unsupported" || here === "blocked"
    ? here
    : mine !== undefined
    ? "on"
    : "off"

  const enable = useCallback(async () => {
    if (key === null || busy) return
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        if (permission === "denied") setHere("blocked")
        return void toast.error("Push staat niet aan", {
          description:
            "Je browser vroeg om toestemming en die kwam er niet. Sta meldingen voor Insyte toe en probeer het opnieuw."
        })
      }
      const registration = await navigator.serviceWorker.register(SW, { scope: "/" })
      await navigator.serviceWorker.ready
      const applicationServerKey = fromB64url(key)
      const subscription = await currentSubscription(applicationServerKey) ??
        await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
      const json = subscription.toJSON()
      const exit = await subscribe({
        payload: {
          endpoint: subscription.endpoint,
          keys: { p256dh: json.keys?.["p256dh"] ?? "", auth: json.keys?.["auth"] ?? "" },
          label: labelOf(navigator.userAgent)
        },
        reactivityKeys: [...NOTES]
      })
      if (Exit.isFailure(exit)) {
        const tag = (failureOf(exit) as { _tag?: string })._tag
        return void toast.error("Push staat niet aan", {
          description: tag === "PushUnavailable"
            ? "Push is hier nog niet beschikbaar."
            : "Probeer het zo nog eens."
        })
      }
      setHere({ hash: exit.value.endpointHash })
      toast.success("Push staat aan op dit apparaat", {
        description: "Kies per gebeurtenis of die ook als push komt, en stuur een testmelding."
      })
    } catch {
      toast.error("Push staat niet aan", { description: "Deze browser gaf geen abonnement. Probeer het zo nog eens." })
    } finally {
      setBusy(false)
    }
  }, [key, busy, subscribe])

  const disable = useCallback(async () => {
    if (key === null || busy || mine === undefined) return
    setBusy(true)
    try {
      const exit = await unsubscribe({ payload: { id: mine.id }, reactivityKeys: [...NOTES] })
      if (Exit.isFailure(exit)) {
        return void toast.error("Push staat nog aan", { description: "Probeer het zo nog eens." })
      }
      await (await currentSubscription(fromB64url(key)))?.unsubscribe()
      setHere("off")
      toast.success("Push staat uit op dit apparaat")
    } catch {
      setHere("off")
    } finally {
      setBusy(false)
    }
  }, [key, busy, mine, unsubscribe])

  const testPush = useCallback(async () => {
    const exit = await test({ payload: undefined, reactivityKeys: [...NOTES] })
    if (Exit.isFailure(exit)) {
      const tag = (failureOf(exit) as { _tag?: string })._tag
      return void toast.error(
        tag === "PushNotRegistered" ? "Push staat nog nergens aan" : "Testmelding niet verstuurd",
        {
          description: tag === "PushNotRegistered"
            ? "Zet push eerst aan op dit apparaat."
            : tag === "PushUnavailable"
            ? "Push is hier nog niet beschikbaar."
            : "Probeer het zo nog eens."
        }
      )
    }
    const { sent, removed } = exit.value
    if (sent === 0) {
      return void toast.error("Testmelding niet aangekomen", {
        description: removed > 0
          ? `${counted(removed, "apparaat was", "apparaten waren")} niet meer bereikbaar en ${
            removed === 1 ? "is" : "zijn"
          } verwijderd. Zet push opnieuw aan.`
          : "Probeer het zo nog eens."
      })
    }
    toast.success("Testmelding verstuurd", {
      description: sent === 1
        ? "Hij komt binnen op het apparaat waar je push hebt aangezet."
        : `Hij komt binnen op ${counted(sent, "apparaat", "apparaten")} waar je push hebt aangezet.`
    })
  }, [test])

  return {
    push: {
      state: here === "unknown" && key !== null ? "off" : state,
      devices: devices?.length ?? 0,
      busy: busy || (here === "unknown" && key !== null),
      enable: () => void enable(),
      disable: () => void disable()
    },
    testPush: state === "on" ? () => void testPush() : undefined
  }
}
