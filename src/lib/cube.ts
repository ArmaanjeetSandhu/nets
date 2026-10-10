export type Vec = readonly [number, number, number];
export type NetShape = readonly (readonly [number, number])[];

export const NETS: readonly NetShape[] = [
	[
		[0, 0],
		[1, 0],
		[1, 1],
		[1, 2],
		[1, 3],
		[2, 0]
	],
	[
		[0, 0],
		[1, 0],
		[1, 1],
		[1, 2],
		[1, 3],
		[2, 1]
	],
	[
		[0, 0],
		[1, 0],
		[1, 1],
		[1, 2],
		[1, 3],
		[2, 2]
	],
	[
		[0, 0],
		[1, 0],
		[1, 1],
		[1, 2],
		[1, 3],
		[2, 3]
	],
	[
		[0, 1],
		[1, 0],
		[1, 1],
		[1, 2],
		[1, 3],
		[2, 1]
	],
	[
		[0, 1],
		[1, 0],
		[1, 1],
		[1, 2],
		[1, 3],
		[2, 2]
	],
	[
		[0, 0],
		[0, 1],
		[1, 1],
		[1, 2],
		[1, 3],
		[2, 1]
	],
	[
		[0, 0],
		[0, 1],
		[1, 1],
		[1, 2],
		[1, 3],
		[2, 2]
	],
	[
		[0, 0],
		[0, 1],
		[1, 1],
		[1, 2],
		[1, 3],
		[2, 3]
	],
	[
		[0, 0],
		[0, 1],
		[1, 1],
		[1, 2],
		[2, 2],
		[2, 3]
	],
	[
		[0, 0],
		[0, 1],
		[0, 2],
		[1, 2],
		[1, 3],
		[1, 4]
	]
];

export interface NetFamily {
	name: string;
	nets: readonly number[];
}

export const FAMILIES: readonly NetFamily[] = [
	{ name: '1-4-1', nets: [0, 1, 2, 3, 4, 5] },
	{ name: '2-3-1', nets: [6, 7, 8] },
	{ name: '2-2-2', nets: [9] },
	{ name: '3-3', nets: [10] }
];

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const neg = (a: Vec): Vec => [-a[0], -a[1], -a[2]];
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const keyOf = (p: Vec) => `${p[0]},${p[1]},${p[2]}`;
export const parseKey = (k: string): Vec => k.split(',').map(Number) as unknown as Vec;

interface FoldedFace {
	row: number;
	col: number;
	N: Vec;
	R: Vec;
	D: Vec;
}

function fold(net: NetShape): FoldedFace[] {
	const has = (r: number, c: number) => net.some(([a, b]) => a === r && b === c);
	const degree = ([r, c]: readonly [number, number]) =>
		[has(r - 1, c), has(r + 1, c), has(r, c - 1), has(r, c + 1)].filter(Boolean).length;

	let root = net[0];
	for (const f of net) if (degree(f) > degree(root)) root = f;

	const out: FoldedFace[] = [
		{ row: root[0], col: root[1], N: [0, 0, 1], R: [1, 0, 0], D: [0, 1, 0] }
	];
	const queue = [out[0]];
	const seen = new Set([`${root[0]},${root[1]}`]);

	while (queue.length) {
		const f = queue.shift()!;
		const next: [number, number, Vec, Vec, Vec][] = [
			[f.row, f.col + 1, f.R, neg(f.N), f.D],
			[f.row, f.col - 1, neg(f.R), f.N, f.D],
			[f.row + 1, f.col, f.D, f.R, neg(f.N)],
			[f.row - 1, f.col, neg(f.D), f.R, f.N]
		];
		for (const [row, col, N, R, D] of next) {
			const id = `${row},${col}`;
			if (!has(row, col) || seen.has(id)) continue;
			seen.add(id);
			const g = { row, col, N, R, D };
			out.push(g);
			queue.push(g);
		}
	}
	return out;
}

export type Transform = readonly [number, number, number, number];

export const IDENTITY: Transform = [1, 0, 0, 1];
const apply = (m: Transform, x: number, y: number): [number, number] => [
	m[0] * x + m[1] * y,
	m[2] * x + m[3] * y
];
const compose = (a: Transform, b: Transform): Transform => [
	a[0] * b[0] + a[1] * b[2],
	a[0] * b[1] + a[1] * b[3],
	a[2] * b[0] + a[3] * b[2],
	a[2] * b[1] + a[3] * b[3]
];

