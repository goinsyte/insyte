import { toast } from "sonner";

/*
 * OAuth buttons share the canonical /login input pattern: white tile, 1px
 * hairline ring at rest, hairline-strong on hover, Arc + Arc-Soft halo on
 * focus. No drop shadow. Works on both light and mesh-dark surfaces (the
 * white tile pops against either canvas).
 */
const OAUTH_BTN =
	"flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-paper px-3 text-[14px] font-medium leading-none tracking-[-0.1px] text-ink transition-shadow " +
	" " +
	"hover: " +
	"" +
	"focus-visible:outline-none";

export function GoogleButton({
	label = "Doorgaan met Google",
	onClick,
}: {
	label?: string;
	onClick?: () => void;
}) {
	return (
		<button type="button" onClick={() => onClick?.()} className={OAUTH_BTN}>
			<GoogleGlyph />
			{label}
		</button>
	);
}

export function MicrosoftButton({
	label = "Doorgaan met Microsoft",
	onClick,
}: {
	label?: string;
	onClick?: () => void;
}) {
	return (
		<button
			type="button"
			onClick={() => {
				onClick?.();
				toast.success("Doorsturen naar Microsoft… (mock)");
			}}
			className={OAUTH_BTN}
		>
			<MicrosoftGlyph />
			{label}
		</button>
	);
}

export function OAuthDivider({ label = "of" }: { label?: string }) {
	return (
		<div className="flex items-center gap-3">
			<div
				className="h-px flex-1"
				style={{ background: "var(--field-ring, var(--hairline))" }}
			/>
			<span
				className="font-medium text-[12px] leading-none"
				style={{
					color: "var(--ink-3)",
				}}
			>
				{label}
			</span>
			<div
				className="h-px flex-1"
				style={{ background: "var(--field-ring, var(--hairline))" }}
			/>
		</div>
	);
}

function GoogleGlyph() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			role="img"
			aria-label="Google"
		>
			<title>Google</title>
			<path
				fill="#4285F4"
				d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
			/>
			<path
				fill="#34A853"
				d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.87 0-5.3-1.94-6.17-4.54H2.18v2.85A11 11 0 0 0 12 23Z"
			/>
			<path
				fill="#FBBC05"
				d="M5.83 14.1a6.6 6.6 0 0 1 0-4.2V7.05H2.18a11 11 0 0 0 0 9.9l3.65-2.85Z"
			/>
			<path
				fill="#EA4335"
				d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.16-3.16C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05L5.83 9.9C6.7 7.32 9.13 5.38 12 5.38Z"
			/>
		</svg>
	);
}

function MicrosoftGlyph() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			role="img"
			aria-label="Microsoft"
		>
			<title>Microsoft</title>
			<rect x="1" y="1" width="10" height="10" fill="#F25022" />
			<rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
			<rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
			<rect x="13" y="13" width="10" height="10" fill="#FFB900" />
		</svg>
	);
}
