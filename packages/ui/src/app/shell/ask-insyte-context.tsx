import { createContext, useContext } from "react";

type AskInsyteContextValue = {
	open: () => void;
};

export const AskInsyteContext = createContext<AskInsyteContextValue | null>(
	null,
);

export function useAskInsyte() {
	const ctx = useContext(AskInsyteContext);
	if (!ctx) {
		return { open: () => {} };
	}
	return ctx;
}
