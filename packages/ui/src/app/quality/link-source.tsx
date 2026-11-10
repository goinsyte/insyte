import { createContext, useContext } from "react"
import type { QualityCheck } from "../lib/quality"

/**
 * What a quality check's link page reads and sends (M9.4), from whoever hosts it: the design app from its quality store,
 * the console from `QualityLink.*`.
 */

/** What the supplier sends; the host says what went wrong, or `null`. */
export type CheckAnswer = { files: File[]; batch?: string | undefined; note?: string | undefined }

export type LinkedCheck = QualityCheck & { productTitle: string; productImage?: string | undefined; supplierName: string };

export interface QualityLinkSource {
	/** `null`: the link is spent, or not one of ours. */
	check: LinkedCheck | null;
	brand: string;
	send: (answer: CheckAnswer) => Promise<string | null>;
}

const LinkContext = createContext<QualityLinkSource | null>(null)

export const QualityLinkSourceProvider = LinkContext.Provider

export function useQualityLinkSource(): QualityLinkSource {
  const source = useContext(LinkContext)
  if (source === null) throw new Error("The quality link page needs a QualityLinkSourceProvider around it.")
  return source
}
