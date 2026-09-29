import type { ViewFace } from './cube';
import { edgeBars, foldHidden } from './edges';

export interface FaceStyle {
	grid: Record<string, { black: boolean; letter: string }>;
	numbers: ReadonlyMap<string, number> | undefined;
	highlight: ReadonlySet<string>;
	blackAt?: (col: number, row: number) => boolean;
}

export const FONT = `"Libre Franklin", "Helvetica Neue", Arial, sans-serif`;
export const PAPER = '#ffffff';
export const INK = '#161616';
export const RUN = '#fff1a1';
const EDGE_COLOR = '#000000';

export const CUBE_BODY = '#111111';
export const TILE_GAP = 0.09;
export const TILE_RADIUS = 0.16;

export const LETTER_WEIGHT = 600;
export const LETTER_SIZE = 0.62;
export const LETTER_AT: readonly [number, number] = [0.5, 0.54];
export const LETTER_NUMBERED_SHIFT = 0.06;
export const NUMBER_WEIGHT = 500;
export const NUMBER_SIZE = 0.27;
export const NET_NUMBER_AT: readonly [number, number] = [0.06, 0.05];
export const CUBE_NUMBER_AT: readonly [number, number] = [0.13, 0.11];

export const font = (weight: number, px: number) => `${weight} ${px}px ${FONT}`;

export function drawFace(
	canvas: HTMLCanvasElement,
	face: ViewFace,
	n: number,
	px: number,
	ls: number,
	style: FaceStyle
) {
	const size = n * px;
	if (canvas.width !== size) canvas.width = size;
	if (canvas.height !== size) canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.setLineDash([]);

	const isBlack = (key: string) => style.grid[key]?.black ?? false;
	const lit = (key: string) => style.highlight.has(key) && !isBlack(key);

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
		for (let c = 0; c < n; c++) if (isBlack(face.cells[r][c])) ctx.fillRect(c * px, r * px, px, px);

	ctx.fillStyle = INK;
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			const key = face.cells[r][c];
			const sq = style.grid[key];
			if (!sq || sq.black) continue;
			const num = style.numbers?.get(key);
			if (sq.letter) {
				ctx.font = font(LETTER_WEIGHT, LETTER_SIZE * px);
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				const y = LETTER_AT[1] + (num ? LETTER_NUMBERED_SHIFT : 0);
				ctx.fillText(sq.letter, (c + LETTER_AT[0]) * px, (r + y) * px);
			}
			if (num) {
				ctx.font = font(NUMBER_WEIGHT, NUMBER_SIZE * px);
				ctx.textAlign = 'left';
				ctx.textBaseline = 'hanging';
				ctx.fillText(String(num), (c + NET_NUMBER_AT[0]) * px, (r + NET_NUMBER_AT[1]) * px);
			}
		}

	const blackAt = style.blackAt;
	for (const b of edgeBars(face.folds, n, px, ls, true)) {
		const x = b.cut && b.x + b.w <= 0 ? 0 : b.x;
		const y = b.cut && b.y + b.h <= 0 ? 0 : b.y;
		const hidden = b.fold && blackAt && foldHidden(face, n, b.fold, blackAt);
		ctx.fillStyle = hidden ? PAPER : EDGE_COLOR;
		ctx.fillRect(x, y, b.w, b.h);
	}
}
