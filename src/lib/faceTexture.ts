import type { ViewFace } from './cube';
import { edgeBars, foldHidden } from './edges';

export interface FaceStyle {
	grid: Record<string, { black: boolean; letter: string }>;
	numbers: ReadonlyMap<string, number> | undefined;
	highlight: ReadonlySet<string>;
	blackAt?: (col: number, row: number) => boolean;
}

export type FaceLook = 'net' | 'cube';

const FONT = `"Libre Franklin", "Helvetica Neue", Arial, sans-serif`;
const PAPER = '#ffffff';
const INK = '#161616';
const RUN = '#fff1a1';
const EDGE_COLOR = '#000000';

export const CUBE_BODY = '#111111';
const TILE_GAP = 0.09;
const TILE_RADIUS = 0.16;

export function drawFace(
	canvas: HTMLCanvasElement,
	face: ViewFace,
	n: number,
	px: number,
	ls: number,
	style: FaceStyle,
	look: FaceLook
) {
	const size = n * px;
	if (canvas.width !== size) canvas.width = size;
	if (canvas.height !== size) canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.setLineDash([]);

	const isBlack = (key: string) => style.grid[key]?.black ?? false;
	const lit = (key: string) => style.highlight.has(key) && !isBlack(key);

	if (look === 'cube') {
		ctx.fillStyle = CUBE_BODY;
		ctx.fillRect(0, 0, size, size);
		const gap = TILE_GAP * px;
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++) {
				const key = face.cells[r][c];
				if (isBlack(key)) continue;
				ctx.fillStyle = lit(key) ? RUN : PAPER;
				ctx.beginPath();
				ctx.roundRect(c * px + gap / 2, r * px + gap / 2, px - gap, px - gap, TILE_RADIUS * px);
				ctx.fill();
			}
	} else {
		ctx.fillStyle = PAPER;
		ctx.fillRect(0, 0, size, size);
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++)
				if (lit(face.cells[r][c])) {
					ctx.fillStyle = RUN;
					ctx.fillRect(c * px, r * px, px, px);
				}

		ctx.fillStyle = '#000';
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++)
				if (isBlack(face.cells[r][c])) ctx.fillRect(c * px, r * px, px, px);
	}

	const numAt = look === 'cube' ? [0.13, 0.11] : [0.06, 0.05];
	ctx.fillStyle = INK;
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			const key = face.cells[r][c];
			const sq = style.grid[key];
			if (!sq || sq.black) continue;
			const num = style.numbers?.get(key);
			if (sq.letter) {
				ctx.font = `600 ${0.62 * px}px ${FONT}`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(sq.letter, (c + 0.5) * px, (r + (num ? 0.6 : 0.54)) * px);
			}
			if (num) {
				ctx.font = `500 ${0.27 * px}px ${FONT}`;
				ctx.textAlign = 'left';
				ctx.textBaseline = 'hanging';
				ctx.fillText(String(num), (c + numAt[0]) * px, (r + numAt[1]) * px);
			}
		}

	if (look === 'cube') return;

	const blackAt = style.blackAt;
	for (const b of edgeBars(face.folds, n, px, ls, true)) {
		const x = b.cut && b.x + b.w <= 0 ? 0 : b.x;
		const y = b.cut && b.y + b.h <= 0 ? 0 : b.y;
		const hidden = b.fold && blackAt && foldHidden(face, n, b.fold, blackAt);
		ctx.fillStyle = hidden ? PAPER : EDGE_COLOR;
		ctx.fillRect(x, y, b.w, b.h);
	}
}
