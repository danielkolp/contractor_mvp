"use client"

import { useEffect, useMemo, useRef } from "react"
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

function Ocean({ matRef }: { matRef: React.RefObject<THREE.ShaderMaterial | null> }) {
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
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -40]} renderOrder={3}>
      <planeGeometry args={[260, 150, 170, 120]} />
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

const CLOUD_FRAG = /* glsl */ `
  uniform vec3  uColor, uRim;
  uniform float uOpacity, uSeed;
  varying vec2  vUv;
  ${NOISE_GLSL}
  void main(){
    vec2  c = vUv - 0.5;
    float r = length(c) * 2.0;

    // ragged, noisy falloff for a soft fluffy silhouette
    float n    = vnoise(vUv * 4.0 + uSeed) * 0.55 + vnoise(vUv * 9.0 - uSeed * 1.7) * 0.45;
    float edge = 0.95 - n * 0.4;
    float a    = smoothstep(edge, edge - 0.5, r) * uOpacity;
    if (a < 0.01) discard;

    // rim-lit on the sun side (right), shaded underneath
    float lit = smoothstep(-0.5, 0.5, c.x);
    vec3  col = mix(uColor, uRim, lit * 0.55);
    col *= 0.82 + 0.28 * smoothstep(0.45, -0.35, c.y);

    gl_FragColor = vec4(col, a);
  }
`

function CloudPuff({ pos, size, opacity, seed }: {
  pos: [number, number]
  size: number
  opacity: number
  seed: number
}) {
  const uniforms = useMemo(() => ({
    uColor:   { value: PALETTE.cloud.clone() },
    uRim:     { value: PALETTE.cloudRim.clone() },
    uOpacity: { value: opacity },
    uSeed:    { value: seed },
  }), [opacity, seed])

  return (
    <mesh position={[pos[0], pos[1], 0]}>
      <planeGeometry args={[size, size * 0.72]} />
      <shaderMaterial
        vertexShader={SPRITE_VERT}
        fragmentShader={CLOUD_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

// A cloud is several overlapping puffs; the group drifts horizontally.
const PUFFS: { pos: [number, number]; s: number; o: number }[] = [
  { pos: [ 0.0,  0.0],  s: 1.00, o: 0.95 },
  { pos: [ 4.2,  0.8],  s: 0.72, o: 0.85 },
  { pos: [-4.0,  0.5],  s: 0.68, o: 0.82 },
  { pos: [ 1.8,  1.9],  s: 0.60, o: 0.70 },
  { pos: [-1.6,  1.6],  s: 0.55, o: 0.62 },
  { pos: [ 2.6, -0.9],  s: 0.55, o: 0.50 },
]

function Cloud({ position, scale = 1, speed = 0.04, seed = 0 }: {
  position: [number, number, number]
  scale?: number
  speed?: number
  seed?: number
}) {
  const ref   = useRef<THREE.Group>(null)
  const baseX = position[0]

  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.position.x = baseX + Math.sin(clock.getElapsedTime() * speed + seed) * 2.2
  })

  return (
    <group ref={ref} position={position} scale={scale} renderOrder={2}>
      {PUFFS.map((pf, i) => (
        <CloudPuff key={i} pos={pf.pos} size={11 * pf.s} opacity={pf.o} seed={seed + i * 1.37} />
      ))}
    </group>
  )
}

// ─── Scene root — wiring, sun direction, parallax ────────────────────────────

function ResponsiveCamera() {
  const { set, size } = useThree()
  const cameraRef = useRef<THREE.PerspectiveCamera>(null)
  const fov = size.width / size.height < 2.2 ? 54 : 42

  useEffect(() => {
    const cam = cameraRef.current
    if (!cam) return
    cam.fov = fov
    cam.lookAt(0, 6, -60)
    cam.updateProjectionMatrix()
    set({ camera: cam })
  }, [fov, set])

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

function SceneRoot() {
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
    if (groupRef.current) {
      groupRef.current.rotation.x = r.x
      groupRef.current.rotation.y = r.y
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
      <Ocean matRef={oceanMat} />

      {/* drifting cloud bank, kept clear of the sun's disk */}
      <Cloud position={[-12, 10.5, -36]} scale={1.10} speed={0.05} seed={1.2} />
      <Cloud position={[-28, 12.5, -50]} scale={1.30} speed={0.03} seed={3.4} />
      <Cloud position={[  4, 13.5, -54]} scale={1.00} speed={0.04} seed={5.6} />
      <Cloud position={[ -3, 10.0, -34]} scale={0.95} speed={0.06} seed={7.8} />
      <Cloud position={[ 33, 12.5, -46]} scale={0.85} speed={0.035} seed={9.1} />
    </group>
  )
}

// ─── Canvas ──────────────────────────────────────────────────────────────────

export default function OceanScene() {
  return (
    <Canvas
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 1.6]}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      onCreated={({ gl }) => {
        // match the sky horizon so no gap shows at extreme aspect ratios
        gl.setClearColor("#c9efff", 1)
      }}
    >
      <ResponsiveCamera />
      <SceneRoot />
    </Canvas>
  )
}
