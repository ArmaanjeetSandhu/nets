<script lang="ts">
	import { tick } from 'svelte';
	import NetIcon from '$lib/NetIcon.svelte';
	import {
		NETS,
		FAMILIES,
		IDENTITY,
		allKeys,
		buildView,
		flipH,
		flipV,
		rotateCCW,
		rotateCW,
		runFrom,
		screenDir,
		type Run,
		type Transform
	} from '$lib/cube';

	type Square = { black: boolean; letter: string };
	type Axis = 'across' | 'down';
	type Pen = 'white' | 'black';

	const MIN_N = 1;
	const MAX_N = 15;

	let sizeInput = $state(5);
	let n = $state<number | null>(null);

	let grid = $state<Record<string, Square>>({});

	let netIndex = $state(0);
	let transform = $state<Transform>(IDENTITY);
	const view = $derived(n === null ? null : buildView(netIndex, transform, n));

	let pen = $state<Pen>('white');
	let axis = $state<Axis>('across');
	let editing = $state<{ run: Run; idx: number } | null>(null);
	let painting = false;
	let lastPaint = { key: '', time: 0 };

	let stageW = $state(800);
	let stageH = $state(600);
	let input = $state<HTMLInputElement>();

	const cell = $derived.by(() => {
		if (!view) return 32;
		const fit = Math.min((stageW - 48) / view.cols, (stageH - 48) / view.rows);
		return Math.max(12, Math.min(64, Math.floor(fit)));
	});

	const runSet = $derived(new Set(editing?.run.keys ?? []));
	const caretKey = $derived(editing ? editing.run.keys[editing.idx] : null);
	const caretPos = $derived(caretKey && view ? view.pos.get(caretKey) : null);
	const caretArrow = $derived(
		editing && caretKey && view ? screenDir(view, caretKey, editing.run.dirs[editing.idx]) : null
	);
	const shownAxis = $derived<Axis>(
		caretArrow ? (caretArrow === 'left' || caretArrow === 'right' ? 'across' : 'down') : axis
	);

	function cursorFor(p: Pen) {
		const arrow = 'M2 2 L2 19 L6.5 14.5 L9.5 21.5 L12.5 20.2 L9.6 13.4 L15.5 13.4 Z';
		const svg =
			`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'>` +
			`<path d='${arrow}' fill='none' stroke='white' stroke-width='3.5' stroke-linejoin='round'/>` +
			`<path d='${arrow}' fill='${p}' stroke='black' stroke-width='1.5' stroke-linejoin='round'/>` +
			`</svg>`;
		return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 2, default`;
	}

	function start() {
		const size = Math.round(Number(sizeInput));
		if (!Number.isFinite(size) || size < MIN_N || size > MAX_N) return;
		const fresh: Record<string, Square> = {};
		for (const k of allKeys(size)) fresh[k] = { black: false, letter: '' };
		grid = fresh;
		netIndex = 0;
		transform = IDENTITY;
		pen = 'white';
		axis = 'across';
		editing = null;
		n = size;
	}

	function newGrid() {
		const used = Object.values(grid).some((s) => s.black || s.letter);
		if (used && !confirm('Start a new grid? This clears the current puzzle.')) return;
		editing = null;
		sizeInput = n ?? 5;
		n = null;
	}

	function paint(key: string) {
		const sq = grid[key];
		if (pen === 'black' && !sq.black) {
			sq.black = true;
			sq.letter = '';
		} else if (pen === 'white' && sq.black) {
			sq.black = false;
		} else return;
		lastPaint = { key, time: performance.now() };
		editing = null;
	}

	function onCellDown(e: PointerEvent, key: string) {
		e.preventDefault();
		if (e.button !== 0) return;
		if (editing) {
			const i = editing.run.keys.indexOf(key);
			if (i >= 0 && pen === 'white') {
				editing.idx = i;
				return;
			}
			editing = null;
		}
		painting = true;
		paint(key);
	}

	function onCellEnter(e: PointerEvent, key: string) {
		if (painting && e.buttons & 1) paint(key);
	}

	function onCellDouble(key: string) {
		if (grid[key].black) return;
		if (lastPaint.key === key && performance.now() - lastPaint.time < 600) return;
		openEditor(key, axis);
	}

	async function openEditor(key: string, a: Axis) {
		if (!view || n === null) return;
		const axes = view.axes.get(key)!;
		const run = runFrom(key, a === 'across' ? axes.right : axes.down, (k) => grid[k].black, n);
		axis = a;
		editing = { run, idx: 0 };
		await tick();
		input?.focus({ preventScroll: true });
	}

	function toggleDirection() {
		if (editing)
			openEditor(editing.run.keys[editing.idx], shownAxis === 'across' ? 'down' : 'across');
		else axis = axis === 'across' ? 'down' : 'across';
	}

	function closeEditor() {
		editing = null;
	}

	function typeLetter(ch: string) {
		if (!editing) return;
		grid[editing.run.keys[editing.idx]].letter = ch.toLocaleUpperCase();
		if (editing.idx < editing.run.keys.length - 1) editing.idx++;
	}

	function backspace() {
		if (!editing) return;
		const k = editing.run.keys[editing.idx];
		if (grid[k].letter) grid[k].letter = '';
		else if (editing.idx > 0) {
			editing.idx--;
			grid[editing.run.keys[editing.idx]].letter = '';
		}
	}

	function onInputKey(e: KeyboardEvent) {
		if (!editing) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			toggleDirection();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			input?.blur();
		} else if (e.key === 'Backspace') {
			e.preventDefault();
			backspace();
		} else if (e.key === 'Delete') {
			e.preventDefault();
			grid[editing.run.keys[editing.idx]].letter = '';
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			editing.idx = Math.max(0, editing.idx - 1);
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			editing.idx = Math.min(editing.run.keys.length - 1, editing.idx + 1);
		} else if (e.key.length === 1 && /\p{L}/u.test(e.key) && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();
			typeLetter(e.key);
		}
	}

	function onInput(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		for (const ch of el.value) if (/\p{L}/u.test(ch)) typeLetter(ch);
		el.value = '';
	}

	function onWindowKey(e: KeyboardEvent) {
		if (n === null || e.code !== 'Space') return;
		const t = e.target as HTMLElement | null;
		if (t instanceof HTMLInputElement && t !== input) return;
		e.preventDefault();
		pen = pen === 'white' ? 'black' : 'white';
	}

	function keepFocus(e: MouseEvent) {
		e.preventDefault();
	}

	function setView(fn: () => void) {
		fn();
		if (editing) tick().then(() => input?.focus({ preventScroll: true }));
	}

	const ARROWS: Record<string, [number, number][]> = {
		right: [
			[0.94, 0.5],
			[0.82, 0.39],
			[0.82, 0.61]
		],
		left: [
			[0.06, 0.5],
			[0.18, 0.39],
			[0.18, 0.61]
		],
		down: [
			[0.5, 0.94],
			[0.39, 0.82],
			[0.61, 0.82]
		],
		up: [
			[0.5, 0.06],
			[0.39, 0.18],
			[0.61, 0.18]
		]
	};
	const arrowPoints = (dir: string, x: number, y: number) =>
		ARROWS[dir].map(([a, b]) => `${x + a},${y + b}`).join(' ');
</script>

<svelte:head>
	<title>Nets</title>
</svelte:head>

<svelte:window onkeydown={onWindowKey} onpointerup={() => (painting = false)} />

<main class="mat">
	{#if n === null}
		<section class="setup">
			<h1>Nets</h1>
			<p>A crossword on the six faces of a cube, unfolded flat.</p>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					start();
				}}
			>
				<label for="size">Face size</label>
				<div class="size-row">
					<button
						type="button"
						class="step"
						aria-label="Smaller"
						onclick={() => (sizeInput = Math.max(MIN_N, sizeInput - 1))}>−</button
					>
					<input id="size" type="number" min={MIN_N} max={MAX_N} bind:value={sizeInput} />
					<button
						type="button"
						class="step"
						aria-label="Larger"
						onclick={() => (sizeInput = Math.min(MAX_N, sizeInput + 1))}>+</button
					>
				</div>
				<button
					type="submit"
					class="primary"
					disabled={!(sizeInput >= MIN_N && sizeInput <= MAX_N)}
				>
					Make the grid
				</button>
			</form>
		</section>
	{:else if view}
		<header class="bar">
			<nav class="nets" aria-label="Cube nets">
				{#each FAMILIES as family (family.name)}
					<div class="family" role="group" aria-label="{family.name} family">
						<span class="family-label" title={family.description}>{family.name}</span>
						<div class="family-nets">
							{#each family.nets as i (i)}
								<button
									class="net"
									class:active={netIndex === i}
									aria-pressed={netIndex === i}
									aria-label="Net {i + 1} of {NETS.length}, {family.name} family"
									title="Net {i + 1} ({family.name})"
									onmousedown={keepFocus}
									onclick={() => setView(() => (netIndex = i))}
								>
									<NetIcon net={NETS[i]} {transform} size={30} />
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</nav>

			<div class="row">
				<div class="tools">
					<button
						class="pen"
						onmousedown={keepFocus}
						onclick={() => (pen = pen === 'white' ? 'black' : 'white')}
						aria-label="Pen: {pen}. Press space to switch."
						title="Switch pen (Space)"
					>
						<span class="swatch white" class:on={pen === 'white'}></span>
						<span class="swatch black" class:on={pen === 'black'}></span>
						<span class="pen-label">{pen === 'white' ? 'White pen' : 'Black pen'}</span>
						<kbd>Space</kbd>
					</button>

					<button
						class="chip"
						onmousedown={keepFocus}
						onclick={toggleDirection}
						title="Switch typing direction (Enter while typing)"
					>
						<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
							{#if shownAxis === 'across'}
								<path d="M2 8h11M9.5 4.5 13 8l-3.5 3.5" />
							{:else}
								<path d="M8 2v11M4.5 9.5 8 13l3.5-3.5" />
							{/if}
						</svg>
						{shownAxis === 'across' ? 'Across' : 'Down'}
						<kbd>⏎</kbd>
					</button>

					<div class="group" role="group" aria-label="Turn and flip the net">
						<button
							class="icon"
							onmousedown={keepFocus}
							onclick={() => setView(() => (transform = rotateCCW(transform)))}
							title="Rotate 90° counterclockwise"
							aria-label="Rotate counterclockwise"
						>
							<svg viewBox="0 0 20 20" aria-hidden="true">
								<path d="M5.2 8.2a5.5 5.5 0 1 1 .6 5.9" />
								<path d="M2.4 5.4l2.8 2.8 2.8-2.8" />
							</svg>
						</button>
						<button
							class="icon"
							onmousedown={keepFocus}
							onclick={() => setView(() => (transform = rotateCW(transform)))}
							title="Rotate 90° clockwise"
							aria-label="Rotate clockwise"
						>
							<svg viewBox="0 0 20 20" aria-hidden="true">
								<path d="M14.8 8.2a5.5 5.5 0 1 0-.6 5.9" />
								<path d="M17.6 5.4l-2.8 2.8-2.8-2.8" />
							</svg>
						</button>
						<button
							class="icon"
							onmousedown={keepFocus}
							onclick={() => setView(() => (transform = flipH(transform)))}
							title="Flip horizontally"
							aria-label="Flip horizontally"
						>
							<svg viewBox="0 0 20 20" aria-hidden="true">
								<path d="M10 2.5v15" stroke-dasharray="2 2.2" />
								<path d="M7.2 5.5 2.8 14.5h4.4z" />
								<path d="M12.8 5.5l4.4 9h-4.4z" class="solid" />
							</svg>
						</button>
						<button
							class="icon"
							onmousedown={keepFocus}
							onclick={() => setView(() => (transform = flipV(transform)))}
							title="Flip vertically"
							aria-label="Flip vertically"
						>
							<svg viewBox="0 0 20 20" aria-hidden="true">
								<path d="M2.5 10h15" stroke-dasharray="2 2.2" />
								<path d="M5.5 7.2l9-4.4v4.4z" />
								<path d="M5.5 12.8l9 4.4v-4.4z" class="solid" />
							</svg>
						</button>
					</div>

					<button class="chip quiet" onclick={newGrid}>New grid</button>
				</div>
			</div>
		</header>

		<div class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="sheet"
				style:width="{view.cols * cell}px"
				style:height="{view.rows * cell}px"
				style:cursor={cursorFor(pen)}
				onmousedown={keepFocus}
			>
				<svg
					width={view.cols * cell}
					height={view.rows * cell}
					viewBox="0 0 {view.cols} {view.rows}"
					aria-label="Crossword grid, six faces of {n} by {n}"
					role="img"
				>
					{#each view.faces as face, fi (fi)}
						{#each face.cells as rowKeys, r (r)}
							{#each rowKeys as key, c (key)}
								{@const sq = grid[key]}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<rect
									x={face.col + c}
									y={face.row + r}
									width="1"
									height="1"
									class="sq"
									class:black={sq.black}
									class:run={runSet.has(key)}
									class:caret={key === caretKey}
									onpointerdown={(e) => onCellDown(e, key)}
									onpointerenter={(e) => onCellEnter(e, key)}
									ondblclick={() => onCellDouble(key)}
								/>
								{#if sq.letter && !sq.black}
									<text x={face.col + c + 0.5} y={face.row + r + 0.54}>{sq.letter}</text>
								{/if}
							{/each}
						{/each}
					{/each}

					{#each view.faces as face, fi (fi)}
						{@const x0 = face.col}
						{@const y0 = face.row}
						{@const x1 = face.col + n}
						{@const y1 = face.row + n}
						<line x1={x0} y1={y0} x2={x1} y2={y0} class={face.folds.top ? 'fold' : 'cut'} />
						<line x1={x0} y1={y0} x2={x0} y2={y1} class={face.folds.left ? 'fold' : 'cut'} />
						{#if !face.folds.bottom}<line x1={x0} {y1} x2={x1} y2={y1} class="cut" />{/if}
						{#if !face.folds.right}<line {x1} y1={y0} x2={x1} y2={y1} class="cut" />{/if}
					{/each}

					{#if caretPos && caretArrow}
						<polygon class="arrow" points={arrowPoints(caretArrow, caretPos.col, caretPos.row)} />
					{/if}
				</svg>

				<input
					bind:this={input}
					class="typer"
					style:left="{(caretPos?.col ?? 0) * cell}px"
					style:top="{(caretPos?.row ?? 0) * cell}px"
					style:width="{cell}px"
					style:height="{cell}px"
					aria-label="Letters"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					tabindex={editing ? 0 : -1}
					onkeydown={onInputKey}
					oninput={onInput}
					onblur={closeEditor}
				/>
			</div>
		</div>
	{/if}
</main>

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
	}
	:global(body) {
		font-family: 'Libre Franklin', 'Helvetica Neue', Arial, sans-serif;
		-webkit-font-smoothing: antialiased;
	}

	.mat {
		--mat: #2f5b4c;
		--dot-pitch: 9px;
		--halftone-strength: 0.1;
		--rule: #e6cf5c;
		--paper: #ffffff;
		--ink: #161616;
		--grid-line: #c8ccc9;
		--run: #fff1a1;
		--caret: #f4c430;
		--on-mat: #eef3ef;
		--on-mat-dim: rgb(238 243 239 / 0.72);

		height: 100vh;
		height: 100dvh;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		color: var(--on-mat);
		background-color: var(--mat);
		position: relative;
		isolation: isolate;
	}

	.mat::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
		background-image:
			radial-gradient(circle closest-side, #fff, #000),
			radial-gradient(ellipse 85% 85% at 0% 0%, #fff, #6e6e6e 100%),
			radial-gradient(ellipse 85% 85% at 100% 100%, #fff, #6e6e6e 100%);
		background-size:
			var(--dot-pitch) var(--dot-pitch),
			100% 100%,
			100% 100%;
		background-blend-mode: multiply, lighten, normal;
		filter: contrast(24);
		mix-blend-mode: screen;
		opacity: var(--halftone-strength);
	}

	@media (prefers-color-scheme: dark) {
		.mat {
			--mat: #1f3d33;
		}
	}

	h1 {
		font-weight: 800;
		letter-spacing: -0.01em;
		margin: 0;
	}

	button {
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--rule);
		outline-offset: 2px;
	}

	.setup {
		margin: auto;
		width: min(26rem, calc(100% - 2rem));
		box-sizing: border-box;
		padding: 2rem 2rem 1.75rem;
		background: var(--paper);
		color: var(--ink);
		box-shadow: 0 10px 24px rgb(0 0 0 / 0.35);
	}
	.setup h1 {
		font-size: 1.75rem;
		line-height: 1.1;
	}
	.setup p {
		margin: 0.75rem 0 1.5rem;
		line-height: 1.5;
		color: #4a4f4c;
	}
	.setup label {
		display: block;
		font-weight: 600;
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
	}
	.size-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 1.5rem;
	}
	.size-row input {
		width: 3.5rem;
		height: 2.5rem;
		box-sizing: border-box;
		text-align: center;
		font: inherit;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--ink);
		background: var(--paper);
		border: 2px solid var(--ink);
		border-radius: 0;
		appearance: textfield;
		-moz-appearance: textfield;
	}
	.size-row input::-webkit-inner-spin-button,
	.size-row input::-webkit-outer-spin-button {
		appearance: none;
		margin: 0;
	}
	.step {
		width: 2.5rem;
		height: 2.5rem;
		border: 2px solid var(--ink);
		border-radius: 0;
		background: var(--paper);
		color: var(--ink);
		font-size: 1.25rem;
		line-height: 1;
	}
	.step:hover {
		background: #f1f1ee;
	}
	.primary {
		width: 100%;
		padding: 0.85rem 1rem;
		border: 0;
		background: var(--ink);
		color: var(--paper);
		font-weight: 600;
		font-size: 1rem;
	}
	.primary:hover {
		background: #000;
	}
	.primary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.bar {
		padding: 0.75rem 1.25rem 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.tools {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.pen,
	.chip,
	.icon {
		height: 2.25rem;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid rgb(255 255 255 / 0.28);
		background: rgb(0 0 0 / 0.18);
		border-radius: 4px;
		padding: 0 0.7rem;
		font-size: 0.875rem;
		font-weight: 500;
	}
	.pen:hover,
	.chip:hover,
	.icon:hover {
		background: rgb(0 0 0 / 0.32);
	}
	.chip svg,
	.icon svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.icon svg {
		width: 20px;
		height: 20px;
	}
	.icon svg .solid {
		fill: currentColor;
	}
	.icon {
		padding: 0;
		width: 2.25rem;
		justify-content: center;
		border-radius: 0;
	}
	.group {
		display: inline-flex;
	}
	.group .icon + .icon {
		border-left: 0;
	}
	.group .icon:first-child {
		border-radius: 4px 0 0 4px;
	}
	.group .icon:last-child {
		border-radius: 0 4px 4px 0;
	}
	.quiet {
		background: transparent;
	}

	.swatch {
		width: 14px;
		height: 14px;
		box-sizing: border-box;
		border: 1.5px solid var(--on-mat);
		opacity: 0.45;
		transition:
			transform 120ms,
			opacity 120ms;
	}
	.swatch.white {
		background: #fff;
	}
	.swatch.black {
		background: #000;
		margin-left: -0.3rem;
	}
	.swatch.on {
		opacity: 1;
		transform: scale(1.2);
		outline: 2px solid var(--rule);
		outline-offset: 1px;
	}
	.pen-label {
		min-width: 4.6rem;
		text-align: left;
	}
	kbd {
		font: inherit;
		font-size: 0.72rem;
		padding: 0.1rem 0.35rem;
		border: 1px solid rgb(255 255 255 / 0.35);
		border-radius: 3px;
		color: var(--on-mat-dim);
	}

	.nets {
		display: flex;
		justify-content: center;
		align-items: flex-end;
		gap: 0.9rem;
		overflow-x: auto;
		padding-bottom: 0.25rem;
		scrollbar-width: thin;
	}
	.family {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.2rem;
	}
	.family + .family {
		padding-left: 0.9rem;
		border-left: 1px solid rgb(255 255 255 / 0.18);
	}
	.family-label {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		font-variant-numeric: tabular-nums;
		color: var(--on-mat-dim);
		text-align: center;
		padding-bottom: 0.15rem;
		border-bottom: 1px solid rgb(255 255 255 / 0.18);
		cursor: default;
	}
	.family-nets {
		display: flex;
		gap: 0.35rem;
	}
	.net {
		flex: 0 0 auto;
		width: 3.25rem;
		height: 3rem;
		display: grid;
		place-items: center;
		border: 1px solid transparent;
		background: transparent;
		border-radius: 4px;
		--icon-stroke: rgb(255 255 255 / 0.6);
	}
	.net:hover {
		background: rgb(0 0 0 / 0.18);
		--icon-stroke: #fff;
	}
	.net.active {
		background: rgb(0 0 0 / 0.28);
		border-color: var(--rule);
		--icon-fill: var(--paper);
		--icon-stroke: var(--mat);
	}

	.stage {
		flex: 1;
		min-height: 0;
		display: grid;
		place-items: center;
		overflow: auto;
	}
	.sheet {
		position: relative;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
	}
	.sheet svg {
		display: block;
		overflow: visible;
		filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.35));
	}

	.sq {
		fill: var(--paper);
		stroke: var(--grid-line);
		stroke-width: 1px;
		vector-effect: non-scaling-stroke;
	}
	.sq.black {
		fill: #000;
		stroke: #000;
	}
	.sq.run {
		fill: var(--run);
	}
	.sq.caret {
		fill: var(--caret);
	}

	text {
		font-family: 'Libre Franklin', 'Helvetica Neue', Arial, sans-serif;
		font-weight: 600;
		font-size: 0.62px;
		fill: var(--ink);
		text-anchor: middle;
		dominant-baseline: central;
		pointer-events: none;
	}

	line {
		vector-effect: non-scaling-stroke;
		stroke-linecap: square;
		pointer-events: none;
	}
	line.cut {
		stroke: var(--ink);
		stroke-width: 2.5px;
	}
	line.fold {
		stroke: #6d7571;
		stroke-width: 1.5px;
		stroke-dasharray: 5 4;
		stroke-linecap: butt;
	}

	.arrow {
		fill: var(--ink);
		opacity: 0.55;
		pointer-events: none;
	}

	.typer {
		position: absolute;
		box-sizing: border-box;
		padding: 0;
		border: 0;
		opacity: 0;
		font-size: 16px;
		pointer-events: none;
		caret-color: transparent;
	}

	@media (max-width: 640px) {
		.bar {
			padding: 0.75rem 0.75rem 0.25rem;
		}
		.nets {
			justify-content: flex-start;
		}
		.pen-label,
		kbd {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.swatch {
			transition: none;
		}
	}
</style>
