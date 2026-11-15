import { Tool, Toolkit } from "effect/ai"
import { Me } from "../../http/groups/KeyGroup.ts"
import { asKey, Needs } from "../Shared.ts"

/* The key in use (M19.3). */

export const Whoami = Tool.make("whoami", {
  description: "The API key in use: its label, its scopes and the Insyte workspace it belongs to.",
  success: Me,
  dependencies: asKey()
}).annotate(Tool.Readonly, true).annotate(Needs, [])

export const KeyTools = Toolkit.make(
  Whoami
)
