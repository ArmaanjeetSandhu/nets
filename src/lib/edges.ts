export interface Bar {
	x: number;
	y: number;
	w: number;
	h: number;
	cut?: boolean;
}

export interface Folds {
	top: boolean;
	right: boolean;
	bottom: boolean;
	left: boolean;
}

export const EDGE = { width: 1, dash: [5, 4] } as const;

export const edgeWidth = (dpr: number) => Math.max(1, Math.round(EDGE.width * dpr));

export function edgeBars(
	folds: Folds,
	n: number,
	cellDev: number,
	dpr: number,
	bothSides: boolean
): Bar[] {
	const lw = edgeWidth(dpr);
	const lead = Math.ceil(lw / 2);
	const size = n * cellDev;
	const on = Math.max(1, Math.round(EDGE.dash[0] * dpr));
	const off = Math.max(1, Math.round(EDGE.dash[1] * dpr));
	const bars: Bar[] = [];

	for (let i = 1; i < n; i++) {
		const at = i * cellDev - lead;
		bars.push({ x: at, y: 0, w: lw, h: size }, { x: 0, y: at, w: size, h: lw });
	}

	const foldEdge = (across: boolean, at: number) => {
		for (let t = 0; t < size; t += on + off) {
			const run = Math.min(on, size - t);
			bars.push(across ? { x: t, y: at, w: run, h: lw } : { x: at, y: t, w: lw, h: run });
		}
	};
	const cutEdge = (across: boolean, at: number) => {
		bars.push(
			across
				? { x: -lead, y: at, w: size + lw, h: lw, cut: true }
				: { x: at, y: -lead, w: lw, h: size + lw, cut: true }
		);
	};

	(folds.top ? foldEdge : cutEdge)(true, -lead);
	(folds.left ? foldEdge : cutEdge)(false, -lead);
	if (!folds.bottom) cutEdge(true, size - lead);
	else if (bothSides) foldEdge(true, size - lead);
	if (!folds.right) cutEdge(false, size - lead);
	else if (bothSides) foldEdge(false, size - lead);
	return bars;
}
