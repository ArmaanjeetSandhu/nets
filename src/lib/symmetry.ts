import { keyOf, parseKey, type Vec } from './cube';

export type SymmetryKind =
	| 'face90'
	| 'face180'
	| 'corner120'
	| 'edge180'
	| 'mirror'
	| 'diagonal'
	| 'inversion'
	| 'rotoreflect90'
	| 'rotoreflect60';

export type SymmetryKey = 'inversion' | `${Exclude<SymmetryKind, 'inversion'>}:${string}`;

export interface SymmetryKindInfo {
	kind: SymmetryKind;
	label: string;
	hint: string;
}

export const KINDS: readonly SymmetryKindInfo[] = [
	{ kind: 'face90', label: '90° rotation', hint: 'Through two opposite faces' },
	{ kind: 'face180', label: '180° rotation', hint: 'Through two opposite faces' },
	{ kind: 'corner120', label: '120° rotation', hint: 'Through two opposite corners' },
	{ kind: 'edge180', label: '180° rotation', hint: 'Through two opposite edges' },
	{ kind: 'mirror', label: 'Mirror', hint: 'Halfway between two faces' },
	{ kind: 'inversion', label: 'Inversion', hint: 'Through the centre' },
	{ kind: 'diagonal', label: 'Diagonal mirror', hint: 'Through two opposite edges' },
	{ kind: 'rotoreflect90', label: '90° rotoreflection', hint: 'Quarter turn, then mirror' },
	{ kind: 'rotoreflect60', label: '60° rotoreflection', hint: 'Sixth turn, then mirror' }
];

export interface Symmetry {
	key: SymmetryKey;
	kind: SymmetryKind;
	label: string;
	short: string;
	axis: Vec | null;
	transform: (p: Vec, n: number) => Vec;
}

interface Op {
	perm: Vec;
	sign: Vec;
}

const each = (f: (i: number) => number): Vec => [f(0), f(1), f(2)];

const OPS: Op[] = [];
for (const perm of [
	[0, 1, 2],
	[1, 2, 0],
	[2, 0, 1],
	[0, 2, 1],
	[2, 1, 0],
	[1, 0, 2]
] as Vec[]) {
	for (let bits = 0; bits < 8; bits++) {
		OPS.push({ perm, sign: each((i) => (bits & (1 << i) ? -1 : 1)) });
	}
}
const IDENTITY = 0;
const PROPER_PERMS = 3;

const act = (o: Op, v: Vec): Vec => each((i) => o.sign[i] * v[o.perm[i]]);
const opId = (o: Op) => `${o.perm}|${o.sign}`;
const INDEX = new Map(OPS.map((o, i) => [opId(o), i]));
const indexOf = (o: Op) => INDEX.get(opId(o))!;

const MUL = OPS.map((a) =>
	OPS.map((b) =>
		indexOf({
			perm: each((i) => b.perm[a.perm[i]]),
			sign: each((i) => a.sign[i] * b.sign[a.perm[i]])
		})
	)
);

const isProper = (i: number) =>
	(i >> 3 < PROPER_PERMS ? 1 : -1) * OPS[i].sign[0] * OPS[i].sign[1] * OPS[i].sign[2] > 0;

function turnOf(i: number): { order: number; axis: Vec | null } {
	const turn = isProper(i) ? i : indexOf({ perm: OPS[i].perm, sign: each((k) => -OPS[i].sign[k]) });
	let order = 1;
	for (let x = turn; x !== IDENTITY; x = MUL[x][turn]) order++;
	if (order === 1) return { order, axis: null };
	for (let j = 0; j < 3; j++) {
		let v = each((k) => (k === j ? 1 : 0));
		let sum: Vec = [0, 0, 0];
		for (let k = 0; k < order; k++) {
			sum = each((c) => sum[c] + v[c]);
			v = act(OPS[turn], v);
		}
		const lead = sum.find((c) => c !== 0);
		if (lead === undefined) continue;
		return { order, axis: each((c) => Math.sign(sum[c]) * Math.sign(lead) + 0) };
	}
	return { order, axis: null };
}

function kindOf(proper: boolean, order: number, axis: Vec | null): SymmetryKind | null {
	if (!axis) return proper ? null : 'inversion';
	if (order === 4) return proper ? 'face90' : 'rotoreflect90';
	if (order === 3) return proper ? 'corner120' : 'rotoreflect60';
	if (axis.filter((c) => c !== 0).length === 1) return proper ? 'face180' : 'mirror';
	return proper ? 'edge180' : 'diagonal';
}

