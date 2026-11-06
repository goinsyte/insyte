import qrcode from "qrcode-generator";
import { useMemo } from "react";

/**
 * A QR code for a link, drawn as one SVG path so it stays sharp at any size and downloads as a
 * file the affiliate can drop into a story or print on a flyer.
 */
export function useQr(text: string) {
	return useMemo(() => {
		const qr = qrcode(0, "M");
		qr.addData(text);
		qr.make();
		const n = qr.getModuleCount();
		let d = "";
		for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
		return { n, d };
	}, [text]);
}

export function QrCode({ text, size = 160, className }: { text: string; size?: number; className?: string }) {
	const { n, d } = useQr(text);
	return (
		<svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={size} height={size} role="img" aria-label={`QR-code voor ${text}`} className={className} shapeRendering="crispEdges">
			<rect x={-2} y={-2} width={n + 4} height={n + 4} fill="white" />
			<path d={d} fill="#0b0b12" />
		</svg>
	);
}

export function downloadQr(text: string, name: string) {
	const qr = qrcode(0, "M");
	qr.addData(text);
	qr.make();
	const n = qr.getModuleCount();
	let d = "";
	for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" width="1024" height="1024" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#0b0b12"/></svg>`;
	const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = `qr-${name}.svg`;
	a.click();
	URL.revokeObjectURL(url);
}
