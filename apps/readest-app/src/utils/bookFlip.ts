import {
  perspective,
  planTurn,
  SEGMENTS,
  shade,
  sheetProfile,
  smoothstep,
} from './bookFlipGeometry';

/**
 * Page turn drawn like a real book, over a captured picture of the page(s) on screen.
 *
 * - Two pages side by side (landscape tablets, desktops): the right page turns over the spine in the
 *   middle and lands on the left; the left page stays put until it is covered. A backward turn is
 *   the mirror image: the left page turns over onto the right. Each sheet has a page on both sides:
 *   the page it is turned from on the front and the page it is turned to on the back.
 * - One page: forward, the page turns over the spine at the edge and leaves the screen; backward,
 *   the previous page comes in over the spine and lands on the page that was showing.
 *
 * The sheet is a strip of 2 x 37 vertices built on the CPU every frame (a handful of floats) and
 * drawn with one trivial shader: no per-pixel loops, so it stays smooth on old tablets. It bends as
 * paper does, is seen in perspective, is lit from above (darker as it turns away), shows the faint
 * paper with the text bleeding through on its back, and casts a soft shadow on the page beneath it.
 */

const VERTEX = `
attribute vec2 aPos;     // CSS px
attribute vec2 aUv;
attribute vec3 aInfo;    // shade, face (>= 0 front, < 0 back), alpha
uniform vec2 uSize;      // CSS px
varying vec2 vUv;
varying vec3 vInfo;
void main() {
  vUv = aUv;
  vInfo = aInfo;
  gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D uTex;      // the picture on the front of the sheet
uniform sampler2D uBackTex;  // the picture on its back (the page being turned to)
uniform sampler2D uPaper;    // plain paper, for a back without a picture
uniform float uHasBack;      // 1: the back has a picture of its own
uniform float uSolid;        // 1: draw black with the vertex alpha (shadows)
varying vec2 vUv;
varying vec3 vInfo;
void main() {
  if (uSolid > 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, vInfo.z);
    return;
  }
  vec4 page = texture2D(uTex, vUv);
  vec3 rgb;
  if (vInfo.y >= 0.0) {
    rgb = page.rgb * vInfo.x;
  } else if (uHasBack > 0.5) {
    // The back of the sheet is its own page, seen from behind: the same spot, mirrored across.
    rgb = texture2D(uBackTex, vec2(1.0 - vUv.x, vUv.y)).rgb * vInfo.x;
  } else {
    // No picture of the other page: the paper, with the text showing faintly through.
    vec3 paper = texture2D(uPaper, vUv).rgb;
    rgb = mix(paper, page.rgb, 0.1) * vInfo.x;
  }
  gl_FragColor = vec4(rgb * vInfo.z, vInfo.z);
}
`;

const FLOATS = 7;
/** How far above the book the viewer is, in page heights. */
const VIEW_DISTANCE = 4.2;
/** Where the soft shadow falls: how far it lands from the sheet per unit of height, and how dark. */
const SHADOWS: [number, number][] = [
  [0.22, 0.05],
  [0.34, 0.045],
  [0.47, 0.04],
  [0.62, 0.035],
  [0.8, 0.03],
  [1.0, 0.02],
];
const GUTTER_ALPHA = 0.14;
const GUTTER_WIDTH = 0.045;
/** The turn ends in a short dissolve into the page that is already there underneath. */
const LAND_FROM = 0.9;

export class BookFlipRenderer {
  /** Tells the turn pipeline this is the page flip (it keeps one surface per style). */
  readonly pageFlip = true;

  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private backTex: WebGLTexture | null = null;
  private uSolid: WebGLUniformLocation | null = null;
  private width = 0;
  private height = 0;
  private spread = false;
  private forward = true;
  private rtl = false;
  private hasIncoming = false;
  private uTex: WebGLUniformLocation | null = null;
  private uBackTex: WebGLUniformLocation | null = null;
  private uHasBack: WebGLUniformLocation | null = null;
  private data = new Float32Array((SEGMENTS + 1) * 2 * FLOATS);

  constructor(options: { preserveDrawingBuffer?: boolean } = {}) {
    this.preserveDrawingBuffer = options.preserveDrawingBuffer ?? false;
  }
  private preserveDrawingBuffer: boolean;

  /** Two pages on screen (the turn then hinges in the middle) or one (it hinges at the edge). */
  setSpread(spread: boolean) {
    this.spread = spread;
  }

