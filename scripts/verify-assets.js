import fs from 'node:fs';
import path from 'node:path';

async function verify() {
  const res = await fetch('http://localhost:3000/index.html');
  console.log('HTTP Status:', res.status, res.statusText);
  const html = await res.text();

  console.log('HTML Byte Size:', Buffer.byteLength(html));
  console.log('Title Check:', html.includes('WorkCred — Proof of work, work near you.'));
  console.log('Tokens CSS Check:', html.includes('css/tokens.css'));
  console.log('Base CSS Check:', html.includes('css/base.css'));
  console.log('Components CSS Check:', html.includes('css/components.css'));
  console.log('Landing CSS Check:', html.includes('css/landing.css'));
  console.log('Landing JS Check:', html.includes('js/landing.js'));

  // Test asset resources
  const assetUrls = [
    'css/tokens.css',
    'css/base.css',
    'css/components.css',
    'css/landing.css',
    'js/landing.js',
    'js/motion.js',
    'js/vendor/gsap.js',
    'js/vendor/lenis.js',
    'js/vendor/ScrollTrigger.js',
    'assets/images/ravi-kumar.svg',
    'assets/images/sunil-mehta.svg',
    'assets/images/avatar-1.svg',
    'manifest.webmanifest',
    'app.html'
  ];

  console.log('\n--- Asset HTTP 200 Checks ---');
  for (const asset of assetUrls) {
    const aRes = await fetch(`http://localhost:3000/${asset}`);
    if (aRes.status === 200) {
      console.log(`[PASS] ${asset} (200 OK, ${aRes.headers.get('content-length') || 'served'} bytes)`);
    } else {
      console.error(`[FAIL] ${asset} (${aRes.status} ${aRes.statusText})`);
    }
  }
}

verify().catch(console.error);
