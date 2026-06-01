/* ============================================================================
   Euroflo — interactive 3D ocean + sky (three.js)
   A custom GLSL water surface that ripples under the cursor, set under either a
   sunny procedural sky (gradient + sun + fbm clouds) or a dark night sky.
   Returns null if WebGL is unavailable so the caller can fall back to 2D.
   ========================================================================== */
window.EurofloOcean = (function () {
  'use strict';

  var PALETTES = {
    ocean: { deep: '#04386a', mid: '#0e63a8', crest: '#5cdcf2' },
    deep:  { deep: '#021f3b', mid: '#0a4d85', crest: '#3fb4ff' },
    crest: { deep: '#0a6aa8', mid: '#28a3df', crest: '#bdf2fc' }
  };
  var MOTION = {
    calm:     { amp: 0.18, speed: 0.32, ripple: 0.4 },
    balanced: { amp: 0.30, speed: 0.58, ripple: 0.7 },
    showy:    { amp: 0.46, speed: 0.9, ripple: 1.1 }
  };
  // horizon haze the water fades into (day) vs deep navy (night)
  var FOG_DAY = '#a9d3ec';
  var FOG_NIGHT = '#021428';

  // ───────── water shaders ─────────
  var WATER_VERT = [
    'uniform float uTime; uniform float uAmp; uniform vec2 uMouse; uniform float uRipple;',
    'varying float vH; varying vec3 vNormal; varying vec3 vView;',
    'float hgt(vec2 p){',
    '  float t = uTime; float v = 0.0;',
    '  v += sin(p.x*0.32 + t*1.0)*1.0;',
    '  v += sin(p.y*0.26 - t*0.8)*0.85;',
    '  v += sin((p.x+p.y)*0.20 + t*1.3)*0.55;',
    '  v += sin((p.x*0.7 - p.y*0.5)*0.45 + t*1.7)*0.32;',
    '  float d = distance(p, uMouse);',
    '  v += exp(-d*0.16)*sin(d*1.05 - t*3.0)*uRipple;',
    '  return v*uAmp;',
    '}',
    'void main(){',
    '  vec3 pos = position; float e = 0.7;',
    '  float hC = hgt(pos.xy); float hX = hgt(pos.xy+vec2(e,0.0)); float hY = hgt(pos.xy+vec2(0.0,e));',
    '  pos.z += hC; vH = hC;',
    '  vec3 nx = vec3(e,0.0,hX-hC); vec3 ny = vec3(0.0,e,hY-hC);',
    '  vNormal = normalize(normalMatrix * normalize(cross(nx,ny)));',
    '  vec4 mv = modelViewMatrix * vec4(pos,1.0); vView = -mv.xyz;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var WATER_FRAG = [
    'precision highp float;',
    'uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uCrest; uniform vec3 uFog; uniform float uSunny;',
    'varying float vH; varying vec3 vNormal; varying vec3 vView;',
    'void main(){',
    '  vec3 N = normalize(vNormal); vec3 V = normalize(vView);',
    '  float hn = clamp(vH*0.55+0.5, 0.0, 1.0);',
    '  vec3 col = mix(uDeep, uMid, smoothstep(0.12,0.85,hn));',
    '  col += uMid * (0.07 + uSunny*0.12);',
    '  float crest = smoothstep(0.66,1.0,hn);',
    '  col = mix(col, uCrest, crest*0.9);',
    '  float fres = pow(1.0 - max(dot(N,V),0.0), 3.0);',
    '  col += uCrest * fres * (0.6 + uSunny*0.25);',
    '  vec3 L = normalize(vec3(0.32,0.8,0.5));',
    '  vec3 H = normalize(L+V);',
    '  float spec = pow(max(dot(N,H),0.0), 64.0);',
    '  col += vec3(1.0,0.97,0.88)*spec*(0.95 + uSunny*0.8);',
    '  float dist = length(vView);',
    '  float fog = smoothstep(18.0, 52.0, dist);',
    '  col = mix(col, uFog, fog);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  // ───────── sky shaders ─────────
  var SKY_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  var SKY_FRAG = [
    'precision highp float;',
    'uniform float uTime; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uCloud;',
    'uniform vec2 uSunPos; uniform float uCloudAmt; uniform float uWind;',
    'varying vec2 vUv;',
    'float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }',
    'float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);',
    '  float a=hash(i),b=hash(i+vec2(1.0,0.0)),c=hash(i+vec2(0.0,1.0)),d=hash(i+vec2(1.0,1.0));',
    '  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }',
    'float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }',
    'void main(){',
    '  vec2 uv = vUv;',
    '  float t = clamp(uv.y,0.0,1.0);',
    '  vec3 sky = mix(uHorizon, uZenith, pow(t,0.85));',
    '  float sd = distance(vec2(uv.x, uv.y), uSunPos);',
    '  float glow = exp(-sd*6.5);',
    '  float disc = smoothstep(0.038,0.024,sd);',
    '  sky += uSun*glow*0.7 + vec3(1.0,0.98,0.92)*disc;',
    '  vec2 cp = vec2(uv.x*2.4 + uTime*uWind, uv.y*1.7 + uTime*uWind*0.25);',
    '  float c = fbm(cp*2.0);',
    '  float cover = smoothstep(0.44,0.9,c) * uCloudAmt;',
    '  cover *= smoothstep(0.4,0.6,uv.y) * smoothstep(1.0,0.74,uv.y);',
    '  vec3 cloudCol = mix(uCloud, uSun, glow*0.6);',
    '  sky = mix(sky, cloudCol, cover);',
    '  gl_FragColor = vec4(sky,1.0);',
    '}'
  ].join('\n');

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function init(container, opts) {
    if (!window.THREE || !hasWebGL()) return null;
    opts = opts || {};
    var pal = PALETTES[opts.palette] || PALETTES.crest;
    var mo = MOTION[opts.motion] || MOTION.showy;
    var sky = opts.sky === 'night' ? 'night' : 'day';
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var FOV = 48;

    var canvas = document.createElement('canvas');
    canvas.className = 'ocean-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.insertBefore(canvas, container.firstChild);

    var renderer, scene, camera, mesh, skyMesh, wu, sku, raf = null, running = false;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
      renderer.setClearColor(new THREE.Color(FOG_NIGHT), 1);
    } catch (e) { container.removeChild(canvas); return null; }

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 240);
    camera.position.set(0, 6.0, 18);
    camera.lookAt(0, -1.0, -12);
    scene.add(camera);

    // water
    wu = {
      uTime: { value: 0 }, uAmp: { value: mo.amp }, uRipple: { value: 0 },
      uMouse: { value: new THREE.Vector2(999, 999) },
      uDeep: { value: new THREE.Color(pal.deep) }, uMid: { value: new THREE.Color(pal.mid) },
      uCrest: { value: new THREE.Color(pal.crest) },
      uFog: { value: new THREE.Color(sky === 'day' ? FOG_DAY : FOG_NIGHT) },
      uSunny: { value: sky === 'day' ? 1 : 0 }
    };
    mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 110, 220, 170),
      new THREE.ShaderMaterial({ uniforms: wu, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -2.2;
    scene.add(mesh);

    // sky — fullscreen-ish quad parented to the camera, drawn behind
    sku = {
      uTime: { value: 0 },
      uZenith: { value: new THREE.Color('#2c93de') }, uHorizon: { value: new THREE.Color('#dcf0fa') },
      uSun: { value: new THREE.Color('#ffe9c2') }, uCloud: { value: new THREE.Color('#ffffff') },
      uSunPos: { value: new THREE.Vector2(0.74, 0.8) }, uCloudAmt: { value: 1.15 }, uWind: { value: 0.016 }
    };
    skyMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: sku, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
        depthTest: false, depthWrite: false
      })
    );
    skyMesh.position.set(0, 0, -80);
    skyMesh.renderOrder = -1;
    skyMesh.visible = (sky === 'day');
    camera.add(skyMesh);

    var ray = new THREE.Raycaster();
    var ndc = new THREE.Vector2(0, 0);
    var rippleTarget = 0, rippleNow = 0, baseRipple = mo.ripple;
    var speed = reduce ? 0 : mo.speed;

    function resize() {
      var w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      var d = 80;
      var vh = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * d;
      skyMesh.scale.set(vh * camera.aspect / 2 * 1.02, vh / 2 * 1.02, 1);
    }
    resize();
    window.addEventListener('resize', resize);

    function onMove(e) {
      var r = container.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      var hit = ray.intersectObject(mesh, false);
      if (hit.length) {
        var lp = mesh.worldToLocal(hit[0].point.clone());
        wu.uMouse.value.set(lp.x, lp.y);
        rippleTarget = baseRipple;
      }
    }
    function onLeave() { rippleTarget = 0; }
    window.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);

    var last = performance.now();
    function loop(now) {
      raf = requestAnimationFrame(loop);
      var dt = Math.min((now - last) / 1000, 0.05); last = now;
      rippleNow += (rippleTarget - rippleNow) * Math.min(dt * 3, 1);
      wu.uRipple.value = rippleNow;
      wu.uTime.value += dt * speed;
      sku.uTime.value += dt;
      try { renderer.render(scene, camera); } catch (e) { stop(); }
    }
    function start() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); } }
    function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = null; } }

    if (reduce) {
      wu.uTime.value = 2.0; sku.uTime.value = 2.0;
      try { renderer.render(scene, camera); } catch (e) {}
    } else {
      var io = new IntersectionObserver(function (en) {
        en.forEach(function (x) { x.isIntersecting ? start() : stop(); });
      }, { threshold: 0 });
      io.observe(container);
      start();
    }

    return {
      setPalette: function (name) {
        var p = PALETTES[name]; if (!p) return;
        wu.uDeep.value.set(p.deep); wu.uMid.value.set(p.mid); wu.uCrest.value.set(p.crest);
      },
      setMotion: function (name) {
        var m = MOTION[name]; if (!m) return;
        wu.uAmp.value = m.amp; baseRipple = m.ripple; speed = reduce ? 0 : m.speed;
      },
      setSky: function (mode) {
        var day = mode !== 'night';
        skyMesh.visible = day;
        wu.uSunny.value = day ? 1 : 0;
        wu.uFog.value.set(day ? FOG_DAY : FOG_NIGHT);
        if (reduce) { try { renderer.render(scene, camera); } catch (e) {} }
      },
      resize: resize
    };
  }

  return { init: init };
})();