  /** Which way this turn goes, and whether the book reads right to left. */
  setTurn(forward: boolean, rtl: boolean) {
    this.forward = forward;
    this.rtl = rtl;
  }

  attach(container: HTMLElement, width: number, height: number, dpr = window.devicePixelRatio) {
    this.width = width;
    this.height = height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: `${width}px`,
      height: `${height}px`,
      pointerEvents: 'none',
      zIndex: '50',
    });
    container.appendChild(canvas);
    this.canvas = canvas;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: this.preserveDrawingBuffer,
    });
    if (!gl) {
      this.dispose();
      throw new Error('WebGL unavailable');
    }
    this.gl = gl;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`shader: ${gl.getShaderInfoLog(shader)}`);
      }
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program: ${gl.getProgramInfoLog(program)}`);
    }
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL API, not a React hook
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    const stride = FLOATS * 4;
    const layout: [string, number, number][] = [
      ['aPos', 2, 0],
      ['aUv', 2, 2],
      ['aInfo', 3, 4],
    ];
    for (const [name, size, offset] of layout) {
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * 4);
    }
    gl.uniform2f(gl.getUniformLocation(program, 'uSize'), width, height);
    this.uTex = gl.getUniformLocation(program, 'uTex');
    this.uBackTex = gl.getUniformLocation(program, 'uBackTex');
    this.uHasBack = gl.getUniformLocation(program, 'uHasBack');
    gl.uniform1i(gl.getUniformLocation(program, 'uPaper'), 1);
    this.uSolid = gl.getUniformLocation(program, 'uSolid');

    // The paper on the back of the sheet: white until the theme's background arrives.
    this.backTex = this.makeTexture(1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    );
    gl.activeTexture(gl.TEXTURE0);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  private makeTexture(unit: number) {
    const gl = this.gl!;
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  /** The picture of the page(s) as they are before the turn. */
  setTexture(source: TexImageSource) {
    const gl = this.gl;
    if (!gl) return;
    this.makeTexture(0);
    // Uploaded as it is: row 0 is the top of the page, and the vertices say so. (WebKit ignores
    // UNPACK_FLIP_Y_WEBGL for ImageBitmap sources.)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  /**
   * A picture of the page(s) the turn goes to: what the back of the sheet shows (and, going back in
   * one-page view, the sheet itself). Without it the back is plain paper with the text faintly
   * through it.
   */
  setIncoming(source: TexImageSource | null) {
    const gl = this.gl;
    if (!gl || !source) {
      this.hasIncoming = false;
      return;
    }
    this.makeTexture(2);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.activeTexture(gl.TEXTURE0);
    this.hasIncoming = true;
  }

  /** The theme's paper (background colour and texture), drawn on the back of the sheet. */
  setBackdrop(source: TexImageSource) {
    const gl = this.gl;
    if (!gl || !this.backTex) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.backTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Draw the turn `progress` (0 = the page as it was, 1 = the page it turns to) of the way done. */
  render(progress: number) {
    const gl = this.gl;
    if (!gl) return;
    const p = Math.min(1, Math.max(0, progress));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const w = this.width;
    const h = this.height;
    const spread = this.spread;
    const plan = planTurn(
      { spread, forward: this.forward, rtl: this.rtl, hasIncoming: this.hasIncoming },
      p,
    );
    const mirror = plan.mirror;
    const spine = spread ? w / 2 : 0;
    const length = spread ? w / 2 : w;
    const landing = plan.dissolve ? 1 - smoothstep(LAND_FROM, 1, p) : 1;
    const flipX = (x: number) => (mirror ? w - x : x);
    const flipU = (u: number) => (mirror ? 1 - u : u);
    const sheetP = plan.sheetProgress;

    gl.uniform1f(this.uSolid, 0);
    // The old page stays where it is, until the sheet has covered it.
    this.pictures(0, 0);
    if (plan.stationary === 'half' && landing > 0) {
      this.quad(flipX(0), flipX(spine), flipU(0), flipU(0.5), landing);
    } else if (plan.stationary === 'full' && landing > 0) {
      this.quad(0, w, 0, 1, landing);
    }

    // The sheet in side view, then on screen: in perspective, lit, with its two faces told apart.
    const profile = sheetProfile(sheetP);
    const distance = VIEW_DISTANCE * h;
    const mid = h / 2;

    if (spread && sheetP > 0.001) this.gutter(sheetP, flipX, spine, landing);

    // Soft shadow on the page beneath: the sheet's footprint thrown away from the light.
    gl.uniform1f(this.uSolid, 1);
    for (const [reach, alpha] of SHADOWS) {
      let n = 0;
      for (const point of profile) {
        const x = flipX(spine + (point.x + point.z * reach) * length);
        const fade =
          (1 - smoothstep(0.05, 1.1, point.z)) * smoothstep(0, 0.04, point.z + sheetP * 0.04);
        const a = alpha * fade * landing * Math.min(1, sheetP * 8) * (spread ? 1 : 0.8);
        n = this.vertex(n, x, 0, 0, 0, 1, 1, a);
        n = this.vertex(n, x, h, 0, 0, 1, 1, a);
      }
      this.draw(n);
    }

    gl.uniform1f(this.uSolid, 0);
    // Front: the old page (or, going back in one-page view, the page coming in). Back: the new page.
    this.pictures(plan.frontIsIncoming ? 2 : 0, this.hasIncoming ? 2 : 0);
    // The back has its own page only when the sheet is an old page turning (not the incoming one).
    gl.uniform1f(this.uHasBack, this.hasIncoming && !plan.frontIsIncoming ? 1 : 0);
    let n = 0;
    for (const point of profile) {
      const k = perspective(point.z * length, distance);
      const x = flipX(spine + point.x * length * k);
      const back = Math.cos(point.phi) < 0;
      const light = shade(point.phi, back);
      const u = flipU(spread ? 0.5 + 0.5 * point.s : point.s);
      const face = Math.cos(point.phi);
      n = this.vertex(n, x, mid - mid * k, u, 0, light, face, landing);
      n = this.vertex(n, x, mid + mid * k, u, 1, light, face, landing);
    }
    this.draw(n);
  }

  /** Which picture is on the front of what is drawn next, and which on the back (texture units). */
  private pictures(front: number, back: number) {
    const gl = this.gl!;
    gl.uniform1i(this.uTex, front);
    gl.uniform1i(this.uBackTex, back);
  }

  /** A flat, lit rectangle of the picture from `x0` to `x1` px, `u0` to `u1` of its width. */
  private quad(x0: number, x1: number, u0: number, u1: number, alpha: number) {
    let n = 0;
    n = this.vertex(n, x0, 0, u0, 0, 1, 1, alpha);
    n = this.vertex(n, x0, this.height, u0, 1, 1, 1, alpha);
    n = this.vertex(n, x1, 0, u1, 0, 1, 1, alpha);
    n = this.vertex(n, x1, this.height, u1, 1, 1, 1, alpha);
    this.draw(n);
  }

  /** The dark crease in the middle of an open book, which deepens as the sheet lifts. */
  private gutter(p: number, flipX: (x: number) => number, spine: number, landing: number) {
    const gl = this.gl!;
    const reach = this.width * GUTTER_WIDTH;
    const strength = GUTTER_ALPHA * smoothstep(0, 0.08, p) * landing;
    gl.uniform1f(this.uSolid, 1);
    let n = 0;
    for (const [dx, a] of [
      [-reach, 0],
      [0, strength],
      [reach, 0],
    ] as const) {
      n = this.vertex(n, flipX(spine + dx), 0, 0, 0, 1, 1, a);
      n = this.vertex(n, flipX(spine + dx), this.height, 0, 1, 1, 1, a);
    }
    this.draw(n);
  }

  private vertex(
    n: number,
    x: number,
    y: number,
    u: number,
    v: number,
    light: number,
    face: number,
    alpha: number,
  ) {
    const d = this.data;
    d[n] = x;
    d[n + 1] = y;
    d[n + 2] = u;
    d[n + 3] = v;
    d[n + 4] = light;
    d[n + 5] = face;
    d[n + 6] = alpha;
    return n + FLOATS;
  }

  private draw(floats: number) {
    const gl = this.gl!;
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, floats), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, floats / FLOATS);
  }

  /** Read back a pixel (device px, origin top-left): used by tests. */
  readPixel(x: number, y: number): [number, number, number, number] {
    const gl = this.gl;
    const canvas = this.canvas;
    if (!gl || !canvas) return [0, 0, 0, 0];
    const data = new Uint8Array(4);
    gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return [data[0]!, data[1]!, data[2]!, data[3]!];
  }

  /** An idle surface may lose its WebGL context under memory pressure. */
  isUsable() {
    return !!this.gl && !this.gl.isContextLost();
  }

  dispose() {
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas?.remove();
    this.canvas = null;
    this.gl = null;
    this.backTex = null;
  }
}
