/*
 * The console's service worker (M11 step 13.5): it only shows push messages. The API sends one per note, encrypted to
 * this browser (`packages/integrations/webpush`); the browser opens it and hands this worker the JSON: a title, the
 * detail, where a click leads (a console path) and a tag that replaces an older message about the same thing. A click
 * focuses a console tab already open, or opens one. Nothing is cached: the console stays a page that is always fresh.
 */

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

const sameOrigin = (url) => {
  try {
    const target = new URL(url, self.location.origin)
    return target.origin === self.location.origin ? target.href : self.location.origin + "/"
  } catch {
    return self.location.origin + "/"
  }
}

self.addEventListener("push", (event) => {
  let message = {}
  try {
    message = event.data ? event.data.json() : {}
  } catch {
    message = { title: event.data ? event.data.text() : "" }
  }
  const title = typeof message.title === "string" && message.title !== "" ? message.title : "Insyte"
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof message.body === "string" ? message.body : "",
      tag: typeof message.tag === "string" ? message.tag : undefined,
      lang: "nl",
      data: { url: sameOrigin(typeof message.url === "string" ? message.url : "/") }
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.location.origin + "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      const tab = tabs.find((t) => new URL(t.url).origin === self.location.origin)
      if (tab) return tab.focus().then((focused) => (focused && "navigate" in focused ? focused.navigate(url) : null))
      return self.clients.openWindow(url)
    })
  )
})
