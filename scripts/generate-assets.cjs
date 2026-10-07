/**
 * generate-assets.js
 * Creates warm, illustrated SVG worker portraits for WorkCred's Community Narrative design.
 * Run: node scripts/generate-assets.js
 */

const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.resolve(__dirname, '../frontend/assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

const workers = [
  {
    file: 'worker-electrician.svg',
    skinTone: '#c8856a',
    skinShade: '#a96650',
    shirtColor: '#2a5a3b',
    shirtShade: '#1e4028',
    toolColor: '#d49b35',
    bgColor: '#c85a32',
    bgAccent: '#9f3c16',
    tradeIcon: `<!-- Wrench -->
      <rect x="180" y="195" width="7" height="22" rx="3" fill="#d49b35"/>
      <ellipse cx="183" cy="193" rx="7" ry="5" fill="#d49b35"/>`,
    tagline: 'Master Electrician · 12 yrs',
  },
  {
    file: 'worker-caretaker.svg',
    skinTone: '#c09572',
    skinShade: '#9a7055',
    shirtColor: '#c85a32',
    shirtShade: '#9f3c16',
    toolColor: '#f3efe6',
    bgColor: '#2a5a3b',
    bgAccent: '#1e4028',
    tradeIcon: `<!-- Broom / Home symbol -->
      <rect x="182" y="188" width="4" height="24" rx="2" fill="#f3efe6"/>
      <path d="M174 210 Q183 200 192 210" stroke="#f3efe6" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    tagline: 'Home Caretaker · 8 yrs',
  },
  {
    file: 'worker-carpenter.svg',
    skinTone: '#b07850',
    skinShade: '#8c5a30',
    shirtColor: '#23201e',
    shirtShade: '#16130f',
    toolColor: '#d49b35',
    bgColor: '#d49b35',
    bgAccent: '#a07025',
    tradeIcon: `<!-- Hammer -->
      <rect x="178" y="194" width="18" height="8" rx="4" fill="#d49b35"/>
      <rect x="183" y="200" width="4" height="18" rx="2" fill="#c8856a"/>`,
    tagline: 'Carpenter · 16 yrs',
  },
];

function makePortrait({ file, skinTone, skinShade, shirtColor, shirtShade, bgColor, bgAccent, tradeIcon, tagline }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 366 488" width="366" height="488">
  <defs>
    <radialGradient id="bg-${file}" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="${bgColor}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${bgAccent}"/>
    </radialGradient>
    <clipPath id="clip-${file}">
      <rect width="366" height="488" rx="0"/>
    </clipPath>
  </defs>
  <g clip-path="url(#clip-${file})">
    <!-- Background -->
    <rect width="366" height="488" fill="url(#bg-${file})"/>
    <!-- Subtle texture dots -->
    <circle cx="30" cy="30" r="80" fill="${bgAccent}" opacity="0.25"/>
    <circle cx="340" cy="440" r="100" fill="${bgAccent}" opacity="0.2"/>

    <!-- Body / torso (shirt) -->
    <ellipse cx="183" cy="430" rx="130" ry="80" fill="${shirtShade}"/>
    <ellipse cx="183" cy="370" rx="100" ry="65" fill="${shirtColor}"/>
    <!-- Neck -->
    <rect x="165" y="285" width="36" height="50" rx="10" fill="${skinShade}"/>
    <!-- Head -->
    <ellipse cx="183" cy="260" rx="66" ry="75" fill="${skinTone}"/>
    <!-- Face shading -->
    <ellipse cx="183" cy="270" rx="54" ry="60" fill="${skinTone}" opacity="0.6"/>
    <!-- Eyes -->
    <ellipse cx="160" cy="250" rx="8" ry="9" fill="#23201e"/>
    <ellipse cx="206" cy="250" rx="8" ry="9" fill="#23201e"/>
    <ellipse cx="158" cy="248" rx="3" ry="3" fill="#ffffff" opacity="0.5"/>
    <ellipse cx="204" cy="248" rx="3" ry="3" fill="#ffffff" opacity="0.5"/>
    <!-- Eyebrows -->
    <path d="M150 236 Q162 230 170 237" stroke="#5c544e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M196 237 Q204 230 216 236" stroke="#5c544e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <!-- Nose -->
    <path d="M183 255 Q178 270 183 278 Q188 270 183 255" fill="${skinShade}" opacity="0.5"/>
    <!-- Smile -->
    <path d="M166 292 Q183 306 200 292" stroke="#8c5a30" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <!-- Ears -->
    <ellipse cx="117" cy="260" rx="12" ry="16" fill="${skinShade}"/>
    <ellipse cx="249" cy="260" rx="12" ry="16" fill="${skinShade}"/>
    <!-- Hair (simple) -->
    <ellipse cx="183" cy="190" rx="68" ry="38" fill="#23201e"/>
    <!-- Trade icon overlay -->
    ${tradeIcon}
  </g>
</svg>`;
  fs.writeFileSync(path.join(ASSETS_DIR, file), svg);
  console.log(`✅  Created: ${file}`);
}

workers.forEach(makePortrait);
console.log('\n🎨  All worker portraits generated in frontend/assets/');
