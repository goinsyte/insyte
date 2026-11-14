import { DurableObject, env } from "cloudflare:workers"

/*
 * One room per audience (M5.1, ADR-0013): `ws:<workspace>` for members now; `sup:` and `aff:` with the partner portals
 * (M16). It holds sockets only, with the hibernation API, so an idle tab costs nothing; it never reads the database.
 * Presence is its open sockets, by member. It sends what it is given (`broadcast`) and, as people come and go,
 * `presence`. Push-only: a client's messages are pings, answered by the runtime without waking the room.
 *
 * Plain Durable Object RPC, no Effect: the class is constructed by the runtime, and its methods are a few socket
 * calls. The Worker reaches it through `/api/realtime` (a socket) and the relay's realtime sink (`broadcast`).
 */

/** What a socket carries through hibernation (≤ 16 KB). */
interface Attachment {
  readonly memberId: string
  readonly joinedAt: number
  /** The tab's own id, which `Live.subscribe` names (M14 step 3); absent on a socket that named none. */
  readonly tab?: string
}

/** A workspace's room: where its members' tabs are, and where its frames go. */
export const roomOf = (workspaceId: string) => env.ROOMS.getByName(`ws:${workspaceId}`)

/** A supplier's room in one workspace (M16): its contacts' portal tabs, where its own frames go and nothing else. */
export const supplierRoomOf = (workspaceId: string, supplierId: string) =>
  env.ROOMS.getByName(`sup:${workspaceId}:${supplierId}`)

/** The headers the API Worker sets on the upgrade it forwards; nothing else can reach the room. */
export const ROOM_MEMBER = "x-insyte-room-member"
export const ROOM_TAB = "x-insyte-room-tab"

export class RoomDurableObject extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, bindings: Cloudflare.Env) {
    super(ctx, bindings)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"))
  }

  override fetch(request: Request): Response {
    const memberId = request.headers.get(ROOM_MEMBER)
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket" || memberId === null) {
      return new Response(null, { status: 400 })
    }
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    const wasHere = this.present().some((p) => p.memberId === memberId)
    this.ctx.acceptWebSocket(server)
    const tab = request.headers.get(ROOM_TAB)
    server.serializeAttachment(
      { memberId, joinedAt: Date.now(), ...(tab === null ? {} : { tab }) } satisfies Attachment
    )
    server.send(JSON.stringify({ v: 1, type: "hello", presence: this.present() }))
    if (!wasHere) this.send({ v: 1, type: "presence", presence: this.present() }, server)
    return new Response(null, { status: 101, webSocket: client })
  }

  /** Sends a frame to every socket in the room. */
  broadcast(frame: unknown): void {
    this.send(frame)
  }

  /** Sends a frame to one member's sockets only: their notifications, their count. */
  sendTo(memberId: string, frame: unknown): void {
    const text = JSON.stringify(frame)
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as Attachment).memberId !== memberId) continue
      try {
        ws.send(text)
      } catch {
        // Closing as we send: nothing to tell it.
      }
    }
  }

  /**
   * Sends a frame to the named tabs only, each still its member's: the live room's `live.visitors`, to the tabs that
   * hold a lease (M14 step 3).
   */
  sendToTabs(tabs: ReadonlyArray<{ readonly tab: string; readonly memberId: string }>, frame: unknown): void {
    const wanted = new Map(tabs.map((t) => [t.tab, t.memberId]))
    const text = JSON.stringify(frame)
    for (const ws of this.ctx.getWebSockets()) {
      const { tab, memberId } = ws.deserializeAttachment() as Attachment
      if (tab === undefined || wanted.get(tab) !== memberId) continue
      try {
        ws.send(text)
      } catch {
        // Closing as we send: nothing to tell it.
      }
    }
  }

  /** Closes one member's sockets: a supplier contact whose access was revoked (M16). The others hear them leave. */
  closeMember(memberId: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as Attachment).memberId !== memberId) continue
      this.leave(ws)
      try {
        ws.close(4403, "revoked")
      } catch {
        // Already closing.
      }
    }
  }

  /** Who is here, for a test or a server-side read. */
  presence(): ReadonlyArray<{ readonly memberId: string; readonly since: number }> {
    return this.present()
  }

  override webSocketMessage(): void {
    // Push-only (ADR-0013): anything but the runtime's ping is dropped.
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    this.leave(ws)
    ws.close(code, reason)
  }

  override webSocketError(ws: WebSocket): void {
    this.leave(ws)
  }

  private leave(ws: WebSocket) {
    const { memberId } = ws.deserializeAttachment() as Attachment
    const stillHere = this.ctx.getWebSockets().some((other) =>
      other !== ws && (other.deserializeAttachment() as Attachment).memberId === memberId
    )
    if (!stillHere) this.send({ v: 1, type: "presence", presence: this.present(ws) })
  }

  /** One entry per member with an open socket, since their earliest. */
  private present(without?: WebSocket) {
    const since = new Map<string, number>()
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === without) continue
      const { memberId, joinedAt } = ws.deserializeAttachment() as Attachment
      since.set(memberId, Math.min(since.get(memberId) ?? joinedAt, joinedAt))
    }
    return [...since].map(([memberId, joinedAt]) => ({ memberId, since: joinedAt }))
  }

  private send(frame: unknown, except?: WebSocket) {
    const text = JSON.stringify(frame)
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue
      try {
        ws.send(text)
      } catch {
        // A socket closing as we send: its close handler tells the others.
      }
    }
  }
}
