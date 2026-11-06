import { createFileRoute } from "@tanstack/react-router";
import { search } from "@insyte/ui/app/onboarding/onboarding-search";
import { OnboardingPage } from "@insyte/ui/app/onboarding/onboarding-screen";

export const Route = createFileRoute("/onboarding/")({
	validateSearch: search,
	component: OnboardingPage,
});
