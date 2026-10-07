import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const vendorDir = path.join(root, 'frontend', 'js', 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });

// GSAP index and ScrollTrigger
const gsapSource = path.join(root, 'node_modules', 'gsap', 'index.js');
const scrollTriggerSource = path.join(root, 'node_modules', 'gsap', 'ScrollTrigger.js');
const lenisSource = path.join(root, 'node_modules', 'lenis', 'dist', 'lenis.mjs');

if (fs.existsSync(gsapSource)) {
  fs.copyFileSync(gsapSource, path.join(vendorDir, 'gsap.js'));
  console.log('Copied gsap.js to vendor');
}
if (fs.existsSync(scrollTriggerSource)) {
  fs.copyFileSync(scrollTriggerSource, path.join(vendorDir, 'ScrollTrigger.js'));
  console.log('Copied ScrollTrigger.js to vendor');
}
if (fs.existsSync(lenisSource)) {
  fs.copyFileSync(lenisSource, path.join(vendorDir, 'lenis.js'));
  console.log('Copied lenis.js to vendor');
}
