import { KnowledgeRpcs } from "@insyte/api/rpc/KnowledgeRpcs"
import { KnowledgeService } from "@insyte/modules/knowledge/Knowledge"
import { Effect } from "effect"
import { withEmbedder } from "../../../platform/Embeddings.ts"

export const KnowledgeHandlers = KnowledgeRpcs.toLayer(Effect.gen(function*() {
  const knowledge = yield* KnowledgeService
  return KnowledgeRpcs.of({
    "Knowledge.list": (input) => knowledge.list(input),
    "Knowledge.get": ({ id }) => knowledge.get(id),
    "Knowledge.versions": ({ id }) => knowledge.versions(id),
    "Knowledge.version": ({ id, version }) => knowledge.version(id, version),
    "Knowledge.create": (input) => knowledge.create(input),
    "Knowledge.saveDraft": (input) => knowledge.saveDraft(input),
    "Knowledge.publish": (input) => knowledge.publish(input),
    "Knowledge.restoreVersion": ({ id, version }) => knowledge.restore(id, version),
    "Knowledge.archive": ({ id }) => knowledge.archive(id),
    // "Test je klantagent": the question by meaning where the stage has an embedder.
    "Knowledge.search": (input) => withEmbedder(knowledge.search(input)),
    "Knowledge.gaps": (input) => knowledge.gaps(input),
    "Knowledge.gap": ({ gapId }) => knowledge.gap(gapId),
    "Knowledge.dismissGap": ({ gapId }) => knowledge.dismissGap(gapId),
    "Knowledge.restoreGap": ({ gapId }) => knowledge.restoreGap(gapId),
    "Knowledge.linkGap": (input) => knowledge.linkGap(input)
  })
}))
