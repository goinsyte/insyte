import { statements } from "../statements.ts"

/**
 * The invitation landing's way in (M3.4, domain.md §2.5). The landing is public and knows no workspace: these
 * security-definer functions answer which workspace a link belongs to, and nothing else, so the landing then reads the
 * invitation in that workspace's scope like any other read. Each looks as the owner with `app.principal_kind` at
 * `system`, so the members-only policy lets it, and puts the caller's value back before it returns.
 *
 * `invitation_open_for` is the beta gate's question: an open invitation admits its address (domain.md §2.11).
 */

/** A definer function over `body`, a query of one value, as `system` for its own duration. */
const asSystem = (signature: string, returns: string, declare: string, body: string) =>
  `create function ${signature} returns ${returns} language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true); ${declare}
     begin
       perform set_config('app.principal_kind', 'system', true);
       ${body}
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
       return result;
     end $$`

export default statements(
  "create policy invitations_routing on invitations as permissive for select to insyte_owner using (true)",
  "create policy invite_links_routing on invite_links as permissive for select to insyte_owner using (true)",
  // An invitation by its id and the hash of its secret: the wrong secret is no invitation at all.
  asSystem(
    "invitation_route(invitation_id text, secret_hash bytea)",
    "text",
    "result text;",
    "select workspace_id into result from invitations where id = invitation_id and token_hash = secret_hash;"
  ),
  "revoke all on function invitation_route(text, bytea) from public",
  "grant execute on function invitation_route(text, bytea) to insyte_app",
  // The shareable link by the hash of its secret, in whatever state it is.
  asSystem(
    "invite_link_route(secret_hash bytea)",
    "text",
    "result text;",
    "select workspace_id into result from invite_links where token_hash = secret_hash;"
  ),
  "revoke all on function invite_link_route(bytea) from public",
  "grant execute on function invite_link_route(bytea) to insyte_app",
  asSystem(
    "invitation_open_for(address text)",
    "boolean",
    "result boolean;",
    `select exists (select 1 from invitations
       where email = lower(address) and accepted_at is null and revoked_at is null and declined_at is null
         and expires_at > now()) into result;`
  ),
  "revoke all on function invitation_open_for(text) from public",
  "grant execute on function invitation_open_for(text) to insyte_app"
)