const LETTERS = 'xyz';

function axisName(axis: Vec, minus = '-') {
	let out = '';
	axis.forEach((c, i) => {
		if (c === 0) return;
		if (c < 0) out += minus;
		else if (out) out += '+';
		out += LETTERS[i];
	});
	return out;
}

function planeName(normal: Vec) {
	const [i, j] = [0, 1, 2].filter((k) => normal[k] !== 0);
	if (j === undefined) return `${LETTERS[i]} = 0`;
	return `${LETTERS[i]} = ${normal[j] < 0 ? '' : '−'}${LETTERS[j]}`;
}

const SHORT: Record<SymmetryKind, string> = {
	face90: '90°',
	face180: '180°',
	corner120: '120°',
	edge180: '180°',
	mirror: 'mirror',
	diagonal: 'mirror',
	inversion: 'inversion',
	rotoreflect90: '90° rotoreflection',
	rotoreflect60: '60° rotoreflection'
};

function describe(kind: SymmetryKind, axis: Vec | null) {
	const { label } = KINDS.find((k) => k.kind === kind)!;
	if (!axis) return { label, short: SHORT[kind] };
	const plane = kind === 'mirror' || kind === 'diagonal';
	const place = plane ? planeName(axis) : axisName(axis, '−');
	return {
		label: `${label} ${plane ? 'in' : 'about'} ${place}`,
		short: `${SHORT[kind]} ${place}`
	};
}

const KIND_OF: (SymmetryKind | null)[] = [];
const MEMBERS = new Map<SymmetryKey, number[]>();
const found: Symmetry[] = [];

OPS.forEach((op, i) => {
	const { order, axis } = turnOf(i);
	const kind = kindOf(isProper(i), order, axis);
	KIND_OF.push(kind);
	if (!kind) return;
	const key = (axis ? `${kind}:${axisName(axis)}` : kind) as SymmetryKey;
	const members = MEMBERS.get(key);
	if (members) {
		members.push(i);
		return;
	}
	MEMBERS.set(key, [i]);
	found.push({
		key,
		kind,
		...describe(kind, axis),
		axis,
		transform: (p, n) => each((c) => op.sign[c] * (p[op.perm[c]] - n) + n)
	});
});

const kindRank = (kind: SymmetryKind) => KINDS.findIndex((k) => k.kind === kind);

function inMenuOrder(a: Symmetry, b: Symmetry) {
	const byKind = kindRank(a.kind) - kindRank(b.kind);
	if (byKind !== 0) return byKind;
	return a.key < b.key ? -1 : 1;
}

export const SYMMETRIES: readonly Symmetry[] = found.toSorted(inMenuOrder);

const BY_KEY = new Map(SYMMETRIES.map((s) => [s.key, s]));

function span(keys: Iterable<SymmetryKey>): number[] {
	const generators = [...new Set(keys)].flatMap((k) => MEMBERS.get(k) ?? []);
	const seen = new Set([IDENTITY]);
	const queue = [IDENTITY];
	for (const p of queue) {
		for (const g of generators) {
			const next = MUL[g][p];
			if (seen.has(next)) continue;
			seen.add(next);
			queue.push(next);
		}
	}
	return queue.toSorted((a, b) => a - b);
}

export function closure(keys: Iterable<SymmetryKey>): Set<SymmetryKey> {
	const group = new Set(span(keys));
	return new Set(SYMMETRIES.filter((s) => group.has(MEMBERS.get(s.key)![0])).map((s) => s.key));
}

function reason(key: SymmetryKey, keys: SymmetryKey[]): SymmetryKey[] | null {
	const target = MEMBERS.get(key)![0];
	const seen = new Set<string>();
	let level: SymmetryKey[][] = [[]];
	while (level.length) {
		const next: SymmetryKey[][] = [];
		for (const subset of level) {
			const held = new Set(span(subset));
			for (const k of keys) {
				if (held.has(MEMBERS.get(k)![0])) continue;
				const grown = [...subset, k];
				const group = span(grown);
				const id = group.join();
				if (seen.has(id)) continue;
				seen.add(id);
				if (group.includes(target)) return grown;
				next.push(grown);
			}
		}
		level = next;
	}
	return null;
}

export interface SymmetryOption extends Symmetry {
	checked: boolean;
	impliedBy: SymmetryKey[] | null;
}

