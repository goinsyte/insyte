import { Button } from "../../components/button";
import { Card, CardContent } from "../../components/card";
import { ShieldAlert } from "../../icons";
import { toast } from "sonner";
import { setPersonaSelection } from "../hooks/use-persona";
import { currentAffiliateByState } from "../../data-source";

export function ApplicationRejected() {
	const aff = currentAffiliateByState.rejected;
	return (
		<div className="flex flex-1 items-center justify-center p-8">
			<Card className="max-w-md">
				<CardContent className="flex flex-col items-center gap-3 p-8 text-center">
					<div className="flex size-12 items-center justify-center rounded-full bg-signal-red-bg text-signal-red">
						<ShieldAlert className="size-5" />
					</div>
					<h2 className="font-medium text-xl">
						Aanmelding niet goedgekeurd
					</h2>
					<p className="text-muted-foreground font-medium text-xs">
						{aff.rejection_reason}
					</p>
					<Button
						size="sm"
						variant="outline"
						onClick={() => {
							// Back into review: the affiliate layout reads the state and shows the pending screen.
							setPersonaSelection("affiliate-pending");
							toast.success("Aanmelding opnieuw verstuurd", {
								description: "De meeste besluiten volgen binnen 5 werkdagen.",
							});
						}}
					>
						Opnieuw aanmelden
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