export const rotateCW = (m: Transform) => compose([0, -1, 1, 0], m);
export const rotateCCW = (m: Transform) => compose([0, 1, -1, 0], m);
export const flipH = (m: Transform) => compose([-1, 0, 0, 1], m);
export const flipV = (m: Transform) => compose([1, 0, 0, -1], m);

export function transformShape(net: NetShape, m: Transform) {
	const pts = net.map(([r, c]) => apply(m, 2 * c + 1, 2 * r + 1));
	const minX = Math.min(...pts.map((p) => p[0]));
	const minY = Math.min(...pts.map((p) => p[1]));
	const faces = pts.map(([x, y]) => ({ row: (y - minY) / 2, col: (x - minX) / 2 }));
	return {
		faces,
		rows: Math.max(...faces.map((f) => f.row)) + 1,
		cols: Math.max(...faces.map((f) => f.col)) + 1
	};
}

export interface ViewFace {
	row: number;
	col: number;
	cells: string[][];
	folds: { top: boolean; right: boolean; bottom: boolean; left: boolean };
}

export interface View {
	rows: number;
	cols: number;
	faces: ViewFace[];
	pos: Map<string, { row: number; col: number }>;
	axes: Map<string, { right: Vec; down: Vec }>;
}

export function buildView(netIndex: number, m: Transform, n: number): View {
	const folded = fold(NETS[netIndex]);
	const inv: Transform = [m[0], m[2], m[1], m[3]];
	const [rx, ry] = apply(inv, 1, 0);
	const [dx, dy] = apply(inv, 0, 1);

	const raw: { key: string; x: number; y: number; face: number }[] = [];
	const axes = new Map<string, { right: Vec; down: Vec }>();
	const centre: Vec = [n, n, n];

	folded.forEach((f, fi) => {
		const right = add(mul(f.R, rx), mul(f.D, ry));
		const down = add(mul(f.R, dx), mul(f.D, dy));
		for (let r = 0; r < n; r++) {
			for (let c = 0; c < n; c++) {
				const p = add(
					add(add(centre, mul(f.N, n)), mul(f.R, 2 * c + 1 - n)),
					mul(f.D, 2 * r + 1 - n)
				);
				const key = keyOf(p);
				const [x, y] = apply(m, 2 * (f.col * n + c) + 1, 2 * (f.row * n + r) + 1);
				raw.push({ key, x, y, face: fi });
				axes.set(key, { right, down });
			}
		}
	});

	const minX = Math.min(...raw.map((q) => q.x));
	const minY = Math.min(...raw.map((q) => q.y));
	const pos = new Map<string, { row: number; col: number }>();
	const faceCells: string[][][] = folded.map(() =>
		Array.from({ length: n }, () => new Array<string>(n).fill(''))
	);
	const faceOrigin = folded.map(() => ({ row: Infinity, col: Infinity }));

	for (const q of raw) {
		const row = (q.y - minY) / 2;
		const col = (q.x - minX) / 2;
		pos.set(q.key, { row, col });
		const o = faceOrigin[q.face];
		o.row = Math.min(o.row, Math.floor(row / n) * n);
		o.col = Math.min(o.col, Math.floor(col / n) * n);
	}
	for (const q of raw) {
		const { row, col } = pos.get(q.key)!;
		faceCells[q.face][row % n][col % n] = q.key;
	}

	const occupied = new Set(faceOrigin.map((o) => `${o.row / n},${o.col / n}`));
	const faces: ViewFace[] = faceOrigin.map((o, i) => {
		const fr = o.row / n;
		const fc = o.col / n;
		return {
			row: o.row,
			col: o.col,
			cells: faceCells[i],
			folds: {
				top: occupied.has(`${fr - 1},${fc}`),
				bottom: occupied.has(`${fr + 1},${fc}`),
				left: occupied.has(`${fr},${fc - 1}`),
				right: occupied.has(`${fr},${fc + 1}`)
			}
		};
	});

	return {
		rows: Math.max(...faces.map((f) => f.row)) + n,
		cols: Math.max(...faces.map((f) => f.col)) + n,
		faces,
		pos,
		axes
	};
}

export function allKeys(n: number): string[] {
	return [...buildView(0, IDENTITY, n).pos.keys()];
}

export function normalOf(p: Vec, n: number): Vec {
	for (let i = 0; i < 3; i++) {
		if (p[i] === 0 || p[i] === 2 * n) {
			const v: [number, number, number] = [0, 0, 0];
			v[i] = p[i] === 0 ? -1 : 1;
			return v;
		}
	}
	throw new Error(`Not a surface cell: ${p}`);
}

