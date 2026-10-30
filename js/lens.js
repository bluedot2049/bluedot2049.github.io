// 魚眼：先用一般的透視鏡頭畫一張比較廣的原圖，再用一道全螢幕的著色器把它往外彎。
// 彎法用 r = f·tan(kθ)/k：k = 1 就是一般鏡頭（直線不彎），k 越小越彎，接近 0 是等距魚眼。
// 攝影模式每幀算好 lens，這裡只管畫；對話框的位置也照同一條曲線換算（bend）。
import * as THREE from 'three';

// on：要不要彎；k：彎的程度；fo、fs：成像和原圖的焦距；w、h：成像的大小。都是 CSS 像素
export const lens = { on: false, k: 1, fo: 1, fs: 1, w: 1, h: 1 };
// 原圖最斜只畫到這個角度，再外面是鏡頭邊緣的暗角。暗角只看角度，所以預覽和存檔大小不同也一樣
export const COVER = THREE.MathUtils.degToRad(70);

// 原圖的焦距：要剛好把 w × h 的成像裡、COVER 以內看得到的部分都包進來
// 沿著每個方向找成像裡最遠看得到的點，原圖的框要包住它換回去的位置
export function fitSource(w, h) {
  const { k, fo } = lens, edge = fo * Math.tan(k * COVER) / k;
  let fs = Infinity;
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    const r = Math.min(edge, c > 1e-6 ? w / 2 / c : Infinity, s > 1e-6 ? h / 2 / s : Infinity);
    const t = Math.tan(Math.atan(k * r / fo) / k);
    fs = Math.min(fs, c > 1e-6 ? w / 2 / (t * c) : Infinity, s > 1e-6 ? h / 2 / (t * s) : Infinity);
  }
  return fs;
}

// project() 算出的是原圖上的位置（-1..1），換成彎過之後畫面上的位置
export function bend(v) {
  if (!lens.on) return v;
  const x = v.x * window.innerWidth / 2, y = v.y * window.innerHeight / 2, r = Math.hypot(x, y);
  if (r < 1e-6) return v;
  const s = lens.fo * Math.tan(lens.k * Math.atan(r / lens.fs)) / lens.k / r;
  v.x *= s;
  v.y *= s;
  return v;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// 從成像的每一點反推它在原圖上的位置；原圖畫不到的地方慢慢暗下去，像鏡頭邊緣
const FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uK, uFo, uFs, uAspect, uCover;
varying vec2 vUv;
void main() {
  vec2 q = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0);
  float r = length(q);
  float th = atan(uK * r / uFo) / uK;
  vec2 p = r > 1e-5 ? q * (uFs * tan(min(th, uCover)) / r) : q * (uFs / uFo);
  vec2 uv = p / vec2(uAspect, 1.0) * 0.5 + 0.5;
  float keep = 1.0 - smoothstep(uCover - 0.012, uCover, th);
  gl_FragColor = vec4(texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb * keep, 1.0);
  #include <colorspace_fragment>
}`;

export class LensPass {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uK: { value: 1 }, uFo: { value: 1 }, uFs: { value: 1 }, uAspect: { value: 1 }, uCover: { value: COVER } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // 沒有後製時原圖先畫進這裡；用半浮點，暗部才不會一圈一圈的
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.size = new THREE.Vector2();
    // 有後製時當成最後一道 pass 接在 composer 後面，拿前面畫好的結果來彎
    this.pass = {
      name: 'LensPass', enabled: false, renderToScreen: true,
      needsSwap: false, needsDepthTexture: false, needsDepthBlit: false,
      setSize() {}, initialize() {}, setDepthTexture() {}, getDepthTexture: () => null, dispose() {},
      render: (renderer, input) => this.draw(renderer, input.texture),
    };
  }

  // 把原圖 tex 彎過畫到螢幕上
  draw(renderer, tex) {
    const u = this.material.uniforms, hh = lens.h / 2;
    u.tDiffuse.value = tex;
    u.uK.value = lens.k;
    u.uFo.value = lens.fo / hh;
    u.uFs.value = lens.fs / hh;
    u.uAspect.value = lens.w / lens.h;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.cam);
  }

  // 沒有後製時：場景先畫進 target 再彎
  renderScene(renderer, scene, camera) {
    const t = this.target, s = renderer.getDrawingBufferSize(this.size);
    // 平常的畫面多重取樣去鋸齒；拍大張照片時太吃記憶體就不取樣
    const samples = s.x * s.y > 4e6 ? 0 : 4;
    if (t.samples !== samples) {
      t.samples = samples;
      t.dispose();
    }
    if (t.width !== s.x || t.height !== s.y) t.setSize(s.x, s.y);
    renderer.setRenderTarget(t);
    renderer.clear();
    renderer.render(scene, camera);
    this.draw(renderer, t.texture);
  }
}
