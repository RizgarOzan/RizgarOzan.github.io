// GSAP's minified build (dist/gsap.min.js, core + CSSPlugin) is a classic script that index.html
// runs (deferred) before the modules; this re-exports its window.gsap as a module.
export const gsap = window.gsap;
export default gsap;
