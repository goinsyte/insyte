import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PersonalProfilePage } from "@insyte/ui/app/settings/me-screen";
import { useShellData } from "@insyte/ui/app/shell/state";

export const Route = createFileRoute("/_admin/settings/me")({
	component: MeRoute,
});

/** Je profiel in the reference: the demo's signed-in person; a saved name holds until the page reloads. */
function MeRoute() {
	const user = useShellData().currentUserByPersona.admin;
	const [name, setName] = useState(user.name);
	return (
		<PersonalProfilePage
			name={name}
			email={user.email}
			onSave={async (next) => {
				setName(next);
				return true;
			}}
		/>
	);
}
