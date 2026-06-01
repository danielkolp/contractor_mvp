"use client"

import { useMemo, useRef } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

const WATER_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uAmp;
  uniform vec2 uMouse;
  uniform float uRipple;

  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vView;

  float waveHeight(vec2 p) {
    float t = uTime;
    float h = 0.0;
    h += sin(p.x * 0.32 + t * 1.0) * 1.0;
    h += sin(p.y * 0.26 - t * 0.8) * 0.85;
    h += sin((p.x + p.y) * 0.20 + t * 1.3) * 0.55;
    h += sin((p.x * 0.7 - p.y * 0.5) * 0.45 + t * 1.7) * 0.32;

    float d = distance(p, uMouse);
    h += exp(-d * 0.16) * sin(d * 1.05 - t * 3.0) * uRipple;
    return h * uAmp;
  }

  void main() {
    vec3 pos = position;
    float e = 0.65;
    float center = waveHeight(pos.xy);
    float right = waveHeight(pos.xy + vec2(e, 0.0));
    float up = waveHeight(pos.xy + vec2(0.0, e));

    pos.z += center;
    vHeight = center;

    vec3 tx = vec3(e, 0.0, right - center);
    vec3 ty = vec3(0.0, e, up - center);
    vNormal = normalize(normalMatrix * normalize(cross(tx, ty)));

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vView = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const WATER_FRAGMENT_SHADER = `
  precision highp float;

  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uCrest;
  uniform vec3 uFog;

  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 view = normalize(vView);

    float height = clamp(vHeight * 0.55 + 0.5, 0.0, 1.0);
    vec3 color = mix(uDeep, uMid, smoothstep(0.12, 0.85, height));
    color += uMid * 0.14;

    float crest = smoothstep(0.64, 1.0, height);
    color = mix(color, uCrest, crest * 0.86);

    float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 3.0);
    color += uCrest * fresnel * 0.82;

    vec3 light = normalize(vec3(0.32, 0.8, 0.5));
    vec3 halfVector = normalize(light + view);
    float specular = pow(max(dot(normal, halfVector), 0.0), 66.0);
    color += vec3(1.0, 0.98, 0.9) * specular * 1.55;

    float dist = length(vView);
    float fog = smoothstep(20.0, 58.0, dist);
    color = mix(color, uFog, fog);

    gl_FragColor = vec4(color, 1.0);
  }
`

const SKY_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SKY_FRAGMENT_SHADER = `
  precision highp float;

  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv;
    vec3 horizon = vec3(0.82, 0.93, 0.98);
    vec3 zenith = vec3(0.17, 0.58, 0.87);
    vec3 sky = mix(horizon, zenith, pow(uv.y, 0.85));

    vec2 sunPos = vec2(0.72, 0.78);
    float sunDistance = distance(uv, sunPos);
    float sunGlow = exp(-sunDistance * 6.5);
    float sunDisc = smoothstep(0.05, 0.025, sunDistance);
    sky += vec3(1.0, 0.9, 0.66) * sunGlow * 0.62;
    sky += vec3(1.0, 0.98, 0.9) * sunDisc;

    vec2 cloudPoint = vec2(uv.x * 2.4 + uTime * 0.018, uv.y * 1.7 + uTime * 0.005);
    float cloud = smoothstep(0.46, 0.88, fbm(cloudPoint * 2.0));
    cloud *= smoothstep(0.34, 0.58, uv.y) * smoothstep(1.0, 0.76, uv.y);
    sky = mix(sky, vec3(1.0), cloud * 0.82);

    gl_FragColor = vec4(sky, 1.0);
  }
`

function CameraRig() {
  const { camera } = useThree()

  useFrame(() => {
    camera.lookAt(0, -1.35, -15)
  })

  return null
}

function SkyBackdrop({ reduced }: { reduced: boolean }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 1.5 },
    }),
    []
  )

  useFrame((_, delta) => {
    if (!materialRef.current || reduced) return
    materialRef.current.uniforms.uTime.value += delta
  })

  return (
    <mesh position={[0, 7.5, -52]} scale={[70, 36, 1]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={SKY_VERTEX_SHADER}
        fragmentShader={SKY_FRAGMENT_SHADER}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
}

function WaterSurface({ reduced }: { reduced: boolean }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const pointerTarget = useRef(new THREE.Vector2(8, -8))
  const ripple = useRef(0.2)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 2.0 },
      uAmp: { value: reduced ? 0.22 : 0.42 },
      uMouse: { value: new THREE.Vector2(999, 999) },
      uRipple: { value: reduced ? 0.0 : 0.55 },
      uDeep: { value: new THREE.Color("#021f3b") },
      uMid: { value: new THREE.Color("#0a63a8") },
      uCrest: { value: new THREE.Color("#bdf2fc") },
      uFog: { value: new THREE.Color("#a9d3ec") },
    }),
    [reduced]
  )

  useFrame((state, delta) => {
    const material = materialRef.current
    if (!material) return

    pointerTarget.current.set(state.pointer.x * 42, state.pointer.y * 18 - 2)
    const mouse = material.uniforms.uMouse.value as THREE.Vector2
    mouse.lerp(pointerTarget.current, reduced ? 1 : 0.055)
    ripple.current = THREE.MathUtils.lerp(
      ripple.current,
      reduced ? 0 : 1.08,
      Math.min(delta * 2.4, 1)
    )

    material.uniforms.uRipple.value = ripple.current
    if (!reduced) material.uniforms.uTime.value += delta * 0.9
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.15, -12]}>
      <planeGeometry args={[150, 110, 220, 170]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={WATER_VERTEX_SHADER}
        fragmentShader={WATER_FRAGMENT_SHADER}
      />
    </mesh>
  )
}

export function HeroOcean() {
  const reduced = useMemo(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [])

  return (
    <div className="ef-ocean-scene" aria-hidden="true">
      <Canvas
        camera={{ fov: 48, position: [0, 6, 18], near: 0.1, far: 240 }}
        dpr={[1, 1.6]}
        frameloop={reduced ? "demand" : "always"}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
        }}
      >
        <color attach="background" args={["#a9d3ec"]} />
        <fog attach="fog" args={["#a9d3ec", 26, 76]} />
        <CameraRig />
        <SkyBackdrop reduced={reduced} />
        <WaterSurface reduced={reduced} />
      </Canvas>
    </div>
  )
}
