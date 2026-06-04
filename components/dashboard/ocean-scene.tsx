"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

// ─────────────────────────────────────────────────────────────────────────────
// A dusk-ocean banner scene. One sun drives everything: the sky gradient, the
// water's reflection, the glitter lane and the cloud rim-light all reference the
// same `uSunDir`, so the lighting reads as a single coherent source.
//
// Layout (camera at [0, 2, 9], looking slightly up toward the horizon):
//   sky dome   far background, z = -150
//   sun        upper-right, near the horizon, z ≈ -62  (big + close)
//   clouds     soft sprites drifting across the sky,  z ≈ -34…-55
//   ocean      foreground plane, hazes into the horizon so the seam vanishes
// ─────────────────────────────────────────────────────────────────────────────

const SUN_POS: [number, number, number] = [32, 16, -70]

const PALETTE = {
  zenith:   new THREE.Color("#55b9ff"),
  horizon:  new THREE.Color("#c9efff"),

  sunGlow:  new THREE.Color("#ffb300"),
  sunCore:  new THREE.Color("#ffcc00"),
  sunEdge:  new THREE.Color("#ffbb00"),

  deep:     new THREE.Color("#1679b8"),
  shallow:  new THREE.Color("#48c7ee"),

  cloud:    new THREE.Color("#ffffff"),
  cloudRim: new THREE.Color("#fff4cf"),
}

// ─── Shared GLSL ────────────────────────────────────────────────────────────

// Value noise — used for water glitter, sky stars and cloud fluff.
const NOISE_GLSL = /* glsl */ `
  float hash21(vec2 p){
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
`

// The sky model. Evaluated for a view ray by the dome, and for a *reflected*
// ray by the water — that shared call is what makes the reflection sit right.
// Expects uniforms: uHorizon, uZenith, uSunDir, uSunGlow.
const SKY_GLSL = NOISE_GLSL + /* glsl */ `
  vec3 skyColor(vec3 dir){
    dir = normalize(dir);
    float h = dir.y;
    float grad = pow(clamp(h * 1.15 + 0.05, 0.0, 1.0), 0.7);
    vec3 col = mix(uHorizon, uZenith, grad);
    // lift the horizon line so the band reads as atmospheric haze
    float band = exp(-h * h * 60.0);
    col = mix(col, uHorizon * 1.25, band * 0.45);
    // warm glow stacked from broad to tight around the sun
    float d = max(dot(dir, uSunDir), 0.0);
    float glow = pow(d, 5.0) * 0.18 + pow(d, 35.0) * 0.35 + pow(d, 220.0) * 0.55;
    col += uSunGlow * glow;
    return col;
  }
`

const SPRITE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// ─── Sky dome ────────────────────────────────────────────────────────────────

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const SKY_FRAG = /* glsl */ `
  uniform vec3  uCam, uSunDir, uHorizon, uZenith, uSunGlow;
  uniform float uTime;
  varying vec3  vWorld;
  ${SKY_GLSL}
  void main(){
    vec3 dir = normalize(vWorld - uCam);
    vec3 col = skyColor(dir);

    // sparse twinkling stars, high in the sky and away from the sun's glow
    float up   = smoothstep(0.05, 0.55, dir.y);
    float away = 1.0 - max(dot(dir, uSunDir), 0.0);
    float s    = vnoise(dir.xy * 220.0);
    float star = smoothstep(0.985, 1.0, s);
    star      *= 0.5 + 0.5 * sin(uTime * 2.5 + vnoise(dir.xy * 40.0) * 30.0);
    col += vec3(0.85, 0.9, 1.0) * star * up * away * 0.9;

    gl_FragColor = vec4(col, 1.0);
  }
`

