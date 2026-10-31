// 海市的空氣：換掉 three.js 所有內建材質共用的霧，改成從近處就開始、越低越濃的高度霧，
// 混霧前先把物體的顏色調成夜色：暗部抬成藍紫灰、不亮的地方降飽和、綠色往藍綠推，燈籠留著原本的橘。
// 不加後製，手機和電腦看到的一樣；參數放在一個共用的物件上，每個材質都讀同一份，拉面板即時生效。
// 只有海市會裝，畫廊不受影響。uGrade.on 是 0 的材質（自己寫的 ShaderMaterial 沒給這組參數）照舊用原本的線性霧
import * as THREE from 'three';

// density：相機高度的霧有多濃；falloff：每往上一公尺變淡多少；base：霧最濃的高度（海面）；start：鏡頭前幾公尺不起霧
// shadow：最暗的地方抬到這個顏色（sRGB），不會再是黑的；desat：暗部和中間調降多少飽和度；cool：綠色往藍綠推多少
export const GRADE = {
  on: 1, density: 0.016, falloff: 0.04, base: -0.6, start: 6, maxFog: 1,
  shadow: new THREE.Vector3(), desat: 0.2, cool: 0.9,
};
setShadow('#16151b');
function setShadow(hex) {
  const n = parseInt(hex.slice(1), 16);
  GRADE.shadow.set((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  GRADE.shadowHex = hex;
}

const PARS_VERTEX = `#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorld;
#endif`;

// 從觀察空間換回世界座標：觀察矩陣只有旋轉和位移，轉置就是反轉
const VERTEX = `#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorld = cameraPosition + ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
#endif`;

const PARS_FRAGMENT = `#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogWorld;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	struct Grade { float on; float density; float falloff; float base; float start; float maxFog; vec3 shadow; float desat; float cool; };
	uniform Grade uGrade;
#endif`;

// 霧在 colorspace 之後才上：直接畫上螢幕時這裡已經是 sRGB，畫進後製的貼圖時還是線性的，three.js 給的 fogColor 也跟著同一個空間。
// 調色在 sRGB 做（抬暗部、降飽和用眼睛看到的明暗來算才準），混霧換回線性做：遠處退得比較亮、比較像空氣，不會灰灰髒髒的。
// 先調色再混霧，完全進霧的遠山還是等於地平線的顏色，山和天空接的地方不會多一條線。
// 降飽和照最亮的那個色版算：燈籠、窗光再橘都留著，夜色裡只剩燈是暖的
// 高度霧照 Íñigo Quílez 的解析解：沿著視線把隨高度指數變淡的濃度積分起來
const FRAGMENT = `#ifdef USE_FOG
	if ( uGrade.on > 0.5 ) {
		bool srgbOut = linearToOutputTexel( vec4( 0.5 ) ).r > 0.6;
		vec3 s = srgbOut ? gl_FragColor.rgb : sRGBTransferOETF( vec4( gl_FragColor.rgb, 1.0 ) ).rgb;
		float green = max( s.g - max( s.r, s.b ), 0.0 );
		s += vec3( - 0.1, - 0.7, 0.6 ) * green * uGrade.cool;
		float bright = max( s.r, max( s.g, s.b ) );
		s = mix( s, vec3( dot( s, vec3( 0.2126, 0.7152, 0.0722 ) ) ), uGrade.desat * ( 1.0 - smoothstep( 0.55, 0.95, bright ) ) );
		s = uGrade.shadow + s * ( 1.0 - uGrade.shadow );
		vec3 c = sRGBTransferEOTF( vec4( max( s, 0.0 ), 1.0 ) ).rgb;
		vec3 fogLin = srgbOut ? sRGBTransferEOTF( vec4( fogColor, 1.0 ) ).rgb : fogColor;
		vec3 ray = vFogWorld - cameraPosition;
		float dist = length( ray );
		float bdy = uGrade.falloff * ray.y;
		float slope = abs( bdy ) > 1e-4 ? ( 1.0 - exp( - bdy ) ) / bdy : 1.0;
		float amount = uGrade.density * exp( - uGrade.falloff * ( cameraPosition.y - uGrade.base ) ) * max( dist - uGrade.start, 0.0 ) * slope;
		c = mix( c, fogLin, min( 1.0 - exp( - amount ), uGrade.maxFog ) );
		gl_FragColor.rgb = srgbOut ? sRGBTransferOETF( vec4( c, 1.0 ) ).rgb : c;
	} else {
		#ifdef FOG_EXP2
			float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
		#else
			float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		#endif
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	}
#endif`;

// 要在第一個材質編譯前呼叫。內建材質的參數是從 ShaderLib 複製出來的，
// 純物件不會被深拷貝，所以每個材質的 uGrade 都指向同一個 GRADE
export function installGrade() {
  Object.assign(THREE.ShaderChunk, {
    fog_pars_vertex: PARS_VERTEX, fog_vertex: VERTEX, fog_pars_fragment: PARS_FRAGMENT, fog_fragment: FRAGMENT,
  });
  for (const lib of Object.values(THREE.ShaderLib)) {
    if (lib.fragmentShader.includes('fog_fragment')) lib.uniforms.uGrade = { value: GRADE };
  }
}

// ?debug 時右上角的調整面板：拉了馬上看到，「關」可以跟原本的霧對照，「複製」把數值貼回 grade.js
const SLIDERS = [
  ['density', 0, 0.06, 0.001], ['falloff', 0, 0.15, 0.002], ['base', -10, 30, 0.5], ['start', 0, 40, 1], ['maxFog', 0, 1, 0.01],
  ['desat', 0, 1, 0.01], ['cool', 0, 1.5, 0.01],
];
export function gradePanel() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;right:8px;top:8px;z-index:99;padding:6px 8px;font:11px/1.6 monospace;color:#cfe;background:#000a;display:grid;grid-template-columns:auto 120px 44px;gap:0 6px;align-items:center';
  for (const [k, min, max, step] of SLIDERS) {
    const label = document.createElement('span'), range = document.createElement('input'), out = document.createElement('span');
    label.textContent = k;
    Object.assign(range, { type: 'range', min, max, step, value: GRADE[k] });
    out.textContent = GRADE[k];
    range.oninput = () => { GRADE[k] = Number(range.value); out.textContent = range.value; };
    el.append(label, range, out);
  }
  const shadowLabel = document.createElement('span'), shadow = document.createElement('input'), shadowOut = document.createElement('span');
  shadowLabel.textContent = 'shadow';
  Object.assign(shadow, { type: 'color', value: GRADE.shadowHex });
  shadowOut.textContent = GRADE.shadowHex;
  shadow.oninput = () => { setShadow(shadow.value); shadowOut.textContent = shadow.value; };
  el.append(shadowLabel, shadow, shadowOut);
  const toggle = document.createElement('button'), copy = document.createElement('button');
  toggle.textContent = '關';
  toggle.onclick = () => { GRADE.on = GRADE.on ? 0 : 1; toggle.textContent = GRADE.on ? '關' : '開'; };
  copy.textContent = '複製';
  copy.onclick = () => {
    const text = JSON.stringify({ ...Object.fromEntries(SLIDERS.map(([k]) => [k, GRADE[k]])), shadow: GRADE.shadowHex });
    navigator.clipboard?.writeText(text);
    console.log('grade', text);
  };
  el.append(toggle, copy);
  // 拖曳面板時不要轉到視角
  for (const ev of ['pointerdown', 'wheel', 'keydown']) el.addEventListener(ev, (e) => e.stopPropagation());
  document.body.appendChild(el);
}
