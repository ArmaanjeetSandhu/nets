<script lang="ts">
	import { Canvas } from '@threlte/core';
	import type { ComponentProps } from 'svelte';
	import { NoToneMapping } from 'three';
	import CubeScene from './CubeScene.svelte';

	let props: Omit<ComponentProps<typeof CubeScene>, 'anchor'> = $props();

	interface Box {
		x: number;
		y: number;
		w: number;
		h: number;
	}

	const MARGIN = 0.15;
	const MAX_SIDE = 8192;
	const MAX_AREA = 12_000_000;
	const SETTLE_MS = 150;

	let layer = $state<HTMLDivElement>();
	let box = $state.raw<Box | null>(null);
	let dpr = $state<number | undefined>();

	$effect(() => {
		const el = layer;
		const vv = window.visualViewport;
		if (!el || !vv) return;

		let zoom = 1;
		let cur: Box | null = null;
		let shown: Box | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const contains = (outer: Box, inner: Box) =>
			inner.x >= outer.x &&
			inner.y >= outer.y &&
			inner.x + inner.w <= outer.x + outer.w &&
			inner.y + inner.h <= outer.y + outer.h;

		const update = () => {
			if (vv.scale <= 1.01) {
				zoom = 1;
				cur = shown = box = null;
				dpr = undefined;
				return;
			}
			const r = el.getBoundingClientRect();
			const x0 = Math.max(0, vv.offsetLeft - r.left);
			const y0 = Math.max(0, vv.offsetTop - r.top);
			const x1 = Math.min(r.width, vv.offsetLeft + vv.width - r.left);
			const y1 = Math.min(r.height, vv.offsetTop + vv.height - r.top);
			const seen: Box = { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };

			if (!seen.w || !seen.h) cur = { x: 0, y: 0, w: 0, h: 0 };
			else if (!cur || !contains(cur, seen) || cur.w * cur.h > 2.5 * seen.w * seen.h) {
				const mx = seen.w * MARGIN;
				const my = seen.h * MARGIN;
				const bx = Math.floor(Math.max(0, seen.x - mx));
				const by = Math.floor(Math.max(0, seen.y - my));
				cur = {
					x: bx,
					y: by,
					w: Math.ceil(Math.min(r.width, seen.x + seen.w + mx)) - bx,
					h: Math.ceil(Math.min(r.height, seen.y + seen.h + my)) - by
				};
			}

			if (cur !== shown) shown = box = cur;
			const base = window.devicePixelRatio || 1;
			const { w, h } = cur;
			const cap =
				w && h ? Math.min(MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_AREA / (w * h))) : base;
			dpr = Math.max(1, Math.min(base * zoom, cap));
		};

		const onViewport = () => {
			update();
			clearTimeout(timer);
			timer = setTimeout(() => {
				zoom = Math.max(1, vv.scale);
				update();
			}, SETTLE_MS);
		};

		const ro = new ResizeObserver(update);
		ro.observe(el);
		vv.addEventListener('resize', onViewport);
		vv.addEventListener('scroll', onViewport);
		document.addEventListener('scroll', update, { capture: true, passive: true });
		zoom = Math.max(1, vv.scale);
		update();
		return () => {
			clearTimeout(timer);
			ro.disconnect();
			vv.removeEventListener('resize', onViewport);
			vv.removeEventListener('scroll', onViewport);
			document.removeEventListener('scroll', update, { capture: true });
		};
	});
</script>

<div class="cube-layer" aria-hidden="true" bind:this={layer}>
	<div
		class="cube-box"
		style:left={box ? `${box.x}px` : '0'}
		style:top={box ? `${box.y}px` : '0'}
		style:width={box ? `${box.w}px` : '100%'}
		style:height={box ? `${box.h}px` : '100%'}
	>
		{#if layer}
			<Canvas toneMapping={NoToneMapping} {dpr}>
				<CubeScene {...props} anchor={layer} />
			</Canvas>
		{/if}
	</div>
</div>

<style>
	.cube-layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.35));
	}

	.cube-box {
		position: absolute;
	}
</style>
