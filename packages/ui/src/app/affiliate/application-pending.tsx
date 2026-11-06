import { Card, CardContent } from "../../components/card";
import { Clock } from "../../icons";

export function ApplicationPending() {
	return (
		<div className="flex flex-1 items-center justify-center p-8">
			<Card className="max-w-md">
				<CardContent className="flex flex-col items-center gap-3 p-8 text-center">
					<div className="flex size-12 items-center justify-center rounded-full bg-signal-amber-bg text-signal-amber">
						<Clock className="size-5" />
					</div>
					<h2 className="font-medium text-xl">
						Aanmelding wordt beoordeeld
					</h2>
					<p className="text-muted-foreground font-medium text-xs">
						Bedankt voor je aanmelding bij het affiliateprogramma van Northwind. Ons team
						beoordeelt aanmeldingen wekelijks · je krijgt een e-mail zodra er
						een besluit is.
					</p>
					<p className="text-muted-foreground font-medium text-xs">
						De meeste besluiten volgen binnen 5 werkdagen.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
