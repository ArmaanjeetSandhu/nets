<script lang="ts">
	import { devicePixelRatio } from 'svelte/reactivity/window';

	const PITCH = 9;
	const GLOW = 0.85;
	const FLOOR = 0x6e / 0xff;
	const CONTRAST = 24;
	const MAX_PIXELS = 8_000_000;

	let canvas = $state<HTMLCanvasElement>();

	function draw(el: HTMLCanvasElement, dpr: number) {
		const w = el.clientWidth;
		const h = el.clientHeight;
		if (!w || !h) return;
		const k = Math.min(dpr, Math.sqrt(MAX_PIXELS / (w * h)));
		const W = (el.width = Math.round(w * k));
		const H = (el.height = Math.round(h * k));
		const ctx = el.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;
		const image = ctx.createImageData(W, H);
		const data = image.data;
		const sx = w / W;
		const sy = h / H;
		const rx = GLOW * w;
		const ry = GLOW * h;
		const half = PITCH / 2;

		for (let cy = half; cy < h + half; cy += PITCH)
			for (let cx = half; cx < w + half; cx += PITCH) {
				const t = Math.min(
					1,
					Math.hypot(cx / rx, cy / ry),
					Math.hypot((w - cx) / rx, (h - cy) / ry)
				);
				const mask = 1 - (1 - FLOOR) * t;
				const reach = half * (1 - (0.5 - 0.5 / CONTRAST) / mask);
				if (reach <= 0) continue;
				const x0 = Math.max(0, Math.floor((cx - reach) / sx));
				const x1 = Math.min(W - 1, Math.floor((cx + reach) / sx));
				const y0 = Math.max(0, Math.floor((cy - reach) / sy));
				const y1 = Math.min(H - 1, Math.floor((cy + reach) / sy));
				for (let py = y0; py <= y1; py++)
					for (let px = x0; px <= x1; px++) {
						const dx = (px + 0.5) * sx - cx;
						const dy = (py + 0.5) * sy - cy;
						const dot = 1 - Math.sqrt(dx * dx + dy * dy) / half;
						const level = (dot * mask - 0.5) * CONTRAST + 0.5;
						if (level <= 0) continue;
						const i = (py * W + px) * 4;
						data[i] = data[i + 1] = data[i + 2] = 255;
						data[i + 3] = level * 255;
					}
			}
		ctx.putImageData(image, 0, 0);
	}

	$effect(() => {
		const el = canvas;
		if (!el) return;
		const dpr = devicePixelRatio.current ?? 1;
		const ro = new ResizeObserver(() => draw(el, dpr));
		ro.observe(el);
		return () => ro.disconnect();
	});
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
	canvas {
		position: absolute;
		inset: 0;
		z-index: -1;
		width: 100%;
		height: 100%;
		pointer-events: none;
		opacity: var(--halftone-strength, 0.1);
	}
</style>
