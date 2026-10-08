/**
 * The colour grade the High and Ultra graphics steps draw after tone mapping, on
 * display-referred colour: a gentle S-curve for contrast, cool shadows and warm
 * highlights, a touch more saturation and a soft vignette. `amount` 0 leaves the image
 * exactly as it was.
 */
export const GradeShader = {
  name: "GradeShader",
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 1 },
    vignette: { value: 0.24 },
    aspect: { value: 1.6 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float vignette;
    uniform float aspect;
    varying vec2 vUv;
    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = clamp(texel.rgb, 0.0, 1.0);
      // Contrast: part of the way to a smoothstep curve (mid-grey stays put).
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.16 * amount);
      // Split tone: cool, slightly blue shadows; warm candle-lit highlights.
      float l = dot(c, LUMA);
      vec3 tint = mix(vec3(-0.010, 0.002, 0.020), vec3(0.022, 0.008, -0.018), smoothstep(0.12, 0.7, l));
      c += tint * amount * (1.0 - abs(l - 0.45));
      // A little more colour, never in the highlights.
      float g = dot(c, LUMA);
      c = mix(vec3(g), c, 1.0 + 0.08 * amount * (1.0 - g));
      // Vignette: an ellipse that darkens the corners, not the sides of the HUD's text.
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0) / max(aspect, 1.0);
      float v = smoothstep(0.28, 0.78, length(d) * 1.12);
      c *= 1.0 - vignette * amount * v;
      gl_FragColor = vec4(c, texel.a);
    }`,
};
