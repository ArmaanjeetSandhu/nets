<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { untrack } from 'svelte';
	import { devicePixelRatio } from 'svelte/reactivity/window';
	import * as THREE from 'three';
	import { normalOf, parseKey, type View } from './cube';
	import {
		CUBE_BODY,
		drawFace,
		LETTER_NUMBERED_SHIFT,
		PAPER,
		RUN,
		TILE_GAP,
		TILE_RADIUS,
		type FaceStyle
	} from './faceTexture';
	import { buildGlyphAtlas } from './glyphAtlas';

	type CubeSceneProps = {
		view: View;
		n: number;
		cell: number;
		grid: FaceStyle['grid'];
		numbers?: FaceStyle['numbers'];
		highlight: FaceStyle['highlight'];
		folded: boolean;
		surface: HTMLElement;
		anchor: HTMLElement;
		onready?: () => void;
		onsettled?: () => void;
	};

	let {
		view,
		n,
		cell,
		grid,
		numbers,
		highlight,
		folded,
		surface,
		anchor,
		onready,
		onsettled
	}: CubeSceneProps = $props();

	const { invalidate, dom, renderer } = useThrelte();

	const HALF_PI = Math.PI / 2;
	const X = new THREE.Vector3(1, 0, 0);
	const Y = new THREE.Vector3(0, 1, 0);
	const FLAT = new THREE.Quaternion();
	const ISO = new THREE.Quaternion().setFromEuler(
		new THREE.Euler(Math.atan(Math.SQRT1_2), -Math.PI / 4, 0, 'XYZ')
	);
	const ISO_ANGLE = FLAT.angleTo(ISO);
	const TURN_MS = 900;
	const FOLD_MS = 1500;
	const LIGHT = new THREE.Vector3(-0.5, 0.75, 0.45).normalize();
	const SHADE = 0.42;
	const BACK = new THREE.Color('#dedcd3');
	const BODY = new THREE.Color(CUBE_BODY);

	const reduced =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

	const pivot = new THREE.Group();
	const content = new THREE.Group();
	pivot.add(content);

	interface Layer {
		canvas: HTMLCanvasElement;
		texture: THREE.CanvasTexture;
	}

	interface FaceNode {
		index: number;
		group: THREE.Group;
		front: THREE.ShaderMaterial;
		back: THREE.MeshBasicMaterial;
		net: Layer;
		cells: THREE.DataTexture;
		folded: THREE.Quaternion;
	}

	interface Hinge {
		group: THREE.Group;
		axis: 'x' | 'y';
		sign: 1 | -1;
	}

	interface Structure {
		view: View;
		n: number;
		root: THREE.Group;
		faces: FaceNode[];
		hinges: Hinge[];
		geometry: THREE.PlaneGeometry;
		centre: THREE.Vector3;
		keyFace: Map<string, number>;
	}

	const FRONT_VERTEX = /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`;
	const FRONT_FRAGMENT = /* glsl */ `
		uniform sampler2D netMap;
		uniform sampler2D cellMap;
		uniform sampler2D glyphMap;
		uniform sampler2D slotMap;
		uniform float cells;
		uniform float glyphScale;
		uniform vec2 glyphSize;
		uniform vec3 paper;
		uniform vec3 run;
		uniform vec3 body;
		uniform float look;
		uniform float shade;
		varying vec2 vUv;

		const float GAP = ${TILE_GAP.toFixed(4)};
		const float RADIUS = ${TILE_RADIUS.toFixed(4)};
		const float SHIFT = ${LETTER_NUMBERED_SHIFT.toFixed(4)};

		vec4 glyph(int slot, vec2 f, vec2 dx, vec2 dy) {
			vec4 rect = texelFetch(slotMap, ivec2(slot * 2, 0), 0);
			vec2 origin = texelFetch(slotMap, ivec2(slot * 2 + 1, 0), 0).xy;
			vec2 q = (f - origin) * glyphScale;
			if (q.x < 0.0 || q.y < 0.0 || q.x > rect.z || q.y > rect.w) return vec4(0.0);
			vec2 k = glyphScale / glyphSize;
			return textureGrad(glyphMap, (rect.xy + q) / glyphSize, dx * k, dy * k);
		}

		vec3 cubeLook() {
			vec2 p = vec2(vUv.x, 1.0 - vUv.y) * cells;
			vec2 dx = dFdx(p);
			vec2 dy = dFdy(p);
			vec2 cell = clamp(floor(p), 0.0, cells - 1.0);
			vec2 f = p - cell;

			vec2 e = abs(fract(p) - 0.5) - (0.5 - GAP * 0.5 - RADIUS);
			float d = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - RADIUS;
			float aa = max(length(vec2(dFdx(d), dFdy(d))), 1e-5);
			float cover = clamp(0.5 - d / aa, 0.0, 1.0);

			ivec4 data = ivec4(texelFetch(cellMap, ivec2(cell), 0) + 0.5);
			if (data.r == 0) return body;
			vec3 col = mix(body, data.r == 2 ? run : paper, cover);
			vec4 g;
			if (data.g > 0) {
				g = glyph(data.g - 1, f - vec2(0.0, data.b > 0 ? SHIFT : 0.0), dx, dy);
				col = col * (1.0 - g.a) + g.rgb;
			}
			if (data.b > 0) {
				g = glyph(data.b - 1, f, dx, dy);
				col = col * (1.0 - g.a) + g.rgb;
			}
			return col;
		}

		void main() {
			vec3 net = texture2D(netMap, vUv).rgb;
			vec3 cube = cubeLook();
			gl_FragColor = vec4(mix(net, cube, look) * shade, 1.0);
			#include <colorspace_fragment>
		}
	`;

	const glyphs = {
		glyphMap: { value: null as THREE.Texture | null },
		slotMap: { value: null as THREE.DataTexture | null },
		glyphScale: { value: 1 },
		glyphSize: { value: new THREE.Vector2(1, 1) }
	};
	let atlasKey = '';
	let glyphSlots: ReturnType<typeof buildGlyphAtlas> | null = null;

	function makeTexture(canvas: HTMLCanvasElement) {
		const t = new THREE.CanvasTexture(canvas);
		t.colorSpace = THREE.SRGBColorSpace;
		t.anisotropy = (renderer as THREE.WebGLRenderer).capabilities?.getMaxAnisotropy?.() ?? 1;
		return t;
	}

	function build(v: View, size: number): Structure {
		const geometry = new THREE.PlaneGeometry(size, size).translate(size / 2, -size / 2, 0);
		const cx = v.cols / 2;
		const cy = v.rows / 2;
		type F = (typeof v.faces)[number];
		const adjacent = (a: F, b: F) =>
			(Math.abs(a.row - b.row) === size && a.col === b.col) ||
			(Math.abs(a.col - b.col) === size && a.row === b.row);
		const degree = v.faces.map((f) => v.faces.filter((g) => adjacent(f, g)).length);
		const spread = (f: F) => Math.hypot(f.col + size / 2 - cx, f.row + size / 2 - cy);

		let root = 0;
		v.faces.forEach((f, i) => {
			if (
				degree[i] > degree[root] ||
				(degree[i] === degree[root] && spread(f) < spread(v.faces[root]))
			)
				root = i;
		});

		const faces: FaceNode[] = v.faces.map((_, index) => {
			const group = new THREE.Group();
			const canvas = document.createElement('canvas');
			const net: Layer = { canvas, texture: makeTexture(canvas) };
			const cells = new THREE.DataTexture(
				new Float32Array(size * size * 4),
				size,
				size,
				THREE.RGBAFormat,
				THREE.FloatType
			);
			const front = new THREE.ShaderMaterial({
				uniforms: {
					netMap: { value: net.texture },
					cellMap: { value: cells },
					...glyphs,
					cells: { value: size },
					paper: { value: new THREE.Color(PAPER) },
					run: { value: new THREE.Color(RUN) },
					body: { value: BODY },
					look: { value: 0 },
					shade: { value: 1 }
				},
				vertexShader: FRONT_VERTEX,
				fragmentShader: FRONT_FRAGMENT,
				side: THREE.FrontSide
			});
			const back = new THREE.MeshBasicMaterial({ color: BACK, side: THREE.BackSide });
			group.add(new THREE.Mesh(geometry, front), new THREE.Mesh(geometry, back));
			return { index, group, front, back, net, cells, folded: new THREE.Quaternion() };
		});

		const rf = v.faces[root];
		const rootGroup = faces[root].group;
		rootGroup.position.set(rf.col - cx, -(rf.row - cy), 0);

		const hinges: Hinge[] = [];
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, not state
		const seen = new Set([root]);
		const queue = [root];
		while (queue.length) {
			const p = queue.shift()!;
			const pf = v.faces[p];
			v.faces.forEach((cf, c) => {
				if (seen.has(c) || !adjacent(pf, cf)) return;
				seen.add(c);
				queue.push(c);
				const hinge = new THREE.Group();
				const child = faces[c].group;
				let axis: Hinge['axis'];
				let sign: Hinge['sign'];
				if (cf.col > pf.col) {
					hinge.position.set(size, 0, 0);
					[axis, sign] = ['y', 1];
				} else if (cf.col < pf.col) {
					child.position.set(-size, 0, 0);
					[axis, sign] = ['y', -1];
				} else if (cf.row > pf.row) {
					hinge.position.set(0, -size, 0);
					[axis, sign] = ['x', 1];
				} else {
					child.position.set(0, size, 0);
					[axis, sign] = ['x', -1];
				}
				hinge.add(child);
				faces[p].group.add(hinge);
				hinges.push({ group: hinge, axis, sign });
				const turn = new THREE.Quaternion().setFromAxisAngle(axis === 'x' ? X : Y, sign * HALF_PI);
				faces[c].folded.copy(faces[p].folded).multiply(turn);
			});
		}

		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, not state
		const keyFace = new Map<string, number>();
		v.faces.forEach((f, i) => f.cells.flat().forEach((k) => keyFace.set(k, i)));

		return {
			view: v,
			n: size,
			root: rootGroup,
			faces,
			hinges,
			geometry,
			centre: new THREE.Vector3(
				rootGroup.position.x + size / 2,
				rootGroup.position.y - size / 2,
				-size / 2
			),
			keyFace
		};
	}

	function dispose(s: Structure) {
		content.remove(s.root);
		s.geometry.dispose();
		for (const f of s.faces) {
			f.net.texture.dispose();
			f.cells.dispose();
			f.front.dispose();
			f.back.dispose();
		}
	}

	function basis(s: Structure, key: string) {
		const f = s.faces[s.keyFace.get(key)!];
		const local = new THREE.Matrix4().makeBasis(
			X.clone().applyQuaternion(f.folded),
			new THREE.Vector3(0, -1, 0).applyQuaternion(f.folded),
			new THREE.Vector3(0, 0, 1).applyQuaternion(f.folded)
		);
		const a = s.view.axes.get(key)!;
		const cube = new THREE.Matrix4().makeBasis(
			new THREE.Vector3(...a.right),
			new THREE.Vector3(...a.down),
			new THREE.Vector3(...normalOf(parseKey(key), s.n))
		);
		return local.multiply(cube.transpose());
	}

	let s: Structure | null = null;
	let fold = 0;
	const q = new THREE.Quaternion();
	const omega = new THREE.Vector3();
	const pos = new THREE.Vector3();
	const shift = new THREE.Vector3();
	let flatSize = 1;
	let cubeSize = 1;
	let scale = 1;

	type Step = { kind: 'fold'; to: number } | { kind: 'turn'; to: THREE.Quaternion };
	type Active =
		| { kind: 'fold'; from: number; to: number; dur: number; t: number }
		| { kind: 'turn'; from: THREE.Quaternion; to: THREE.Quaternion; dur: number; t: number };
	let steps: Step[] = [];
	let active: Active | null = null;
	let drag: { id: number; x: number; y: number; t: number } | null = null;

	let built = $state(0);
	let fontsTick = $state(0);

	function rebuild(v: View, size: number) {
		const old = s;
		const next = build(v, size);
		if (old && old.n === size && fold > 0) {
			const key = v.faces[0].cells[0][0];
			const c = basis(old, key).multiply(basis(next, key).transpose());
			q.multiply(new THREE.Quaternion().setFromRotationMatrix(c)).normalize();
		}
		if (old) dispose(old);
		content.add(next.root);
		s = next;
		pose();
		invalidate();
	}

	$effect(() => {
		const v = view;
		const size = n;
		untrack(() => {
			rebuild(v, size);
			built++;
		});
	});

	$effect(() => {
		let alive = true;
		const fonts = document.fonts;
		if (fonts)
			Promise.all([
				fonts.load(`600 32px "Libre Franklin"`),
				fonts.load(`500 32px "Libre Franklin"`)
			]).then(() => {
				if (alive) fontsTick++;
			});
		return () => {
			alive = false;
		};
	});

	$effect(() => {
		void built;
		void fontsTick;
		const v = view;
		const size = n;
		const black = new Set(
			[...v.pos].filter(([key]) => grid[key]?.black).map(([, p]) => `${p.col},${p.row}`)
		);
		const style: FaceStyle = {
			grid,
			numbers,
			highlight,
			blackAt: (col, row) => black.has(`${col},${row}`)
		};
		if (!s || s.view !== v) return;

		const dpr = devicePixelRatio.current ?? 1;
		const px = Math.max(16, Math.min(Math.floor(1024 / size), Math.round(cell * dpr)));
		for (const f of s.faces) {
			const layer = f.net;
			const resized = layer.canvas.width !== size * px;
			drawFace(layer.canvas, v.faces[f.index], size, px, px / cell, style);
			if (resized) {
				layer.texture.dispose();
				layer.texture = makeTexture(layer.canvas);
				f.front.uniforms.netMap.value = layer.texture;
			} else layer.texture.needsUpdate = true;
		}

		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, not state
		const letters = new Set<string>();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, not state
		const nums = new Set<number>();
		for (const face of v.faces)
			for (const key of face.cells.flat()) {
				const sq = grid[key];
				if (!sq || sq.black) continue;
				if (sq.letter) letters.add(sq.letter);
				const num = numbers?.get(key);
				if (num) nums.add(num);
			}
		const letterList = [...letters].sort();
		const numberList = [...nums].sort((a, b) => a - b);
		const key = `${fontsTick}|${numberList.join(',')}|${letterList.join('\u0000')}`;
		if (key !== atlasKey || !glyphs.glyphMap.value) {
			atlasKey = key;
			const gl = (renderer as THREE.WebGLRenderer).capabilities;
			const atlas = buildGlyphAtlas(letterList, numberList, gl?.maxTextureSize ?? 4096);
			glyphs.glyphMap.value?.dispose();
			glyphs.slotMap.value?.dispose();
			const texture = makeTexture(atlas.canvas);
			texture.flipY = false;
			texture.premultiplyAlpha = true;
			glyphs.glyphMap.value = texture;
			const slotMap = new THREE.DataTexture(
				atlas.slots,
				atlas.slots.length / 4,
				1,
				THREE.RGBAFormat,
				THREE.FloatType
			);
			slotMap.needsUpdate = true;
			glyphs.slotMap.value = slotMap;
			glyphs.glyphScale.value = atlas.scale;
			glyphs.glyphSize.value.set(atlas.canvas.width, atlas.canvas.height);
			glyphSlots = atlas;
		}

		const atlas = glyphSlots!;
		for (const f of s.faces) {
			const data = f.cells.image.data as Float32Array;
			const rows = v.faces[f.index].cells;
			for (let r = 0; r < size; r++)
				for (let c = 0; c < size; c++) {
					const key = rows[r][c];
					const sq = grid[key];
					const i = (r * size + c) * 4;
					if (!sq || sq.black) {
						data.fill(0, i, i + 4);
						continue;
					}
					const num = numbers?.get(key);
					data[i] = highlight.has(key) ? 2 : 1;
					data[i + 1] = sq.letter ? atlas.letters.get(sq.letter)! + 1 : 0;
					data[i + 2] = num ? atlas.numbers.get(num)! + 1 : 0;
					data[i + 3] = 0;
				}
			f.cells.needsUpdate = true;
		}
		invalidate();
	});

	$effect(() => () => {
		if (s) dispose(s);
		s = null;
		glyphs.glyphMap.value?.dispose();
		glyphs.slotMap.value?.dispose();
		glyphs.glyphMap.value = null;
		glyphs.slotMap.value = null;
		atlasKey = '';
	});

	let settled = false;

	function plan(toCube: boolean) {
		settled = false;
		steps = [];
		active = null;
		omega.set(0, 0, 0);
		if (toCube) {
			if (fold < 1) {
				if (fold === 0) steps.push({ kind: 'turn', to: ISO });
				steps.push({ kind: 'fold', to: 1 });
			}
		} else {
			if (fold > 0) steps.push({ kind: 'turn', to: ISO }, { kind: 'fold', to: 0 });
			steps.push({ kind: 'turn', to: FLAT });
		}
	}

	$effect(() => {
		const f = folded;
		untrack(() => plan(f));
	});

	function next() {
		while (!active && steps.length) {
			const step = steps.shift()!;
			if (step.kind === 'fold') {
				const d = Math.abs(step.to - fold);
				if (d === 0) continue;
				active = { ...step, from: fold, dur: reduced ? 0 : Math.max(250, FOLD_MS * d), t: 0 };
			} else {
				const angle = q.angleTo(step.to);
				if (angle < 1e-5) {
					q.copy(step.to);
					continue;
				}
				const dur = reduced ? 0 : Math.min(1100, Math.max(300, (TURN_MS * angle) / ISO_ANGLE));
				active = { kind: 'turn', from: q.clone(), to: step.to.clone(), dur, t: 0 };
			}
		}
	}

	const normal = new THREE.Vector3();
	function pose() {
		scale = flatSize + (cubeSize - flatSize) * fold;
		pivot.position.copy(pos).add(shift);
		pivot.scale.setScalar(scale);
		pivot.quaternion.copy(q);
		if (!s) return;
		const angle = fold * HALF_PI;
		for (const h of s.hinges) h.group.rotation[h.axis] = h.sign * angle;
		content.position.copy(s.centre).multiplyScalar(-fold);
		pivot.updateMatrixWorld(true);

		const mix = Math.min(1, Math.max(fold, q.angleTo(FLAT) / ISO_ANGLE));
		for (const f of s.faces) {
			normal.setFromMatrixColumn(f.group.matrixWorld, 2).normalize();
			const lit = normal.dot(LIGHT) * 0.5 + 0.5;
			f.front.uniforms.look.value = mix;
			f.front.uniforms.shade.value = 1 - mix * SHADE * (1 - lit);
			f.back.color
				.copy(BACK)
				.lerp(BODY, mix)
				.multiplyScalar(1 - mix * SHADE * lit);
		}
	}

	const interactive = () =>
		folded && fold === 1 && active?.kind !== 'turn' && !steps.some((st) => st.kind === 'turn');

	const spin = new THREE.Quaternion();
	const axis = new THREE.Vector3();
	function turnBy(dx: number, dy: number) {
		const len = Math.hypot(dx, dy);
		if (!len) return 0;
		const angle = (len * 2.4) / (n * scale);
		axis.set(dy / len, dx / len, 0);
		q.premultiply(spin.setFromAxisAngle(axis, angle)).normalize();
		return angle;
	}

	$effect(() => {
		const el = surface;
		const down = (e: PointerEvent) => {
			if (e.button !== 0 || !interactive()) return;
			e.preventDefault();
			el.setPointerCapture(e.pointerId);
			drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
			omega.set(0, 0, 0);
		};
		const move = (e: PointerEvent) => {
			if (!drag || e.pointerId !== drag.id) return;
			const dx = e.clientX - drag.x;
			const dy = e.clientY - drag.y;
			const now = performance.now();
			const dt = Math.max(8, now - drag.t) / 1000;
			const angle = turnBy(dx, dy);
			if (angle) omega.lerp(axis.clone().multiplyScalar(Math.min(14, angle / dt)), 0.6);
			drag = { id: drag.id, x: e.clientX, y: e.clientY, t: now };
			pose();
			invalidate();
		};
		const up = (e: PointerEvent) => {
			if (!drag || e.pointerId !== drag.id) return;
			if (reduced || performance.now() - drag.t > 80) omega.set(0, 0, 0);
			drag = null;
		};
		const QUARTER: Record<string, THREE.Vector3> = {
			ArrowUp: new THREE.Vector3(-1, 0, 0),
			ArrowDown: new THREE.Vector3(1, 0, 0),
			ArrowLeft: new THREE.Vector3(0, -1, 0),
			ArrowRight: new THREE.Vector3(0, 1, 0)
		};
		const key = (e: KeyboardEvent) => {
			const want = QUARTER[e.key];
			if (!want || !folded || fold !== 1 || drag) return;
			e.preventDefault();
			omega.set(0, 0, 0);
			const lastTurn = steps.findLast((st) => st.kind === 'turn');
			const base =
				lastTurn?.kind === 'turn' ? lastTurn.to : active?.kind === 'turn' ? active.to : q;
			let best = new THREE.Vector3();
			for (const unit of [X, Y, new THREE.Vector3(0, 0, 1)])
				for (const sign of [1, -1]) {
					const w = unit.clone().multiplyScalar(sign).applyQuaternion(base);
					if (w.dot(want) > best.dot(want)) best = w;
				}
			const r = new THREE.Quaternion().setFromAxisAngle(best.normalize(), HALF_PI);
			steps.push({ kind: 'turn', to: base.clone().premultiply(r) });
		};
		el.addEventListener('pointerdown', down);
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerup', up);
		el.addEventListener('pointercancel', up);
		el.addEventListener('keydown', key);
		return () => {
			el.removeEventListener('pointerdown', down);
			el.removeEventListener('pointermove', move);
			el.removeEventListener('pointerup', up);
			el.removeEventListener('pointercancel', up);
			el.removeEventListener('keydown', key);
		};
	});

	const target = new THREE.Vector3();
	let frames = 0;

	useTask(
		(delta) => {
			const dt = Math.min(delta, 0.1);
			frames++;
			if (frames === 2) onready?.();

			let changed = false;

			const a = surface.getBoundingClientRect();
			const o = anchor.getBoundingClientRect();
			const d = dom.getBoundingClientRect();
			target.set(
				a.left + a.width / 2 - (o.left + o.width / 2),
				-(a.top + a.height / 2 - (o.top + o.height / 2)),
				0
			);
			const sx = o.left + o.width / 2 - (d.left + d.width / 2);
			const sy = -(o.top + o.height / 2 - (d.top + d.height / 2));
			if (shift.x !== sx || shift.y !== sy) {
				shift.set(sx, sy, 0);
				changed = true;
			}
			const fit = Math.max(cell, Math.min(a.width, a.height) / (1.85 * n));
			if (frames === 1) {
				pos.copy(target);
				flatSize = cell;
				cubeSize = fit;
				changed = true;
			} else if (
				pos.distanceToSquared(target) > 0.01 ||
				Math.abs(flatSize - cell) > 0.001 ||
				Math.abs(cubeSize - fit) > 0.001
			) {
				const k = reduced ? 1 : 1 - Math.exp(-dt * 12);
				pos.lerp(target, k);
				flatSize += (cell - flatSize) * k;
				cubeSize += (fit - cubeSize) * k;
				changed = true;
			}

			if (frames > 2) next();
			if (active) {
				active.t += dt * 1000;
				const p = active.dur ? Math.min(1, active.t / active.dur) : 1;
				const e = ease(p);
				if (active.kind === 'fold') fold = active.from + (active.to - active.from) * e;
				else q.slerpQuaternions(active.from, active.to, e);
				if (p >= 1) {
					if (active.kind === 'fold') fold = active.to;
					else q.copy(active.to);
					active = null;
				}
				changed = true;
			} else if (!drag && omega.lengthSq() > 1e-4) {
				const w = omega.length();
				q.premultiply(spin.setFromAxisAngle(axis.copy(omega).divideScalar(w), w * dt)).normalize();
				omega.multiplyScalar(Math.exp(-dt * 3));
				changed = true;
			}

			if (changed) {
				pose();
				invalidate();
			}

			if (!folded && !settled && !active && !steps.length && fold === 0 && q.equals(FLAT)) {
				if (pos.distanceToSquared(target) < 0.25 && Math.abs(flatSize - cell) < 0.01) {
					settled = true;
					onsettled?.();
				}
			}
		},
		{ autoInvalidate: false }
	);
</script>

<T.OrthographicCamera makeDefault position={[0, 0, 5000]} near={1} far={10000} />
<T is={pivot} />