function step(p: Vec, d: Vec, n: number): { p: Vec; d: Vec } {
	const q = add(p, mul(d, 2));
	const axis = d.findIndex((v) => v !== 0);
	if (q[axis] > 0 && q[axis] < 2 * n) return { p: q, d };
	const N = normalOf(p, n);
	return { p: add(add(p, d), neg(N)), d: neg(N) };
}

export interface Run {
	keys: string[];
	dirs: Vec[];
}

export function runFrom(start: string, dir: Vec, isBlack: (k: string) => boolean, n: number): Run {
	const keys = [start];
	const dirs = [dir];
	let cur = { p: parseKey(start), d: dir };
	for (let i = 0; i < 4 * n; i++) {
		cur = step(cur.p, cur.d, n);
		const k = keyOf(cur.p);
		if (k === start || isBlack(k)) break;
		keys.push(k);
		dirs.push(cur.d);
	}
	return { keys, dirs };
}

export type ScreenDir = 'right' | 'left' | 'down' | 'up';

export function screenDir(v: View, key: string, d: Vec): ScreenDir {
	const a = v.axes.get(key)!;
	const r = dot(d, a.right);
	if (r !== 0) return r > 0 ? 'right' : 'left';
	return dot(d, a.down) > 0 ? 'down' : 'up';
}

function rings(keys: Iterable<string>, n: number): Run[] {
	const out: Run[] = [];
	const seen = new Set<string>();
	for (const key of keys) {
		const p = parseKey(key);
		const normalAxis = normalOf(p, n).findIndex((x) => x !== 0);
		for (let t = 0; t < 3; t++) {
			if (t === normalAxis) continue;
			const fixed = 3 - t - normalAxis;
			const id = `${fixed}:${p[fixed]}`;
			if (seen.has(id)) continue;
			seen.add(id);
			const d: [number, number, number] = [0, 0, 0];
			d[t] = 1;
			const run: Run = { keys: [key], dirs: [d] };
			let cur = { p, d: d as Vec };
			for (let i = 1; i < 4 * n; i++) {
				cur = step(cur.p, cur.d, n);
				run.keys.push(keyOf(cur.p));
				run.dirs.push(cur.d);
			}
			out.push(run);
		}
	}
	return out;
}

export interface Entry {
	number: number;
	axis: 'across' | 'down';
	keys: string[];
}

export interface Numbering {
	numbers: Map<string, number>;
	entries: Entry[];
}

const OPPOSITE: Record<ScreenDir, ScreenDir> = {
	right: 'left',
	left: 'right',
	down: 'up',
	up: 'down'
};
const reads = (d: ScreenDir) => d === 'right' || d === 'down';

export function numberEntries(v: View, isBlack: (k: string) => boolean, n: number): Numbering {
	const before = (a: string, b: string) => {
		const pa = v.pos.get(a)!;
		const pb = v.pos.get(b)!;
		return pa.row !== pb.row ? pa.row < pb.row : pa.col < pb.col;
	};

	const found: { axis: Entry['axis']; keys: string[] }[] = [];
	const addEntry = (ring: Run, idx: number[]) => {
		const keys = idx.map((i) => ring.keys[i]);
		const dirs = idx.map((i, j) => screenDir(v, keys[j], ring.dirs[i]));
		const last = keys.length - 1;
		const ahead = dirs.filter(reads).length * 2 - keys.length;
		let reverse = ahead < 0;
		if (ahead === 0) {
			const fwd = reads(dirs[0]);
			const rev = reads(OPPOSITE[dirs[last]]);
			reverse = fwd === rev ? before(keys[last], keys[0]) : rev;
		}
		const first = reverse ? OPPOSITE[dirs[last]] : dirs[0];
		found.push({
			axis: first === 'left' || first === 'right' ? 'across' : 'down',
			keys: reverse ? keys.toReversed() : keys
		});
	};

	for (const ring of rings(v.pos.keys(), n)) {
		const len = ring.keys.length;
		const b = ring.keys.findIndex(isBlack);
		if (b < 0) continue;
		let seg: number[] = [];
		for (let s = 1; s <= len; s++) {
			const i = (b + s) % len;
			if (!isBlack(ring.keys[i])) {
				seg.push(i);
				continue;
			}
			if (seg.length >= 2) addEntry(ring, seg);
			seg = [];
		}
	}

	const starts = [...new Set(found.map((e) => e.keys[0]))].sort((a, b) => (before(a, b) ? -1 : 1));
	const numbers = new Map(starts.map((k, i) => [k, i + 1]));
	const entries = found
		.map((e) => ({ number: numbers.get(e.keys[0])!, ...e }))
		.sort((a, b) => a.number - b.number || (a.axis === 'across' ? -1 : 1));
	return { numbers, entries };
}
