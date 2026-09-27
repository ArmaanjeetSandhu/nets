<script lang="ts">
	import { transformShape, type NetShape, type Transform } from './cube';

	let {
		net,
		transform,
		size = 36
	}: { net: NetShape; transform: Transform; size?: number } = $props();

	const shape = $derived(transformShape(net, transform));
	const unit = $derived(size / Math.max(shape.rows, shape.cols));
	const outline = $derived(shape.faces.map((f) => `M${f.col} ${f.row}h1v1h-1z`).join(''));
</script>

<svg
	width={shape.cols * unit}
	height={shape.rows * unit}
	viewBox="-0.08 -0.08 {shape.cols + 0.16} {shape.rows + 0.16}"
	aria-hidden="true"
>
	{#each shape.faces as f (f.row * 10 + f.col)}
		<rect x={f.col} y={f.row} width="1" height="1" />
	{/each}
	<path d={outline} />
</svg>

<style>
	svg {
		display: block;
		overflow: visible;
	}
	rect {
		fill: var(--icon-fill, transparent);
	}
	path {
		fill: none;
		stroke: var(--icon-stroke, currentColor);
		stroke-width: 0.14;
		stroke-linejoin: round;
	}
</style>
