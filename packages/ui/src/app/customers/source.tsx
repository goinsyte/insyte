import { type ComponentType, createContext, useContext } from "react";
import type { DuplicateGroup } from "../lib/duplicates";
import type { Currency, Customer } from "../lib/types/domain";
import type { IndexItem } from "../marketing-sections/link-index";
import type { RowAction } from "../table/data-table";
import type { CustomerStatus } from "./customer-status-badge";

/**
 * What the customers list reads and does, from whoever hosts it: the design app from its demo stores, the console from
 * `Customers.list` (M6.4). The list's markup is the design's. Where a part is absent the screen leaves it out: the
 * console reads customers before it can change them (M7), so it copies and exports only.
 */

export type TeamGate = { ok: boolean; reason: string };

/** A customer as the list shows it: its status and average order beside the profile. */
export type CustomerRow = Customer & { status: CustomerStatus; aov: number };

export type CustomerOpeners = {
	tag: (rows: CustomerRow[]) => void;
	merge: (rows: CustomerRow[]) => void;
	klaviyo: (rows: CustomerRow[]) => void;
};

export interface CustomersSource {
	customers: ReadonlyArray<Customer>;
	loading: boolean;
	/** Profiles that look like the same person twice, as the host finds them. */
	duplicates: ReadonlyArray<DuplicateGroup>;
	/** Loyal, new or at risk (duplicates come from `duplicates`). */
	statusOf: (customer: Customer) => CustomerStatus;
	/** "Laatste bestelling", as the host knows it. */
	lastOrder: (customer: Customer) => string;
	actions: (open: CustomerOpeners) => ReadonlyArray<RowAction<CustomerRow>>;
	applyTags?: ((rows: ReadonlyArray<CustomerRow>, tags: ReadonlyArray<string>, mode: "add" | "remove") => void) | undefined;
	canCreate: TeamGate;
	/** The currency a customer's figures are in; absent, the format's own. */
	currencyOf?: ((customer: Customer) => Currency | undefined) | undefined;
	NewCustomer?: ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void }> | undefined;
	Klaviyo?: ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void; picked: CustomerRow[] }> | undefined;
	Merge?:
		| ComponentType<{
				open: boolean;
				onOpenChange: (open: boolean) => void;
				groups: DuplicateGroup[];
				customers: Customer[];
		  }>
		| undefined;
	starts?: IndexItem[] | undefined;
	Closing?: ComponentType<{ empty: boolean }> | undefined;
	open?: ((customer: CustomerRow) => void) | undefined;
}

const CustomersSourceContext = createContext<CustomersSource | null>(null);

export const CustomersSourceProvider = CustomersSourceContext.Provider;

export function useCustomersSource(): CustomersSource {
	const source = useContext(CustomersSourceContext);
	if (source === null) throw new Error("A customers screen needs a CustomersSourceProvider around it.");
	return source;
}
