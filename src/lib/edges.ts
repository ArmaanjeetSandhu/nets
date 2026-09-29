export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Bar {
	x: number;
	y: number;
	w: number;
	h: number;
	cut?: boolean;
	fold?: { side: Side; i: number };
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

	const foldEdge = (across: boolean, at: number, side: Side) => {
		for (let t = 0; t < size; t += on + off) {
			const end = Math.min(t + on, size);
			for (let s = t; s < end;) {
				const i = Math.min(n - 1, Math.floor(s / cellDev));
				const run = Math.min(end, (i + 1) * cellDev) - s;
				const fold = { side, i };
				bars.push(
					across ? { x: s, y: at, w: run, h: lw, fold } : { x: at, y: s, w: lw, h: run, fold }
				);
				s += run;
			}
		}
	};
	const cutEdge = (across: boolean, at: number) => {
		bars.push(
			across
				? { x: -lead, y: at, w: size + lw, h: lw, cut: true }
				: { x: at, y: -lead, w: lw, h: size + lw, cut: true }
		);
	};

	if (folds.top) foldEdge(true, -lead, 'top');
	else cutEdge(true, -lead);
	if (folds.left) foldEdge(false, -lead, 'left');
	else cutEdge(false, -lead);
	if (!folds.bottom) cutEdge(true, size - lead);
	else if (bothSides) foldEdge(true, size - lead, 'bottom');
	if (!folds.right) cutEdge(false, size - lead);
	else if (bothSides) foldEdge(false, size - lead, 'right');
	return bars;
}

const OUTWARD: Record<Side, { col: number; row: number }> = {
	top: { col: 0, row: -1 },
	bottom: { col: 0, row: 1 },
	left: { col: -1, row: 0 },
	right: { col: 1, row: 0 }
};

function edgeCell(face: { row: number; col: number }, n: number, side: Side, i: number) {
	switch (side) {
		case 'top':
			return { col: face.col + i, row: face.row };
		case 'bottom':
			return { col: face.col + i, row: face.row + n - 1 };
		case 'left':
			return { col: face.col, row: face.row + i };
		case 'right':
			return { col: face.col + n - 1, row: face.row + i };
	}
}

export function foldHidden(
	face: { row: number; col: number },
	n: number,
	fold: { side: Side; i: number },
	isBlack: (col: number, row: number) => boolean
): boolean {
	const near = edgeCell(face, n, fold.side, fold.i);
	const step = OUTWARD[fold.side];
	return isBlack(near.col, near.row) && isBlack(near.col + step.col, near.row + step.row);
}