function Sky({ matRef }: { matRef: React.RefObject<THREE.ShaderMaterial | null> }) {
  const uniforms = useMemo(() => ({
    uCam:     { value: new THREE.Vector3() },
    uSunDir:  { value: new THREE.Vector3(0, 1, 0) },
    uTime:    { value: 0 },
    uHorizon: { value: PALETTE.horizon.clone() },
    uZenith:  { value: PALETTE.zenith.clone() },
    uSunGlow: { value: PALETTE.sunGlow.clone() },
  }), [])

  return (
    <mesh position={[0, 2, -150]} renderOrder={0}>
      <planeGeometry args={[2400, 400]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={SKY_VERT}
        fragmentShader={SKY_FRAG}
        uniforms={uniforms}
      />
    </mesh>
  )
}

// ─── Ocean ─────────────────────────────────────────────────────────────────

const OCEAN_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uCam;
  varying vec3  vWorld;
  varying vec3  vNrm;
  varying float vCrest;

  // Gentle multi-directional swell. Kept low-frequency on purpose: fine detail
  // lives in the fragment shader instead, so coarse far quads never alias.
  float wave(vec2 p, float t){
    float h = 0.0;
    h += sin(dot(p, vec2( 0.85,  0.30))        - t * 0.90) * 0.55;
    h += sin(dot(p, vec2(-0.45,  0.80))        - t * 0.70) * 0.30;
    h += sin(dot(p, vec2( 0.65, -0.55)) * 1.7  + t * 1.10) * 0.15;
    h += sin(dot(p, vec2( 0.20,  1.00)) * 2.3  - t * 1.45) * 0.07;
    return h;
  }

  void main(){
    vec4  wp   = modelMatrix * vec4(position, 1.0); // flat world position, y ≈ 0
    vec2  p    = wp.xz;
    float dist = length(p - uCam.xz);
    // flatten distant water so it melts cleanly into the horizon haze
    float damp = 1.0 - smoothstep(16.0, 90.0, dist);
    float t    = uTime;

    float h = wave(p, t) * damp;
    wp.y += h;

    // analytic-ish normal from finite differences of the height field
    float e  = 0.35;
    float hx = (wave(p + vec2(e, 0.0), t) - wave(p - vec2(e, 0.0), t)) * damp;
    float hz = (wave(p + vec2(0.0, e), t) - wave(p - vec2(0.0, e), t)) * damp;
    vNrm   = normalize(vec3(-hx, 2.0 * e, -hz));

    vWorld = wp.xyz;
    vCrest = clamp(h * 0.8 + 0.5, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const OCEAN_FRAG = /* glsl */ `
  uniform vec3  uCam, uSunDir, uHorizon, uZenith, uSunGlow, uDeep, uShallow;
  uniform float uTime;
  varying vec3  vWorld;
  varying vec3  vNrm;
  varying float vCrest;
  ${SKY_GLSL}

  void main(){
    vec3 N = normalize(vNrm);
    vec3 V = normalize(uCam - vWorld);

    // base body colour, darker in troughs and brighter on wave faces
    vec3 water = mix(uDeep, uShallow, vCrest * 0.45);

    // fresnel: grazing angles near the horizon reflect the sky → water's tone
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    fres = clamp(fres * 0.92 + 0.05, 0.0, 1.0);
    vec3 R       = reflect(-V, N);
    vec3 skyRefl = skyColor(R);
    vec3 col     = mix(water, skyRefl, fres);

    // the sun is the key light: a tight specular plus a broad sheen
    vec3  H     = normalize(V + uSunDir);
    float spec  = pow(max(dot(N, H), 0.0), 240.0);
    float sheen = pow(max(dot(N, H), 0.0),  28.0);

    // glitter: procedural sparkle confined to the sun's reflection lane
    float lane    = pow(max(dot(reflect(-uSunDir, N), V), 0.0), 6.0);
    float spk     = vnoise(vWorld.xz * 2.6 + uTime * 0.6);
    spk          *= vnoise(vWorld.xz * 5.9 - uTime * 0.9);
    spk           = smoothstep(0.5, 0.95, spk);
    float glitter = spk * lane * (0.5 + fres);

    col += uSunGlow * (spec * 1.5 + sheen * 0.22 + glitter * 1.3);

    // a little foam catching light on the highest crests
    float foam = smoothstep(0.80, 0.98, vCrest);
    col = mix(col, vec3(0.72, 0.84, 0.95), foam * 0.22);

    // haze the far water into the exact horizon colour → invisible sky seam
    float dist = length(vWorld.xz - uCam.xz);
    float haze = smoothstep(42.0, 92.0, dist);
    col = mix(col, uHorizon, haze);

    gl_FragColor = vec4(col, 1.0);
  }
`

function Ocean({ matRef, segments }: {
  matRef: React.RefObject<THREE.ShaderMaterial | null>
  segments: [number, number]
}) {
  const uniforms = useMemo(() => ({
    uCam:     { value: new THREE.Vector3() },
    uSunDir:  { value: new THREE.Vector3(0, 1, 0) },
    uTime:    { value: 0 },
    uHorizon: { value: PALETTE.horizon.clone() },
    uZenith:  { value: PALETTE.zenith.clone() },
    uSunGlow: { value: PALETTE.sunGlow.clone() },
    uDeep:    { value: PALETTE.deep.clone() },
    uShallow: { value: PALETTE.shallow.clone() },
  }), [])

  // Rotated flat; extends far in -z. Width covers the frame out to mid-distance;
  // far corners that fall short are hidden by the matching horizon haze.
  // Tessellation is tuned per device: full detail on capable GPUs, coarser on
  // weak ones (the big swells stay well-sampled; only the faintest ripple softens).
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -40]} renderOrder={3}>
      <planeGeometry args={[260, 150, segments[0], segments[1]]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={OCEAN_VERT}
        fragmentShader={OCEAN_FRAG}
        uniforms={uniforms}
      />
    </mesh>
  )
}

// ─── Sun ───────────────────────────────────────────────────────────────────

const SUN_FRAG = /* glsl */ `
  uniform vec3  uColor, uEdge;
  uniform float uIntensity;
  varying vec2  vUv;
  void main(){
    float r    = length(vUv - 0.5) * 2.0;     // 0 centre → 1 edge
    float core = smoothstep(0.5, 0.0, r);     // solid disk
    float halo = pow(1.0 - clamp(r, 0.0, 1.0), 2.4);
    vec3  col  = mix(uEdge, uColor, core);
    float a    = clamp(core * 0.9 + halo * 0.6, 0.0, 1.0) * uIntensity;
    gl_FragColor = vec4(col, a);
  }
`

function SunLayer({ size, intensity, core, edge, matRef }: {
  size: number
  intensity: number
  core: THREE.Color
  edge: THREE.Color
  matRef: React.RefObject<THREE.ShaderMaterial | null>
}) {
  const uniforms = useMemo(() => ({
    uColor:     { value: core.clone() },
    uEdge:      { value: edge.clone() },
    uIntensity: { value: intensity },
  }), [core, edge, intensity])

  return (
    <mesh renderOrder={1}>
      <planeGeometry args={[size, size]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={SPRITE_VERT}
        fragmentShader={SUN_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

function Sun({ groupRef }: { groupRef: React.RefObject<THREE.Group | null> }) {
  const glowMat = useRef<THREE.ShaderMaterial>(null)
  const coreMat = useRef<THREE.ShaderMaterial>(null)

  // slow breathing glow
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
  if (glowMat.current) glowMat.current.uniforms.uIntensity.value = 0.14 + Math.sin(t * 0.45) * 0.015
if (coreMat.current) coreMat.current.uniforms.uIntensity.value = 0.45 + Math.sin(t * 0.65) * 0.02
  })

  return (
    <group ref={groupRef} position={SUN_POS}>
      <SunLayer size={24} intensity={0.22} core={PALETTE.sunEdge} edge={PALETTE.sunGlow} matRef={glowMat} />
<SunLayer size={8}  intensity={0.75} core={PALETTE.sunCore} edge={PALETTE.sunEdge} matRef={coreMat} />
    </group>
  )
}

// ─── Clouds ──────────────────────────────────────────────────────────────────
//
// All cloud puffs across every cloud are drawn as ONE instanced mesh — a single
// draw call and program bind instead of ~30. Per-puff differences (size, opacity,
// noise seed, horizontal drift) ride along as per-instance attributes, and the
// drift that used to be a JS-per-frame transform now happens in the vertex shader.
// The fragment math is byte-for-byte the old CloudPuff shader, so the clouds look
// identical — only the CPU cost of issuing them collapses.

const CLOUD_VERT = /* glsl */ `
  attribute float aOpacity;
  attribute float aSeed;
  attribute float aSpeed;
  attribute float aPhase;
  attribute float aAmp;
  uniform   float uTime;
  varying   vec2  vUv;
  varying   float vOpacity;
  varying   float vSeed;
  void main(){
    vUv      = uv;
    vOpacity = aOpacity;
    vSeed    = aSeed;
    // instanceMatrix places each puff at its resting position/scale; the drift is
    // a horizontal sway in the same space the old group.position.x used.
    vec4 ip  = instanceMatrix * vec4(position, 1.0);
    ip.x    += sin(uTime * aSpeed + aPhase) * aAmp;
    gl_Position = projectionMatrix * modelViewMatrix * ip;
  }
`

const CLOUD_FRAG = /* glsl */ `
  uniform vec3  uColor, uRim;
  varying vec2  vUv;
  varying float vOpacity;
  varying float vSeed;
  ${NOISE_GLSL}
  void main(){
    vec2  c = vUv - 0.5;
    float r = length(c) * 2.0;

    // ragged, noisy falloff for a soft fluffy silhouette
    float n    = vnoise(vUv * 4.0 + vSeed) * 0.55 + vnoise(vUv * 9.0 - vSeed * 1.7) * 0.45;
    float edge = 0.95 - n * 0.4;
    float a    = smoothstep(edge, edge - 0.5, r) * vOpacity;
    if (a < 0.01) discard;

    // rim-lit on the sun side (right), shaded underneath
    float lit = smoothstep(-0.5, 0.5, c.x);
    vec3  col = mix(uColor, uRim, lit * 0.55);
    col *= 0.82 + 0.28 * smoothstep(0.45, -0.35, c.y);

    gl_FragColor = vec4(col, a);
  }
`

// A cloud is several overlapping puffs; each cloud drifts horizontally as a unit.
const PUFFS: { pos: [number, number]; s: number; o: number }[] = [
  { pos: [ 0.0,  0.0],  s: 1.00, o: 0.95 },
  { pos: [ 4.2,  0.8],  s: 0.72, o: 0.85 },
  { pos: [-4.0,  0.5],  s: 0.68, o: 0.82 },
  { pos: [ 1.8,  1.9],  s: 0.60, o: 0.70 },
  { pos: [-1.6,  1.6],  s: 0.55, o: 0.62 },
  { pos: [ 2.6, -0.9],  s: 0.55, o: 0.50 },
]

// The five cloud banks — same positions/scales/speeds/seeds as before.
const CLOUDS: { pos: [number, number, number]; scale: number; speed: number; seed: number }[] = [
  { pos: [-12, 10.5, -36], scale: 1.10, speed: 0.05,  seed: 1.2 },
  { pos: [-28, 12.5, -50], scale: 1.30, speed: 0.03,  seed: 3.4 },
  { pos: [  4, 13.5, -54], scale: 1.00, speed: 0.04,  seed: 5.6 },
  { pos: [ -3, 10.0, -34], scale: 0.95, speed: 0.06,  seed: 7.8 },
  { pos: [ 33, 12.5, -46], scale: 0.85, speed: 0.035, seed: 9.1 },
]

const CLOUD_DRIFT = 2.2 // horizontal sway amplitude, matches the old Cloud component

// Instances draw in index order (no per-frame depth sort), so bake the back-to-
// front order in once. The puffs only sway in x, so z is fixed → ordering clouds
// farthest-first reproduces the painter's-order alpha blend three.js gave before.
const CLOUDS_BY_DEPTH = [...CLOUDS].sort((a, b) => a.pos[2] - b.pos[2])

function CloudField() {
  const count  = CLOUDS.length * PUFFS.length
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const matRef  = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(() => ({
    uColor: { value: PALETTE.cloud.clone() },
    uRim:   { value: PALETTE.cloudRim.clone() },
    uTime:  { value: 0 },
  }), [])

  // Unit quad carrying the per-instance attributes. Built once.
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1)
    const opacity = new Float32Array(count)
    const seed    = new Float32Array(count)
    const speed   = new Float32Array(count)
    const phase   = new Float32Array(count)
    const amp     = new Float32Array(count)
    let k = 0
    for (const cl of CLOUDS_BY_DEPTH) {
      for (let i = 0; i < PUFFS.length; i++) {
        opacity[k] = PUFFS[i].o
        seed[k]    = cl.seed + i * 1.37  // matches old CloudPuff seed = seed + i*1.37
        speed[k]   = cl.speed
        phase[k]   = cl.seed             // matches old drift phase = seed
        amp[k]     = CLOUD_DRIFT
        k++
      }
    }
    g.setAttribute("aOpacity", new THREE.InstancedBufferAttribute(opacity, 1))
    g.setAttribute("aSeed",    new THREE.InstancedBufferAttribute(seed, 1))
    g.setAttribute("aSpeed",   new THREE.InstancedBufferAttribute(speed, 1))
    g.setAttribute("aPhase",   new THREE.InstancedBufferAttribute(phase, 1))
    g.setAttribute("aAmp",     new THREE.InstancedBufferAttribute(amp, 1))
    return g
  }, [count])

  // Resting transform per puff: the old (group position + scale·puffOffset) and
  // (group scale · plane size). Set once; drift is added live in the shader.
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    let k = 0
    for (const cl of CLOUDS_BY_DEPTH) {
      for (let i = 0; i < PUFFS.length; i++) {
        const pf = PUFFS[i]
        const w  = cl.scale * 11 * pf.s
        dummy.position.set(
          cl.pos[0] + cl.scale * pf.pos[0],
          cl.pos[1] + cl.scale * pf.pos[1],
          cl.pos[2],
        )
        dummy.scale.set(w, w * 0.72, 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(k, dummy.matrix)
        k++
      }
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [])

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime()
  })

  // frustumCulled off: the instances span far wider than the unit-quad bounds, so
  // the default per-instance-blind cull test would wrongly drop the whole mesh.
  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, count]} renderOrder={2} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={CLOUD_VERT}
        fragmentShader={CLOUD_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </instancedMesh>
  )
}

