import { type ComponentType, createContext, useContext } from "react";
import type { Currency, Customer, Order } from "../lib/types/domain";

/**
 * What one customer's profile reads and does, from whoever hosts it (as `source.tsx` is for the list): the design app
 * from its demo workspace, the console from `Customers.get` (M6.4). The profile's markup is the design's. Where a part
 * is absent the screen leaves it out: the console has no merges or Klaviyo lists, no returns and no tickets yet.
 */
export interface CustomerDetailSource {
	customer: Customer;
	/** Their orders, newest first, as many as the host holds for the profile. */
	orders: ReadonlyArray<Order>;
	/** The currency their figures are in; absent, the format's own. */
	currency?: Currency | undefined;
	/** When they last ordered, where the host knows. */
	lastOrderAt?: string | undefined;
	/** The profile merged into another, or others merged into it (the design's merges). */
	merged?:
		| { into?: { id: string; name: string } | undefined; absorbed: number; alsoEmails: ReadonlyArray<string> }
		| undefined;
	/** The Klaviyo list they were sent to, where the host has one. */
	klaviyo?: { list: string; at: string } | undefined;
	/** A follow-up ticket for them, where the host has a board. */
	newTicket?: (() => void) | undefined;
	Returns?: ComponentType<{ email: string }> | undefined;
	/** True while the host is still reading the profile; absent where it arrives at the reference's pace. */
	arriving?: boolean | undefined;
}

const CustomerDetailSourceContext = createContext<CustomerDetailSource | null>(null);

export const CustomerDetailSourceProvider = CustomerDetailSourceContext.Provider;

export function useCustomerDetailSource(): CustomerDetailSource {
	const source = useContext(CustomerDetailSourceContext);
	if (source === null) throw new Error("A customer's profile needs a CustomerDetailSourceProvider around it.");
	return source;
}
