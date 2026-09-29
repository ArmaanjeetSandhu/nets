<script lang="ts">
	import { tick } from 'svelte';
	import NetIcon from '$lib/NetIcon.svelte';
	import { edgeBars } from '$lib/edges';
	import {
		NETS,
		FAMILIES,
		IDENTITY,
		allKeys,
		buildView,
		flipH,
		flipV,
		numberEntries,
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

	const MIN_N = 2;
	const MAX_N = 6;

	let sizeInput = $state(5);
	let n = $state<number | null>(null);

	let grid = $state<Record<string, Square>>({});

	let netIndex = $state(0);
	let transform = $state<Transform>(IDENTITY);
	const view = $derived(n === null ? null : buildView(netIndex, transform, n));

	const complete = $derived(
		n !== null && Object.values(grid).every((sq) => sq.black || sq.letter !== '')
	);
	const numbering = $derived(
		complete && view && n !== null ? numberEntries(view, (k) => grid[k].black, n) : null
	);

	type ClueRow = { id: string; number: number; word: string; keys: string[] };

	let clues = $state<Record<string, string>>({});
	let activeClue = $state<string | null>(null);
	let title = $state('');

	const clueLists = $derived.by(() => {
		const lists: Record<Axis, ClueRow[]> = { across: [], down: [] };
		for (const e of numbering?.entries ?? []) {
			lists[e.axis].push({
				id: `${e.axis}:${e.keys.join('|')}`,
				number: e.number,
				word: e.keys.map((k) => grid[k].letter).join(''),
				keys: e.keys
			});
		}
		return lists;
	});
	const clueSet = $derived(
		new Set([...clueLists.across, ...clueLists.down].find((c) => c.id === activeClue)?.keys ?? [])
	);
	const clueText = (c: ClueRow) => clues[c.id] ?? `Clue for ${c.word}`;

	function fileName(t: string) {
		const safe = t
			// eslint-disable-next-line no-control-regex
			.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '')
			.trim()
			.replace(/[.\s]+$/, '')
			.replace(/\s+/g, '_')
			.toLowerCase();
		return `${safe || 'crossword'}.json`;
	}

	function download() {
		if (!numbering || n === null) return;
		const puzzleTitle = title.trim();
		const written: Record<string, string> = {};
		const entries = numbering.entries.map((e) => {
			const id = `${e.axis}:${e.keys.join('|')}`;
			const clue = clues[id];
			if (clue !== undefined) written[id] = clue;
			return {
				id,
				number: e.number,
				axis: e.axis,
				cells: e.keys,
				answer: e.keys.map((k) => grid[k].letter).join(''),
				...(clue !== undefined && { clue })
			};
		});
		const puzzle = {
			format: 'nets-crossword',
			version: 1,
			...(puzzleTitle && { title: puzzleTitle }),
			size: n,
			grid: $state.snapshot(grid),
			clues: written,
			layout: { netIndex, transform: [...transform] },
			entries
		};
		const blob = new Blob([JSON.stringify(puzzle, null, 2) + '\n'], {
			type: 'application/json'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName(puzzleTitle);
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	type ViewMode = 'net' | 'cube';
	let viewMode = $state<ViewMode>('net');
	let cubeMounted = $state(false);
	let netHidden = $state(false);
	let sheet = $state<HTMLDivElement>();
	let cubeModule = $state.raw<Promise<typeof import('$lib/CubeView.svelte')>>();
	const loadCube = () => (cubeModule ??= import('$lib/CubeView.svelte'));

	function showCube() {
		if (viewMode === 'cube') return;
		input?.blur();
		editing = null;
		loadCube();
		viewMode = 'cube';
		cubeMounted = true;
	}

	function showNet() {
		viewMode = 'net';
	}

	function cubeSettled() {
		if (viewMode !== 'net') return;
		netHidden = false;
		cubeMounted = false;
	}

	function resetCube() {
		viewMode = 'net';
		netHidden = false;
		cubeMounted = false;
	}

	let sidebarOpen = $state(true);
	const NARROW = '(max-width: 640px)';
	const isNarrow = () => typeof matchMedia === 'function' && matchMedia(NARROW).matches;

	function selectNet(i: number) {
		setView(() => (netIndex = i));
		if (isNarrow()) sidebarOpen = false;
	}

	let pen = $state<Pen>('white');
	let axis = $state<Axis>('across');
	let editing = $state<{ run: Run; idx: number } | null>(null);
	let painting = false;
	let lastPaint = { key: '', time: 0 };

	let winW = $state(1200);
	const narrow = $derived(winW <= 640);
	const PANEL_GAP = 24;

	let stageW = $state(800);
	let stageH = $state(600);
	let input = $state<HTMLInputElement>();

	let dpr = $state(1);
	$effect(() => {
		let mq: MediaQueryList | undefined;
		const update = () => {
			mq?.removeEventListener('change', update);
			dpr = window.devicePixelRatio || 1;
			mq = matchMedia(`(resolution: ${dpr}dppx)`);
			mq.addEventListener('change', update);
		};
		update();
		return () => mq?.removeEventListener('change', update);
	});

	const cellDev = $derived.by(() => {
		if (!view) return Math.round(32 * dpr);
		const side = numbering && !narrow ? panelW + PANEL_GAP : 0;
		const below = numbering && narrow ? panelH + PANEL_GAP : 0;
		const fit = Math.min((stageW - 48 - side) / view.cols, (stageH - 48 - below) / view.rows);
		return Math.max(Math.round(12 * dpr), Math.min(Math.round(64 * dpr), Math.floor(fit * dpr)));
	});
	const cell = $derived(cellDev / dpr);

	const edgesPath = $derived.by(() => {
		if (!view || n === null) return '';
		const k = 1 / cellDev;
		let d = '';
		for (const face of view.faces)
			for (const b of edgeBars(face.folds, n, cellDev, dpr, false))
				d += `M${face.col + b.x * k} ${face.row + b.y * k}h${b.w * k}v${b.h * k}h${-b.w * k}z`;
		return d;
	});

	let shift = $state({ x: 0, y: 0 });
	function alignSheet() {
		const svg = sheet?.querySelector('svg');
		if (!svg) return;
		const r = svg.getBoundingClientRect();
		const snap = (v: number) => {
			const origin = Math.round(v) * dpr;
			return (Math.round(origin) - origin) / dpr;
		};
		const x = snap(r.left);
		const y = snap(r.top);
		if (Math.abs(x - shift.x) > 1e-3 || Math.abs(y - shift.y) > 1e-3) shift = { x, y };
	}
	let layoutEl = $state<HTMLDivElement>();
	$effect(() => {
		void [cellDev, dpr, view, numbering, sidebarOpen, winW];
		const els = [layoutEl, sheet].filter((e): e is HTMLDivElement => !!e);
		if (!els.length) return;
		let frame = 0;
		const queue = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(alignSheet);
		};
		const ro = new ResizeObserver(queue);
		for (const e of els) ro.observe(e);
		if (layoutEl?.parentElement) ro.observe(layoutEl.parentElement);
		queue();
		return () => {
			cancelAnimationFrame(frame);
			ro.disconnect();
		};
	});

	const panelW = $derived(
		narrow ? Math.max(0, stageW - 48) : Math.round(Math.min(384, Math.max(256, stageW * 0.3)))
	);
	const panelH = $derived(narrow ? Math.round(stageH * 0.4) : view ? view.rows * cell : 0);

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
		clues = {};
		activeClue = null;
		title = '';
		netIndex = 0;
		transform = IDENTITY;
		pen = 'white';
		axis = 'across';
		editing = null;
		resetCube();
		sidebarOpen = !isNarrow();
		n = size;
	}

	let importError = $state('');
	let importInput = $state<HTMLInputElement>();

	const TRANSFORMS: Transform[] = (() => {
		const out: Transform[] = [];
		let m = IDENTITY;
		for (let i = 0; i < 4; i++) {
			out.push(m, flipH(m));
			m = rotateCW(m);
		}
		return out;
	})();

	function parsePuzzle(data: unknown) {
		if (typeof data !== 'object' || data === null) throw new Error('That file isn’t a puzzle.');
		const d = data as Record<string, unknown>;
		if (d.format !== 'nets-crossword') throw new Error('That file isn’t a Nets puzzle.');
		const size = d.size;
		if (typeof size !== 'number' || !Number.isInteger(size) || size < MIN_N || size > MAX_N)
			throw new Error(`Face size must be between ${MIN_N} and ${MAX_N}.`);
		if (typeof d.grid !== 'object' || d.grid === null) throw new Error('The grid is missing.');
		const src = d.grid as Record<string, unknown>;
		const fresh: Record<string, Square> = {};
		for (const k of allKeys(size)) {
			const sq = src[k] as Record<string, unknown> | undefined;
			if (typeof sq !== 'object' || sq === null) throw new Error('The grid is incomplete.');
			const black = sq.black === true;
			const letter = typeof sq.letter === 'string' ? sq.letter.trim().toLocaleUpperCase() : '';
			fresh[k] = { black, letter: black ? '' : letter };
		}
		const importedClues: Record<string, string> = {};
		if (typeof d.clues === 'object' && d.clues !== null)
			for (const [id, v] of Object.entries(d.clues))
				if (typeof v === 'string') importedClues[id] = v;
		let idx = 0;
		let tf: Transform = IDENTITY;
		const layout = d.layout as Record<string, unknown> | undefined;
		if (typeof layout === 'object' && layout !== null) {
			const ni = layout.netIndex;
			if (typeof ni === 'number' && Number.isInteger(ni) && ni >= 0 && ni < NETS.length) idx = ni;
			const t = layout.transform;
			if (Array.isArray(t)) tf = TRANSFORMS.find((m) => m.every((v, i) => v === t[i])) ?? IDENTITY;
		}
		const puzzleTitle = typeof d.title === 'string' ? d.title : '';
		return {
			size,
			grid: fresh,
			clues: importedClues,
			netIndex: idx,
			transform: tf,
			title: puzzleTitle
		};
	}

	async function importFile(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const file = el.files?.[0];
		el.value = '';
		if (!file) return;
		importError = '';
		let p: ReturnType<typeof parsePuzzle>;
		try {
			p = parsePuzzle(JSON.parse(await file.text()));
		} catch (err) {
			importError =
				err instanceof SyntaxError
					? 'That file isn’t valid JSON.'
					: err instanceof Error
						? err.message
						: 'Couldn’t read that file.';
			return;
		}
		grid = p.grid;
		clues = p.clues;
		activeClue = null;
		title = p.title;
		netIndex = p.netIndex;
		transform = p.transform;
		pen = 'white';
		axis = 'across';
		editing = null;
		resetCube();
		sidebarOpen = !isNarrow();
		sizeInput = p.size;
		n = p.size;
	}

	function newGrid() {
		const used =
			Object.values(grid).some((s) => s.black || s.letter) ||
			Object.keys(clues).length > 0 ||
			title.trim() !== '';
		if (used && !confirm('Start a new grid? This clears the current puzzle.')) return;
		editing = null;
		resetCube();
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
		if (n === null || viewMode === 'cube' || e.code !== 'Space') return;
		const t = e.target as HTMLElement | null;
		if ((t instanceof HTMLInputElement && t !== input) || t instanceof HTMLTextAreaElement) return;
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

<svelte:window
	bind:innerWidth={winW}
	onkeydown={onWindowKey}
	onpointerup={() => (painting = false)}
/>

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
					Create
				</button>
				<div class="or" aria-hidden="true">or</div>
				<button type="button" class="secondary" onclick={() => importInput?.click()}>
					Import JSON
				</button>
				<input
					bind:this={importInput}
					type="file"
					accept=".json,application/json"
					hidden
					onchange={importFile}
				/>
				{#if importError}
					<p class="import-error" role="alert">{importError}</p>
				{/if}
			</form>
		</section>
	{:else if view}
		<div class="workspace" class:open={sidebarOpen}>
			<aside class="sidebar" class:open={sidebarOpen}>
				<nav id="net-list" class="nets" aria-label="Cube nets" hidden={!sidebarOpen}>
					{#each FAMILIES as family (family.name)}
						<div class="family" role="group" aria-label="{family.name} family">
							<div class="family-label">{family.name}</div>
							<div class="family-nets">
								{#each family.nets as i (i)}
									<button
										class="net"
										class:active={netIndex === i}
										aria-pressed={netIndex === i}
										aria-label="Net {i + 1} of {NETS.length}, {family.name} family"
										title="Net {i + 1} ({family.name})"
										onmousedown={keepFocus}
										onclick={() => selectNet(i)}
									>
										<NetIcon net={NETS[i]} {transform} size={72} />
									</button>
								{/each}
							</div>
						</div>
					{/each}
				</nav>
			</aside>

			<button
				class="handle"
				aria-expanded={sidebarOpen}
				aria-controls="net-list"
				aria-label={sidebarOpen ? 'Hide nets' : 'Show nets'}
				title={sidebarOpen ? 'Hide nets' : 'Show nets'}
				onmousedown={keepFocus}
				onclick={() => (sidebarOpen = !sidebarOpen)}
			>
				<svg viewBox="0 0 12 20" aria-hidden="true">
					{#if sidebarOpen}
						<path d="M7.5 6 3.5 10l4 4" />
					{:else}
						<path d="M4.5 6l4 4-4 4" />
					{/if}
				</svg>
			</button>

			{#if sidebarOpen}
				<div class="scrim" aria-hidden="true" onclick={() => (sidebarOpen = false)}></div>
			{/if}

			<div class="main">
				<header class="bar">
					<div class="row">
						<div class="tools">
							<button class="chip quiet" onclick={newGrid}>New grid</button>

							<div class="group" role="group" aria-label="View">
								<button
									class="seg"
									class:on={viewMode === 'net'}
									aria-pressed={viewMode === 'net'}
									onmousedown={keepFocus}
									onclick={showNet}
									title="Show the flat net"
								>
									<svg viewBox="0 0 20 20" aria-hidden="true">
										<path d="M8 2h4v4h4v4h-4v8H8v-8H4V6h4z" />
										<path d="M8 6h4M8 10h4M8 14h4" class="crease" />
									</svg>
									Net
								</button>
								<button
									class="seg"
									class:on={viewMode === 'cube'}
									aria-pressed={viewMode === 'cube'}
									onmousedown={keepFocus}
									onpointerenter={loadCube}
									onfocus={loadCube}
									onclick={showCube}
									title="Fold the net into a cube"
								>
									<svg viewBox="0 0 20 20" aria-hidden="true">
										<path d="M10 2.5l6.5 3.75v7.5L10 17.5l-6.5-3.75v-7.5z" />
										<path d="M3.5 6.25 10 10l6.5-3.75M10 10v7.5" />
									</svg>
									Cube
								</button>
							</div>

							<button
								class="pen"
								disabled={viewMode === 'cube'}
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
								disabled={viewMode === 'cube'}
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

							{#if numbering}
								<button
									class="chip"
									onmousedown={keepFocus}
									onclick={download}
									title="Download the puzzle as JSON"
								>
									<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
										<path d="M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.5h11" />
									</svg>
									Download
								</button>
							{/if}
						</div>
					</div>
				</header>

				<div class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH}>
					<div class="layout" class:narrow bind:this={layoutEl}>
						<!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_tabindex -->
						<div
							bind:this={sheet}
							class="sheet"
							class:cube={viewMode === 'cube'}
							style:width="{view.cols * cell}px"
							style:height="{view.rows * cell}px"
							style:cursor={viewMode === 'cube' ? null : cursorFor(pen)}
							role={viewMode === 'cube' ? 'application' : undefined}
							aria-label={viewMode === 'cube'
								? 'The puzzle folded into a cube. Drag or use the arrow keys to turn it.'
								: undefined}
							tabindex={viewMode === 'cube' ? 0 : undefined}
							onmousedown={keepFocus}
						>
							<svg
								class:away={netHidden}
								aria-hidden={netHidden}
								width={view.cols * cell}
								height={view.rows * cell}
								viewBox="{-shift.x / cell} {-shift.y / cell} {view.cols} {view.rows}"
								aria-label="Crossword grid, six faces of {n} by {n}"
								role="img"
							>
								{#each view.faces as face, fi (fi)}
									{#each face.cells as rowKeys, r (r)}
										{#each rowKeys as key, c (key)}
											{@const sq = grid[key]}
											{@const num = numbering?.numbers.get(key)}
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<rect
												x={face.col + c}
												y={face.row + r}
												width="1"
												height="1"
												class="sq"
												class:black={sq.black}
												class:run={runSet.has(key) || clueSet.has(key)}
												class:caret={key === caretKey}
												onpointerdown={(e) => onCellDown(e, key)}
												onpointerenter={(e) => onCellEnter(e, key)}
												ondblclick={() => onCellDouble(key)}
											/>
											{#if sq.letter && !sq.black}
												<text x={face.col + c + 0.5} y={face.row + r + (num ? 0.6 : 0.54)}
													>{sq.letter}</text
												>
											{/if}
											{#if num}
												<text class="num" x={face.col + c + 0.06} y={face.row + r + 0.05}
													>{num}</text
												>
											{/if}
										{/each}
									{/each}
								{/each}

								<path class="edges" d={edgesPath} />

								{#if caretPos && caretArrow}
									<polygon
										class="arrow"
										points={arrowPoints(caretArrow, caretPos.col, caretPos.row)}
									/>
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

						{#if numbering}
							<aside
								class="clues"
								aria-label="Clues"
								style:width="{panelW}px"
								style:height="{panelH}px"
							>
								<div class="title-field">
									<input
										id="puzzle-title"
										type="text"
										placeholder="Untitled puzzle"
										autocomplete="off"
										spellcheck="true"
										bind:value={title}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === 'Escape') {
												e.preventDefault();
												e.currentTarget.blur();
											}
										}}
									/>
								</div>
								{#each [['across', 'Across'], ['down', 'Down']] as const as [ax, title] (ax)}
									<section class="clue-col">
										<h2>{title}</h2>
										{#if clueLists[ax].length === 0}
											<p class="empty">No {ax} entries.</p>
										{:else}
											<ol>
												{#each clueLists[ax] as c (c.id)}
													<li class:active={activeClue === c.id}>
														<label for="clue-{c.id}" class="clue-num">{c.number}</label>
														<textarea
															id="clue-{c.id}"
															rows="1"
															value={clueText(c)}
															aria-label="{c.number} {title}, {c.word}"
															spellcheck="true"
															oninput={(e) => (clues[c.id] = e.currentTarget.value)}
															onfocus={() => (activeClue = c.id)}
															onblur={() => {
																if (activeClue === c.id) activeClue = null;
															}}
															onkeydown={(e) => {
																if (e.key === 'Enter' || e.key === 'Escape') {
																	e.preventDefault();
																	e.currentTarget.blur();
																}
															}}></textarea>
														<span class="answer">{c.word} ({c.word.length})</span>
													</li>
												{/each}
											</ol>
										{/if}
									</section>
								{/each}
							</aside>
						{/if}
					</div>

					{#if cubeMounted && cubeModule && sheet && n !== null}
						{#await cubeModule then { default: CubeView }}
							<svelte:boundary onerror={resetCube}>
								<CubeView
									{view}
									{n}
									{cell}
									{grid}
									numbers={numbering?.numbers}
									highlight={clueSet}
									folded={viewMode === 'cube'}
									surface={sheet}
									onready={() => (netHidden = true)}
									onsettled={cubeSettled}
								/>
							</svelte:boundary>
						{/await}
					{/if}
				</div>
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
	.or {
		margin: 0.6rem 0;
		text-align: center;
		font-size: 0.8rem;
		color: #6b706d;
	}
	.secondary {
		width: 100%;
		padding: 0.6rem 1rem;
		border: 2px solid var(--ink);
		background: var(--paper);
		color: var(--ink);
		font-weight: 600;
		font-size: 0.9rem;
	}
	.secondary:hover {
		background: #f1f1ee;
	}
	.setup .import-error {
		margin: 0.75rem 0 0;
		font-size: 0.85rem;
		color: #b3261e;
	}
	.primary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.workspace {
		--sidebar-w: 168px;
		flex: 1;
		min-height: 0;
		display: flex;
		position: relative;
	}
	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.sidebar {
		flex: 0 0 auto;
		width: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.75rem 0;
		background: rgb(0 0 0 / 0.2);
		overflow: hidden;
		transition:
			width 180ms ease,
			padding 180ms ease;
	}
	.sidebar.open {
		width: var(--sidebar-w);
		padding: 0.75rem;
		border-right: 1px solid rgb(255 255 255 / 0.14);
		overflow-x: hidden;
		overflow-y: auto;
		scrollbar-width: none;
	}
	.sidebar.open::-webkit-scrollbar {
		display: none;
	}

	.handle {
		position: absolute;
		top: 50%;
		left: 0.375rem;
		z-index: 3;
		transform: translateY(-50%);
		transition: left 180ms ease;
		width: 1.25rem;
		height: 3rem;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid rgb(255 255 255 / 0.28);
		border-radius: 999px;
		background: var(--mat);
		box-shadow: 0 2px 6px rgb(0 0 0 / 0.3);
	}
	.workspace.open .handle {
		left: calc(var(--sidebar-w) - 0.625rem);
	}
	.handle:hover {
		border-color: var(--rule);
	}
	.handle svg {
		width: 12px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.scrim {
		display: none;
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
	.pen:disabled,
	.chip:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		background: rgb(0 0 0 / 0.18);
	}

	.seg {
		height: 2.25rem;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0 0.7rem 0 0.55rem;
		border: 1px solid rgb(255 255 255 / 0.28);
		background: rgb(0 0 0 / 0.18);
		font-size: 0.875rem;
		font-weight: 500;
		transition:
			background 120ms,
			color 120ms;
	}
	.seg:hover {
		background: rgb(0 0 0 / 0.32);
	}
	.seg + .seg {
		border-left: 0;
	}
	.seg:first-child {
		border-radius: 4px 0 0 4px;
	}
	.seg:last-child {
		border-radius: 0 4px 4px 0;
	}
	.seg.on {
		background: var(--on-mat);
		border-color: var(--on-mat);
		color: var(--mat);
		cursor: default;
	}
	.seg svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.seg svg .crease {
		stroke-width: 1;
		stroke-dasharray: 1.5 1.5;
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
		flex-direction: column;
		gap: 1rem;
	}
	.sidebar .nets {
		flex: 0 0 auto;
		width: calc(var(--sidebar-w) - 1.5rem);
	}
	.nets[hidden] {
		display: none;
	}
	.family {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.family + .family {
		padding-top: 1rem;
		border-top: 1px solid rgb(255 255 255 / 0.18);
	}
	.family-label {
		cursor: default;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		font-variant-numeric: tabular-nums;
	}
	.family-nets {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.4rem;
	}
	.net {
		flex: 0 0 auto;
		width: 100%;
		height: 5.5rem;
		padding: 0;
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

	.layout {
		display: flex;
		align-items: flex-start;
		gap: 24px;
	}
	.layout.narrow {
		flex-direction: column;
		align-items: center;
	}

	.clues {
		flex: 0 0 auto;
		box-sizing: border-box;
		display: grid;
		grid-template-columns: 1fr 1fr;
		align-content: start;
		gap: 1rem;
		padding: 0.75rem 1rem 1rem;
		overflow-y: auto;
		scrollbar-width: none;
		background: rgb(0 0 0 / 0.2);
		border: 1px solid rgb(255 255 255 / 0.14);
	}
	.clues::-webkit-scrollbar {
		display: none;
	}
	.clue-col {
		min-width: 0;
	}
	.title-field {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.title-field input {
		min-width: 0;
		box-sizing: border-box;
		font: inherit;
		font-size: 1rem;
		font-weight: 600;
		color: inherit;
		background: transparent;
		border: 0;
		border-bottom: 1px dashed rgb(255 255 255 / 0.3);
		border-radius: 0;
		padding: 0.2rem 0;
	}
	.title-field input::placeholder {
		color: var(--on-mat-dim);
		font-weight: 500;
	}
	.title-field input:hover {
		border-bottom-color: rgb(255 255 255 / 0.6);
	}
	.title-field input:focus-visible {
		outline: none;
		border-bottom: 1px solid var(--rule);
	}
	.clues h2 {
		margin: 0 0 0.5rem;
		padding-bottom: 0.35rem;
		border-bottom: 1px solid rgb(255 255 255 / 0.18);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.clues ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.clues li {
		display: grid;
		grid-template-columns: 1.6rem 1fr;
		column-gap: 0.25rem;
		align-items: baseline;
		padding: 0.25rem 0.3rem;
		border-radius: 4px;
		border: 1px solid transparent;
	}
	.clues li.active {
		background: rgb(0 0 0 / 0.22);
		border-color: var(--rule);
	}
	.clue-num {
		font-weight: 700;
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
		padding-right: 0.2rem;
	}
	.clues textarea {
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		resize: none;
		field-sizing: content;
		font: inherit;
		font-size: 0.85rem;
		line-height: 1.35;
		color: inherit;
		background: transparent;
		border: 0;
		border-bottom: 1px dashed rgb(255 255 255 / 0.3);
		border-radius: 0;
		padding: 0.1rem 0;
		overflow: hidden;
	}
	.clues textarea:hover {
		border-bottom-color: rgb(255 255 255 / 0.6);
	}
	.clues textarea:focus-visible {
		outline: none;
		border-bottom: 1px solid var(--rule);
	}
	.answer {
		grid-column: 2;
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		color: var(--on-mat-dim);
		overflow-wrap: anywhere;
	}
	.empty {
		margin: 0;
		font-size: 0.8rem;
		color: var(--on-mat-dim);
	}

	.stage {
		position: relative;
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
	.sheet svg.away {
		visibility: hidden;
	}
	.sheet.cube {
		cursor: grab;
		touch-action: none;
	}
	.sheet.cube:active {
		cursor: grabbing;
	}
	.sheet.cube:focus-visible {
		outline: 2px solid var(--rule);
		outline-offset: 6px;
	}

	.sq {
		fill: var(--paper);
	}
	.sq.black {
		fill: #000;
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
	text.num {
		font-size: 0.27px;
		font-weight: 500;
		text-anchor: start;
		dominant-baseline: hanging;
	}

	path.edges {
		fill: #000;
		pointer-events: none;
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
		.sidebar {
			position: absolute;
			top: 0;
			bottom: 0;
			left: 0;
			z-index: 2;
			background: var(--mat);
		}
		.sidebar.open {
			box-shadow: 4px 0 18px rgb(0 0 0 / 0.35);
		}
		.scrim {
			display: block;
			position: absolute;
			inset: 0;
			z-index: 1;
			background: rgb(0 0 0 / 0.3);
		}
		.pen-label,
		kbd {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.swatch,
		.seg,
		.sidebar,
		.handle {
			transition: none;
		}
	}
</style>
