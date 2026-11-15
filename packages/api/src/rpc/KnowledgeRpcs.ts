import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  Article,
  ArticleArchived,
  ArticleList,
  ArticleSaved,
  CreateInput,
  Gap,
  GapChanged,
  GapIdInput,
  GapList,
  GapNotOpen,
  GapsInput,
  IdInput,
  KnowledgeStale,
  LinkGapInput,
  ListInput,
  SaveInput,
  SearchInput,
  SearchResult,
  Version,
  VersionInput
} from "@insyte/modules/knowledge/domain/Knowledge"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Missing = Schema.Union([Forbidden, NotFound])
const Write = Schema.Union([Forbidden, NotFound, Invalid, KnowledgeStale, ArticleArchived])

/**
 * Kennisbank (M15 step 7; api.md §2.24): the chapters with their versions, the questions nothing answered yet, and the
 * search the answers read it through. Instellingen · Bekijken reads; Beheren writes a draft and handles a gap;
 * publishing a chapter the customer agent reads also needs `ai.autonomy`. A save on an older revision is
 * `KnowledgeStale`; every write has its undo token.
 */
export class KnowledgeRpcs extends RpcGroup.make(
  Rpc.make("Knowledge.list", { payload: ListInput, success: ArticleList, error: Forbidden }),
  Rpc.make("Knowledge.get", { payload: IdInput, success: Article, error: Missing }),
  Rpc.make("Knowledge.versions", { payload: IdInput, success: Schema.Array(Version), error: Missing }),
  Rpc.make("Knowledge.version", { payload: VersionInput, success: Version, error: Missing }),
  Rpc.make("Knowledge.create", {
    payload: CreateInput,
    success: ArticleSaved,
    error: Schema.Union([Forbidden, Invalid, NotFound])
  }),
  Rpc.make("Knowledge.saveDraft", { payload: SaveInput, success: ArticleSaved, error: Write }),
  Rpc.make("Knowledge.publish", { payload: SaveInput, success: ArticleSaved, error: Write }),
  Rpc.make("Knowledge.restoreVersion", { payload: VersionInput, success: ArticleSaved, error: Write }),
  Rpc.make("Knowledge.archive", { payload: IdInput, success: ArticleSaved, error: Missing }),
  Rpc.make("Knowledge.search", { payload: SearchInput, success: SearchResult, error: Forbidden }),
  Rpc.make("Knowledge.gaps", { payload: GapsInput, success: GapList, error: Forbidden }),
  Rpc.make("Knowledge.gap", { payload: GapIdInput, success: Gap, error: Missing }),
  Rpc.make("Knowledge.dismissGap", {
    payload: GapIdInput,
    success: GapChanged,
    error: Schema.Union([Forbidden, NotFound, GapNotOpen])
  }),
  Rpc.make("Knowledge.restoreGap", {
    payload: GapIdInput,
    success: GapChanged,
    error: Schema.Union([Forbidden, NotFound, GapNotOpen, Conflict])
  }),
  Rpc.make("Knowledge.linkGap", {
    payload: LinkGapInput,
    success: GapChanged,
    error: Schema.Union([Forbidden, NotFound, GapNotOpen])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
