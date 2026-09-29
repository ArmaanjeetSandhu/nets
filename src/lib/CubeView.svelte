<script lang="ts">
	import { Canvas } from '@threlte/core';
	import type { ComponentProps } from 'svelte';
	import { NoToneMapping } from 'three';
	import CubeScene from './CubeScene.svelte';

	let props: ComponentProps<typeof CubeScene> = $props();
</script>

<div class="cube-layer" aria-hidden="true">
	<Canvas toneMapping={NoToneMapping}>
		<CubeScene {...props} />
	</Canvas>
</div>

<style>
	.cube-layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.35));
	}
</style>
