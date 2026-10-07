<script lang="ts">
	import { parseKey, type Vec, type View } from './cube';
	import type { Symmetry, SymmetryKind } from './symmetry';

	let { view, symmetry, size = 32 }: { view: View; symmetry: Symmetry; size?: number } = $props();

	const TURNS: readonly SymmetryKind[] = [
		'face90',
		'face180',
		'corner120',
		'edge180',
		'rotoreflect90',
		'rotoreflect60'
	];
	const PLANES: readonly SymmetryKind[] = ['mirror', 'diagonal', 'rotoreflect90', 'rotoreflect60'];

	const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

	const faces = $derived(
		[...view.pos].map(([key, at]) => {
			const p = parseKey(key);
			const normal: Vec = [p[0] - 1, p[1] - 1, p[2] - 1];
			return { ...at, normal, ...view.axes.get(key)! };
		})
	);
	const unit = $derived(size / Math.max(view.rows, view.cols));
	const outline = $derived(faces.map((f) => `M${f.col} ${f.row}h1v1h-1z`).join(''));
	const pairs = $derived(
		symmetry.kind === 'inversion'
			? faces.map((f) => ({ ...f, pair: f.normal.findIndex((c) => c !== 0) }))
			: []
	);

	const marks = $derived.by(() => {
		const axis = symmetry.axis;
		const points: { x: number; y: number }[] = [];
		let lines = '';
		if (!axis) return { points, lines };
		const turn = TURNS.includes(symmetry.kind);
		const plane = PLANES.includes(symmetry.kind);
		for (const f of faces) {
			const at = (u: number, v: number) => ({ x: f.col + 0.5 + u / 2, y: f.row + 0.5 + v / 2 });
			const k = dot(axis, f.normal);
			const ku = dot(axis, f.right);
			const kv = dot(axis, f.down);
			if (turn && Math.abs(k) === 1) points.push(at(k * ku, k * kv));
			if (!plane) continue;
			const ends: { x: number; y: number }[] = [];
			const add = (u: number, v: number) => {
				if (Math.abs(u) > 1 || Math.abs(v) > 1) return;
				const p = at(u, v);
				if (!ends.some((e) => e.x === p.x && e.y === p.y)) ends.push(p);
			};
			for (const t of [-1, 1]) {
				if (kv !== 0) add(t, -(k + ku * t) / kv);
				if (ku !== 0) add(-(k + kv * t) / ku, t);
			}
			if (ends.length === 2) lines += `M${ends[0].x} ${ends[0].y}L${ends[1].x} ${ends[1].y}`;
		}
		return { points, lines };
	});
</script>

<svg
	width={view.cols * unit}
	height={view.rows * unit}
	viewBox="-0.2 -0.2 {view.cols + 0.4} {view.rows + 0.4}"
	aria-hidden="true"
>
	{#each pairs as f (f.row * 10 + f.col)}
		<rect class="pair" x={f.col} y={f.row} width="1" height="1" opacity={0.25 + 0.3 * f.pair} />
	{/each}
	<path class="net" d={outline} />
	{#if marks.lines}<path class="plane" d={marks.lines} />{/if}
	{#each marks.points as p, i (i)}
		<circle cx={p.x} cy={p.y} r="0.17" />
	{/each}
</svg>

<style>
	svg {
		display: block;
		overflow: visible;
		max-width: 100%;
		height: auto;
	}
	.pair {
		fill: var(--rule, currentColor);
	}
	path {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.net {
		stroke: currentColor;
		stroke-width: 0.1;
		opacity: 0.55;
	}
	.plane {
		stroke: var(--rule, currentColor);
		stroke-width: 0.16;
	}
	circle {
		fill: var(--rule, currentColor);
	}
</style>
