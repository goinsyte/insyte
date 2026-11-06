import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SupplierChat } from "@insyte/ui/app/supplier/chats-screen";

export const Route = createFileRoute("/_supplier/supplier/chats/")({
	validateSearch: z.object({ ref: z.string().optional() }),
	component: SupplierChat,
});