// ─── Scene root — wiring, sun direction, parallax ────────────────────────────

function ResponsiveCamera() {
  const { set, size, invalidate } = useThree()
  const cameraRef = useRef<THREE.PerspectiveCamera>(null)
  const fov = size.width / size.height < 2.2 ? 54 : 42

  useEffect(() => {
    const cam = cameraRef.current
    if (!cam) return
    cam.fov = fov
    cam.lookAt(0, 6, -60)
    cam.updateProjectionMatrix()
    set({ camera: cam })
    // Force a render now in case the loop is on-demand (reduced-motion path),
    // so the static frame reflects the final camera/aspect.
    invalidate()
  }, [fov, set, invalidate])

  return (
    <perspectiveCamera
      ref={cameraRef}
      position={[0, 2, 9]}
      fov={fov}
      near={1}
      far={400}
    />
  )
}

// ─── Adaptive resolution — holds the framerate without touching the look ──────
//
// The ocean's per-pixel fragment shader (layered noise glitter + reflected sky)
// is the scene's dominant cost, so the cheapest thing to trade when a frame runs
// long is pixel density — never the geometry, shaders or animation. We watch the
// real framerate and nudge DPR within [min, cap]:
//   • capable GPUs settle at the cap → pixel-for-pixel identical to before
//   • weaker GPUs ease DPR down just enough to stay at 50–60fps and leave the
//     rest of the page responsive, instead of pinning the GPU at 20fps.
// The floor goes fairly low so even an underpowered GPU can keep a smooth cadence.
function AdaptiveResolution({ min = 0.65, max = 1.6 }: { min?: number; max?: number }) {
  const setDpr = useThree((s) => s.setDpr)
  const dpr     = useRef(max)
  const frames  = useRef(0)
  const since   = useRef(0)

  useEffect(() => {
    const cap = Math.min(max, window.devicePixelRatio || 1)
    dpr.current = cap
    since.current = performance.now()
    setDpr(cap)
  }, [max, setDpr])

  useFrame(() => {
    frames.current++
    const now     = performance.now()
    const elapsed = now - since.current
    if (elapsed < 600) return // measure over ~0.6s windows to ignore jitter

    const fps = (frames.current * 1000) / elapsed
    frames.current = 0
    since.current  = now

    const cap = Math.min(max, window.devicePixelRatio || 1)
    let next = dpr.current
    if (fps < 50 && dpr.current > min) {
      next = Math.max(min, dpr.current - 0.2)      // shed pixels to recover fps
    } else if (fps > 58 && dpr.current < cap) {
      next = Math.min(cap, dpr.current + 0.1)       // headroom to spare → sharpen
    }
    if (next !== dpr.current) {
      dpr.current = next
      setDpr(next)
    }
  })

  return null
}

