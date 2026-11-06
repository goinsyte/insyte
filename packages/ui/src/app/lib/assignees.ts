/*
 * Ticket assignees in the seed data are initials ("e", "s"), and tickets assigned in the console
 * carry member ids; both mean a member. This is the one place that says which.
 */
const BY_INITIAL: Record<string, string> = {
	e: "mem_elena",
	s: "mem_sofia",
	l: "mem_liam",
	m: "mem_maya",
	a: "mem_amber",
	j: "mem_ethan",
};

export const memberIdOf = (assignee: string): string => BY_INITIAL[assignee] ?? assignee;

/** The signed-in operator, as the admin persona's member. */
export const ME = "mem_elena";

export const isAssignedTo = (assigneeIds: ReadonlyArray<string>, memberId: string) =>
	assigneeIds.some((a) => memberIdOf(a) === memberId);
