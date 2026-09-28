import { useEffect, useRef } from "react";

// Portováno z @matusgallo/mysabds (LoginBackground) – stejný WebGL shader jako
// na loginu myBRIK/myDOCK, jen bez závislosti na celém design systému.
// Bez podpory WebGL se nevykreslí nic a zůstane vidět obyčejné pozadí pod ní.

const VERTEX_SRC = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAGMENT_SRC = `
precision highp float;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec3  u_color;
uniform float u_cell;
uniform float u_dpr;
uniform float u_scale;
uniform float u_low;
uniform float u_high;
uniform float u_alpha;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float total = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    total += valueNoise(p) * amp;
    p *= 2.0;
    amp *= 0.5;
  }
  return total;
}

float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;

  // Unáší zprava doleva; svislý člen brání dojmu pásového dopravníku tím,
  // že pole při cestě pomalu přehýbá.
  vec2 p = vec2(uv.x * aspect, uv.y) * u_scale;
  p.x += u_time * 0.05;

  // Doménový warp - tohle dělá tvar organickým místo sinusového vlnění.
  vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
  float field = fbm(p + 1.9 * q + vec2(0.0, u_time * 0.01));

  float v = smoothstep(u_low, u_high, field);

  // Drží vzor ve vodorovné stuze přes střed plátna.
  float band = 1.0 - smoothstep(0.10, 0.62, abs(uv.y - 0.5));
  v *= band * band;

  if (v <= 0.001) discard;

  // Dither proti masce ukotvené na obrazovce, v css px - textura tak drží
  // svou velikost i na retině místo zdvojnásobení rozlišení.
  vec2 cell = gl_FragCoord.xy / (u_cell * u_dpr);
  if (v < bayer8(cell)) discard;

  gl_FragColor = vec4(u_color * u_alpha, u_alpha);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// Barvu necháváme projít přes DOM (span + getComputedStyle), aby šlo poslat
// i `var(--token)`, ne jen pevný hex.
function resolveColor(css: string): [number, number, number] {
  const span = document.createElement("span");
  span.style.color = css;
  span.style.display = "none";
  document.body.appendChild(span);
  const rgb = getComputedStyle(span).color;
  document.body.removeChild(span);
  const nums = rgb.match(/[\d.]+/g);
  if (!nums || nums.length < 3) return [0, 0, 0];
  return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255];
}

function startRenderLoop(canvas: HTMLCanvasElement, color: string): (() => void) | undefined {
  const gl =
    (canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true }) as WebGLRenderingContext | null) ??
    (canvas.getContext("experimental-webgl", { alpha: true, antialias: false, premultipliedAlpha: true }) as WebGLRenderingContext | null);
  if (!gl || gl.isContextLost()) return;
  // Zúžení na non-null zůstane platné i uvnitř `tick` níž (rekurzivní function
  // declaration by TS narrowing z vnějšího scope jinak zahodilo).
  const glNn = gl;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  const program = gl.createProgram();
  if (!vertexShader || !fragmentShader || !program) return;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const uResolution = gl.getUniformLocation(program, "u_resolution");
  const uTime = gl.getUniformLocation(program, "u_time");
  const uColor = gl.getUniformLocation(program, "u_color");
  const uCell = gl.getUniformLocation(program, "u_cell");
  const uDpr = gl.getUniformLocation(program, "u_dpr");
  const uScale = gl.getUniformLocation(program, "u_scale");
  const uLow = gl.getUniformLocation(program, "u_low");
  const uHigh = gl.getUniformLocation(program, "u_high");
  const uAlpha = gl.getUniformLocation(program, "u_alpha");
  gl.uniform1f(uCell, 2.2);
  gl.uniform1f(uScale, 2.6);
  gl.uniform1f(uLow, 0.52);
  gl.uniform1f(uHigh, 0.72);
  gl.uniform1f(uAlpha, 0.58);

  const [r, g, b] = resolveColor(color);
  gl.uniform3f(uColor, r, g, b);

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (w <= 0 || h <= 0) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uResolution, w, h);
    gl.uniform1f(uDpr, dpr);
  };
  resize();

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let contextLost = false;
  const onContextLost = (e: Event) => {
    e.preventDefault();
    contextLost = true;
  };
  const onContextRestored = () => {
    contextLost = false;
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  let running = true;
  let frame = 0;
  const start = performance.now();
  let lastFrameTime = 0;
  let frozen = false;

  function tick(now: number) {
    if (!running) return;
    frame = requestAnimationFrame(tick);
    if (contextLost) return;
    // Reduced motion: první snímek zamrzne na čase 0, dál se nekreslí.
    if (now - lastFrameTime < 30 || (reduceMotion && frozen)) return;
    lastFrameTime = now;
    frozen = true;
    glNn.uniform1f(uTime, reduceMotion ? 0 : (now - start) / 1000);
    glNn.clearColor(0, 0, 0, 0);
    glNn.clear(glNn.COLOR_BUFFER_BIT);
    glNn.drawArrays(glNn.TRIANGLES, 0, 6);
  }

  const onVisibility = () => {
    running = !document.hidden;
    if (running) frame = requestAnimationFrame(tick);
  };
  document.addEventListener("visibilitychange", onVisibility);
  frame = requestAnimationFrame(tick);

  return () => {
    running = false;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteBuffer(buffer);
  };
}

export function LoginBackground({ color, className }: { color: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let stopped = false;
    let attempts = 0;
    let frame = 0;
    let cleanup: (() => void) | undefined;
    // WebGL kontext může chvíli po mountu ještě nebýt dostupný (např. za GPU
    // throttlingem na pozadí) – pár snímků to zkusíme znovu, pak to vzdáme.
    const attempt = () => {
      if (stopped) return;
      cleanup = startRenderLoop(canvas, color);
      if (!cleanup && attempts < 60) {
        attempts += 1;
        frame = requestAnimationFrame(attempt);
      }
    };
    attempt();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      cleanup?.();
    };
  }, [color]);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