export function symmetryOptions(chosen: readonly SymmetryKey[]): SymmetryOption[] {
	const usable = [...new Set(chosen)].filter((k) => BY_KEY.has(k));
	const active = closure(usable);
	return SYMMETRIES.map((s) => {
		const checked = active.has(s.key);
		const impliedBy = checked
			? reason(
					s.key,
					usable.filter((k) => k !== s.key)
				)
			: null;
		return { ...s, checked, impliedBy };
	});
}

const signature = (counts: Partial<Record<SymmetryKind, number>>) =>
	KINDS.map((k) => counts[k.kind] ?? 0).join();

const GROUPS: [string, Partial<Record<SymmetryKind, number>>][] = [
	['Off', {}],
	['180° (face)', { face180: 1 }],
	['180° (edge)', { edge180: 1 }],
	['Mirror', { mirror: 1 }],
	['Diagonal mirror', { diagonal: 1 }],
	['Inversion', { inversion: 1 }],
	['120°', { corner120: 2 }],
	['90°', { face90: 2, face180: 1 }],
	['90° rotoreflection', { face180: 1, rotoreflect90: 2 }],
	['60° rotoreflection', { corner120: 2, inversion: 1, rotoreflect60: 2 }],
	['D2', { face180: 3 }],
	['D2', { face180: 1, edge180: 2 }],
	['C2h', { face180: 1, mirror: 1, inversion: 1 }],
	['C2h', { edge180: 1, diagonal: 1, inversion: 1 }],
	['C2v', { face180: 1, mirror: 2 }],
	['C2v', { face180: 1, diagonal: 2 }],
	['C2v', { edge180: 1, mirror: 1, diagonal: 1 }],
	['D3', { corner120: 2, edge180: 3 }],
	['C3v', { corner120: 2, diagonal: 3 }],
	['D4', { face90: 2, face180: 3, edge180: 2 }],
	['C4v', { face90: 2, face180: 1, mirror: 2, diagonal: 2 }],
	['C4h', { face90: 2, face180: 1, mirror: 1, inversion: 1, rotoreflect90: 2 }],
	['D2h', { face180: 3, mirror: 3, inversion: 1 }],
	['D2h', { face180: 1, edge180: 2, mirror: 1, diagonal: 2, inversion: 1 }],
	['D2d', { face180: 3, diagonal: 2, rotoreflect90: 2 }],
	['D2d', { face180: 1, edge180: 2, mirror: 2, rotoreflect90: 2 }],
	['D3d', { corner120: 2, edge180: 3, diagonal: 3, inversion: 1, rotoreflect60: 2 }],
	['T', { face180: 3, corner120: 8 }],
	[
		'D4h',
		{
			face90: 2,
			face180: 3,
			edge180: 2,
			mirror: 3,
			diagonal: 2,
			inversion: 1,
			rotoreflect90: 2
		}
	],
	['All rotations', { face90: 6, face180: 3, corner120: 8, edge180: 6 }],
	['Td', { face180: 3, corner120: 8, diagonal: 6, rotoreflect90: 6 }],
	['Th', { face180: 3, corner120: 8, mirror: 3, inversion: 1, rotoreflect60: 8 }],
	[
		'Full',
		{
			face90: 6,
			face180: 3,
			corner120: 8,
			edge180: 6,
			mirror: 3,
			diagonal: 6,
			inversion: 1,
			rotoreflect90: 6,
			rotoreflect60: 8
		}
	]
];

const GROUP_NAMES = new Map(GROUPS.map(([name, counts]) => [signature(counts), name]));

export function describeSymmetry(active: Iterable<SymmetryKey>): string {
	const group = span(active);
	const counts: Partial<Record<SymmetryKind, number>> = {};
	for (const i of group) {
		const kind = KIND_OF[i];
		if (kind) counts[kind] = (counts[kind] ?? 0) + 1;
	}
	return GROUP_NAMES.get(signature(counts)) ?? `${group.length - 1} symmetries`;
}

export function counterparts(key: string, n: number, active: Iterable<SymmetryKey>): string[] {
	const p = parseKey(key);
	const centred = each((c) => p[c] - n);
	const seen = new Set<string>();
	for (const i of span(active)) {
		const q = act(OPS[i], centred);
		seen.add(keyOf(each((c) => q[c] + n)));
	}
	seen.delete(key);
	return [...seen];
}