function SceneRoot({ segments }: { segments: [number, number] }) {
  const { camera } = useThree()
  const groupRef = useRef<THREE.Group>(null)
  const skyMat   = useRef<THREE.ShaderMaterial>(null)
  const oceanMat = useRef<THREE.ShaderMaterial>(null)
  const sunGroup = useRef<THREE.Group>(null)

  const mouse = useRef({ x: 0, y: 0 })
  const rot   = useRef({ x: 0, y: 0 })
  const tmpA  = useMemo(() => new THREE.Vector3(), [])
  const tmpB  = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce) return
    function onMove(e: MouseEvent) {
      mouse.current.x = (e.clientX / window.innerWidth  - 0.5) * 2
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener("mousemove", onMove, { passive: true })
    return () => window.removeEventListener("mousemove", onMove)
  }, [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()

    // gentle parallax sway (kept tiny so the horizon barely tilts)
    const r = rot.current, m = mouse.current
    r.x += ( m.y * 0.018 - r.x) * 0.04
    r.y += (-m.x * 0.030 - r.y) * 0.04
    // Only touch the transform when it actually moved by a perceptible amount.
    // Writing rotation every frame dirties the whole subtree's world matrices;
    // skipping it while the pointer is idle lets three.js avoid that traversal.
    if (groupRef.current) {
      const g = groupRef.current
      if (Math.abs(g.rotation.x - r.x) > 1e-5 || Math.abs(g.rotation.y - r.y) > 1e-5) {
        g.rotation.x = r.x
        g.rotation.y = r.y
      }
    }

    // world-space sun direction (follows the parallax) feeds sky + water
    let dir = tmpB.set(0, 1, 0)
    if (sunGroup.current) {
      sunGroup.current.getWorldPosition(tmpA)
      dir = tmpB.copy(tmpA).sub(camera.position).normalize()
    }
    for (const mat of [skyMat.current, oceanMat.current]) {
      if (!mat) continue
      mat.uniforms.uTime.value = t
      ;(mat.uniforms.uCam.value as THREE.Vector3).copy(camera.position)
      ;(mat.uniforms.uSunDir.value as THREE.Vector3).copy(dir)
    }
  })

  return (
    <group ref={groupRef}>
      <Sky matRef={skyMat} />
      <Sun groupRef={sunGroup} />
      <Ocean matRef={oceanMat} segments={segments} />

      {/* drifting cloud bank (one instanced draw call), kept clear of the sun */}
      <CloudField />
    </group>
  )
}

