import { newcomerBlind, tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * The website chat (M15 step 8; widgets/04 §B; `shared/domain/ChatChannel.ts`). Additive only.
 *
 * - `channels`: a chat channel of one store, the website chat only for now (one per store): connected or not, the
 *   welcome text (≤ 200) and colour the widget shows, and the storefront origins its requests may come from (the shop's
 *   myshopify domain and its primary domain, read from Shopify at connect). Disconnected keeps the row and its threads.
 * - `channel_threads`: one shopper's conversation, in its store. The visitor is known only by the hash of the widget
 *   session's id (`visitor_hash`, the server's HMAC); the signed token the widget holds names that session, so a shopper
 *   only ever reads their own thread. The inbox's own fields, under the names `email_threads` has, so the inbox's folders,
 *   counts and commands work on both: `participants` is the shopper as the inbox shows them (a bound customer's name,
 *   else "Websitebezoeker"). `taken_over_by` is the member who took the thread over ("Overnemen"): the agent is silent
 *   while they hold it. `agent_spoke_at` is the agent's last message, for the inbox's mark. `closed_at`: the session ended
 *   or the store's chat went; nothing more is sent on it.
 * - `channel_messages`: what was said, by whom (`shopper`, `team`, `agent`, `system`), plain text of at most 1000
 *   characters. A reply by the team or the agent becomes visible to the shopper at `visible_at`, once its undo window has
 *   passed; Undo takes it away before then, so it never reached them.
 * - `handovers`: the agent passing a thread to a person (`ChatChannel.handOver`): why and when, who picked it up
 *   ("Overnemen") and who handed it back ("Teruggeven aan Insyte"). At most one open per thread.
 * - `inbox_threads_v`: the inbox's one list over mail and chat (security invoker, so each table's policies hold), with
 *   the store a chat is in (mail is everyone's who may open the inbox), its channel, the agent's state on it and the
 *   number of the bound customer's latest order in that store, for the order chip.
 * - `webchat_route(shop | store)`: the widget's read before it knows the workspace, for a connected store whose chat is
 *   on: the ids, the greeting, the colour and the origins (the channel's, the Live pixel's where it has them, and the
 *   myshopify domain). Ids and settings only.
 * - `purge_anonymous_chats(days)`: the nightly removal of chats with no customer and no ticket whose last message is
 *   older than `days` (the default retention for anonymous visitors), across workspaces, as the owner.
 *
 * Shoppers' words are personal data: the shopper's export and erasure reach them by the bound customer, and Shopify's
 * `customers/redact` with them; a workspace's deletion takes them with it (cascade). Every table is members-only and
 * refuses the newcomer.
 */

export default statements(
  `create table channels (
     id              text primary key,
     workspace_id    text not null references workspaces(id) on delete cascade,
     store_id        text not null references stores(id) on delete cascade,
     kind            text not null default 'webchat' check (kind = 'webchat'),
     status          text not null default 'connected' check (status in ('connected', 'disconnected')),
     greeting        text not null default '' check (char_length(greeting) <= 200),
     color           text check (color ~ '^#[0-9a-f]{6}$'),
     origins         text[] not null default '{}',
     -- Whether Shopify holds this stage's API in the app's metafield insyte.api_origin, which the theme's embed
     -- loads the widget from: false until a connect wrote it, and again once a write failed.
     theme_pointed   boolean not null default false,
     created_by      text not null,
     created_at      timestamptz not null default now(),
     updated_at      timestamptz not null default now(),
     connected_at    timestamptz not null default now(),
     disconnected_at timestamptz
   )`,
  "create unique index channels_store_kind on channels (store_id, kind)",
  "create index channels_workspace on channels (workspace_id, created_at)",
  "create trigger channels_touch before update on channels for each row execute function touch_updated_at()",
  tenantTable("channels", { membersOnly: true }),
  newcomerBlind("channels"),
  //
  `create table channel_threads (
     id                   text primary key,
     workspace_id         text not null references workspaces(id) on delete cascade,
     store_id             text not null references stores(id) on delete cascade,
     channel_id           text not null references channels(id) on delete cascade,
     kind                 text not null default 'webchat' check (kind = 'webchat'),
     visitor_hash         text not null,
     subject              text not null default '' check (char_length(subject) <= 200),
     participants         jsonb not null default '[]',
     last_message_at      timestamptz not null default now(),
     last_message_preview text not null default '',
     last_inbound_at      timestamptz,
     unread               boolean not null default true,
     starred              boolean not null default false,
     labels               text[] not null default '{}',
     assignee_id          text references members(id) on delete set null,
     ticket_id            text references tickets(id) on delete set null,
     customer_id          text references customers(id) on delete set null,
     has_inbound          boolean not null default false,
     archived_at          timestamptz,
     snoozed_until        timestamptz,
     spam_at              timestamptz,
     deleted_at           timestamptz,
     closed_at            timestamptz,
     -- How it ended: 'shopper' ends the widget session with it ("Gesprek beëindigen"); 'idle' after a day unanswered.
     closed_by            text check (closed_by in ('shopper', 'idle')),
     taken_over_by        text references members(id) on delete set null,
     taken_over_at        timestamptz,
     handed_back_at       timestamptz,
     agent_spoke_at       timestamptz,
     created_at           timestamptz not null default now(),
     updated_at           timestamptz not null default now()
   )`,
  "create index channel_threads_inbox on channel_threads (workspace_id, last_message_at desc)",
  "create index channel_threads_store on channel_threads (store_id, last_message_at desc)",
  // One open conversation per widget session.
  `create unique index channel_threads_visitor on channel_threads (store_id, visitor_hash)
     where closed_at is null and deleted_at is null`,
  // The widget's every request finds its session's conversation by these (`widget.ts`), newest first; led by the
  // workspace, which the row policy adds to every query, so the planner takes this over the inbox's index.
  "create index channel_threads_session on channel_threads (workspace_id, store_id, visitor_hash, created_at desc)",
  "create index channel_threads_customer on channel_threads (customer_id) where customer_id is not null",
  "create index channel_threads_anonymous on channel_threads (last_message_at) where customer_id is null",
  "create trigger channel_threads_touch before update on channel_threads for each row execute function touch_updated_at()",
  tenantTable("channel_threads", { membersOnly: true }),
  newcomerBlind("channel_threads"),
  //
  `create table channel_messages (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     thread_id    text not null references channel_threads(id) on delete cascade,
     author       text not null check (author in ('shopper', 'team', 'agent', 'system')),
     sent_by      text,
     body         text not null check (char_length(body) between 1 and 1000),
     visible_at   timestamptz not null default now(),
     created_at   timestamptz not null default clock_timestamp()
   )`,
  "create index channel_messages_thread on channel_messages (thread_id, created_at, id)",
  tenantTable("channel_messages", { membersOnly: true }),
  newcomerBlind("channel_messages"),
  //
  `create table handovers (
     id             text primary key,
     workspace_id   text not null references workspaces(id) on delete cascade,
     thread_id      text not null references channel_threads(id) on delete cascade,
     reason         text not null check (char_length(reason) between 1 and 500),
     by_kind        text not null,
     by_id          text not null,
     at             timestamptz not null default now(),
     picked_up_at   timestamptz,
     picked_up_by   text,
     handed_back_at timestamptz,
     handed_back_by text
   )`,
  "create unique index handovers_open on handovers (thread_id) where handed_back_at is null",
  "create index handovers_thread on handovers (thread_id, at desc)",
  tenantTable("handovers", { membersOnly: true }),
  newcomerBlind("handovers"),
  //
  `create view inbox_threads_v with (security_invoker = true) as
     select t.id, t.workspace_id, t.mailbox_id, null::text as store_id, null::text as channel, t.subject,
            t.participants, t.last_message_at, t.last_message_preview, t.unread, t.starred, t.labels, t.assignee_id,
            t.ticket_id, t.customer_id, t.has_attachments, t.has_inbound, t.archived_at, t.snoozed_until, t.spam_at,
            t.deleted_at, null::timestamptz as closed_at, null::text as taken_over_by, null::text as agent_state,
            null::text as order_number
     from email_threads t
     union all
     select c.id, c.workspace_id, c.channel_id, c.store_id, c.kind, c.subject, c.participants, c.last_message_at,
            c.last_message_preview, c.unread, c.starred, c.labels, c.assignee_id, c.ticket_id, c.customer_id, false,
            c.has_inbound, c.archived_at, c.snoozed_until, c.spam_at, c.deleted_at, c.closed_at, c.taken_over_by,
            case
              when c.taken_over_by is not null
                or exists (select 1 from handovers h where h.thread_id = c.id and h.handed_back_at is null)
                then 'handed_over'
              when c.agent_spoke_at is null then null
              when c.closed_at is not null or c.archived_at is not null then 'handled'
              else 'active'
            end,
            (select o.number from orders o where c.customer_id is not null and o.customer_id = c.customer_id
               and o.store_id = c.store_id order by o.placed_at desc, o.id limit 1)
     from channel_threads c`,
  //
  // The widget's door (the public routes): which workspace a store's chat is in, read before any workspace is in scope.
  "create policy channels_routing on channels as permissive for select to insyte_owner using (true)",
  `create function webchat_route(shop text, store text)
     returns table (workspace_id text, store_id text, channel_id text, store_name text, greeting text, color text,
                    origins text[])
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select c.workspace_id, c.store_id, c.id, s.name, c.greeting, c.color,
                           array_append(c.origins || coalesce(p.origins, '{}'), 'https://' || s.shop_domain)
                    from channels c join stores s on s.id = c.store_id
                    left join store_pixels p on p.store_id = c.store_id
                    where c.kind = 'webchat' and c.status = 'connected' and s.status = 'connected'
                      and ((shop is not null and s.shop_domain = lower(shop)) or (store is not null and s.id = store));
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function webchat_route(text, text) from public",
  "grant execute on function webchat_route(text, text) to insyte_app",
  //
  "create policy channel_threads_purge on channel_threads as permissive for delete to insyte_owner using (true)",
  "create policy channel_threads_purge_read on channel_threads as permissive for select to insyte_owner using (true)",
  `create function purge_anonymous_chats(days integer) returns integer
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     declare gone integer;
     begin
       perform set_config('app.principal_kind', 'system', true);
       with d as (
         delete from channel_threads c
         where c.customer_id is null and c.ticket_id is null
           and c.last_message_at < now() - make_interval(days => greatest(days, 1))
         returning 1)
       select count(*)::int into gone from d;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
       return gone;
     end $$`,
  "revoke all on function purge_anonymous_chats(integer) from public",
  "grant execute on function purge_anonymous_chats(integer) to insyte_app"
)
