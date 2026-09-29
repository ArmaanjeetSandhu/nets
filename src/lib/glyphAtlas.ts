import {
	CUBE_NUMBER_AT,
	font,
	INK,
	LETTER_AT,
	LETTER_SIZE,
	LETTER_WEIGHT,
	NUMBER_SIZE,
	NUMBER_WEIGHT
} from './faceTexture';

export interface GlyphAtlas {
	canvas: HTMLCanvasElement;
	scale: number;
	slots: Float32Array;
	letters: Map<string, number>;
	numbers: Map<number, number>;
}

interface Glyph {
	text: string;
	weight: number;
	size: number;
	at: readonly [number, number];
	align: CanvasTextAlign;
	baseline: CanvasTextBaseline;
}

interface Placed {
	glyph: Glyph;
	left: number;
	top: number;
	w: number;
	h: number;
	x: number;
	y: number;
}

const MAX_SCALE = 512;
const MIN_SCALE = 32;
const MAX_WIDTH = 2048;
const MAX_AREA = 2048 * 2048;

let measurer: CanvasRenderingContext2D | null = null;

function measure(glyphs: Glyph[], scale: number, maxSide: number) {
	measurer ??= document.createElement('canvas').getContext('2d')!;
	const ctx = measurer;
	const pad = Math.ceil(scale / 32) + 2;
	const width = Math.min(MAX_WIDTH, maxSide);
	const placed: Placed[] = [];
	let x = 0;
	let y = 0;
	let rowH = 0;
	for (const glyph of glyphs) {
		ctx.font = font(glyph.weight, glyph.size * scale);
		ctx.textAlign = glyph.align;
		ctx.textBaseline = glyph.baseline;
		const m = ctx.measureText(glyph.text);
		const left = Math.ceil(m.actualBoundingBoxLeft) + pad;
		const top = Math.ceil(m.actualBoundingBoxAscent) + pad;
		const w = Math.min(width, left + Math.ceil(m.actualBoundingBoxRight) + pad);
		const h = top + Math.ceil(m.actualBoundingBoxDescent) + pad;
		if (x + w > width) {
			x = 0;
			y += rowH;
			rowH = 0;
		}
		placed.push({ glyph, left, top, w, h, x, y });
		x += w;
		rowH = Math.max(rowH, h);
	}
	const height = Math.max(1, y + rowH);
	const fits = height <= maxSide && width * height <= MAX_AREA;
	return { placed, width, height, fits };
}

export function buildGlyphAtlas(
	letters: Iterable<string>,
	numbers: Iterable<number>,
	maxTextureSize: number,
	canvas = document.createElement('canvas')
): GlyphAtlas {
	const letterList = [...letters];
	const numberList = [...numbers];
	const glyphs: Glyph[] = [
		...letterList.map((text): Glyph => ({
			text,
			weight: LETTER_WEIGHT,
			size: LETTER_SIZE,
			at: LETTER_AT,
			align: 'center',
			baseline: 'middle'
		})),
		...numberList.map((num): Glyph => ({
			text: String(num),
			weight: NUMBER_WEIGHT,
			size: NUMBER_SIZE,
			at: CUBE_NUMBER_AT,
			align: 'left',
			baseline: 'hanging'
		}))
	];

	let scale = MAX_SCALE;
	let layout = measure(glyphs, scale, maxTextureSize);
	while (!layout.fits && scale > MIN_SCALE) {
		scale /= 2;
		layout = measure(glyphs, scale, maxTextureSize);
	}

	canvas.width = layout.width;
	canvas.height = layout.height;
	const ctx = canvas.getContext('2d')!;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = INK;
	const slots = new Float32Array(Math.max(1, glyphs.length) * 8);
	layout.placed.forEach((p, i) => {
		const g = p.glyph;
		ctx.save();
		ctx.beginPath();
		ctx.rect(p.x, p.y, p.w, p.h);
		ctx.clip();
		ctx.font = font(g.weight, g.size * scale);
		ctx.textAlign = g.align;
		ctx.textBaseline = g.baseline;
		ctx.fillText(g.text, p.x + p.left, p.y + p.top);
		ctx.restore();
		slots.set([p.x, p.y, p.w, p.h, g.at[0] - p.left / scale, g.at[1] - p.top / scale, 0, 0], i * 8);
	});

	return {
		canvas,
		scale,
		slots,
		letters: new Map(letterList.map((l, i) => [l, i])),
		numbers: new Map(numberList.map((num, i) => [num, letterList.length + i]))
	};
}