// ─── Canvas ──────────────────────────────────────────────────────────────────

// One-time quality tier picked from coarse device hints, so weak hardware starts
// light instead of janking through the adaptive governor's first second. Desktops
// stay at full quality (pixel-identical); phones/tablets and low-memory machines
// get cheaper MSAA-off rendering, a lower DPR cap, and coarser ocean tessellation.
// The runtime fps governor still refines DPR from whatever cap we choose here.
type Quality = { antialias: boolean; maxDpr: number; oceanSegments: [number, number] }

function detectQuality(): Quality {
  const HIGH: Quality = { antialias: true,  maxDpr: 1.6, oceanSegments: [170, 120] }
  const LOW:  Quality = { antialias: false, maxDpr: 1.3, oceanSegments: [110, 80] }
  if (typeof window === "undefined" || typeof navigator === "undefined") return HIGH
  const coarse = window.matchMedia("(pointer: coarse)").matches            // phone/tablet
  const mem    = (navigator as { deviceMemory?: number }).deviceMemory     // GB (Chromium)
  const cores  = navigator.hardwareConcurrency || 8
  const lowEnd = coarse || (mem !== undefined && mem <= 4) || cores <= 2
  return lowEnd ? LOW : HIGH
}

export default function OceanScene() {
  const wrapRef = useRef<HTMLDivElement>(null)
  // Only drive the render loop while the banner is actually on screen and the
  // tab is focused. The scene is purely decorative, so rendering frames nobody
  // can see just burns GPU/battery — visually identical, far cheaper. When
  // `active` is false R3F's frameloop stops entirely (no draw calls, no rAF).
  const [active, setActive] = useState(true)
  // Quality tier is fixed for the canvas's lifetime (antialias/dpr/segments are
  // creation-time choices), so resolve it once.
  const [quality] = useState(detectQuality)

  // Reduced-motion users get a single static frame — no ongoing render at all.
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    let onScreen = true
    const sync = () => setActive(onScreen && !document.hidden)

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting
        sync()
      },
      // a tiny margin keeps it running through the last sliver of scroll
      { rootMargin: "120px" }
    )
    io.observe(el)

    document.addEventListener("visibilitychange", sync)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])

  return (
    <div
      ref={wrapRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        // Promote the animated canvas onto its own compositor layer and isolate
        // its paint. Without this the canvas sits mid-stack under static gradient
        // overlays, so each WebGL frame drags the surrounding content into the
        // browser's Paint pass instead of just recompositing the canvas texture.
        // Purely a compositing hint — the pixels are unchanged. (The banner-side
        // rounded clip is applied by the wrapper in today-page so it doesn't
        // round the full-bleed landing hero, which shares this component.)
        willChange: "transform",
        contain: "paint",
      }}
    >
      <Canvas
        // reduced-motion → render on demand only (one static frame); otherwise
        // run while visible and pause entirely when scrolled away / tab hidden.
        frameloop={reduced ? "demand" : active ? "always" : "never"}
        gl={{ antialias: quality.antialias, powerPreference: "high-performance" }}
        dpr={[1, quality.maxDpr]}
        style={{ width: "100%", height: "100%" }}
        onCreated={({ gl }) => {
          // match the sky horizon so no gap shows at extreme aspect ratios
          gl.setClearColor("#c9efff", 1)
        }}
      >
        <ResponsiveCamera />
        {/* No fps governor when frozen — there's nothing to measure. */}
        {!reduced && <AdaptiveResolution min={0.65} max={quality.maxDpr} />}
        <SceneRoot segments={quality.oceanSegments} />
      </Canvas>
    </div>
  )
}
