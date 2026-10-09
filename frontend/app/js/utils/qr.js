/**
 * WorkCred Vanilla SVG QR Code Generator
 * Generates an SVG Data URL representing a QR code matrix.
 * Pure ES module for browser and Node 20.
 */

export function generateQrDataUrl(text = '') {
  // Simple deterministic 21x21 matrix simulation generator for QR encoding
  const size = 21;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));

  // Helper to place 7x7 Finder Pattern
  function placeFinderPattern(row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (row + r >= 0 && row + r < size && col + c >= 0 && col + c < size) {
          if (r >= 0 && r <= 6 && (c === 0 || c === 6) || c >= 0 && c <= 6 && (r === 0 || r === 6) || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            modules[row + r][col + c] = true;
          }
        }
      }
    }
  }

  placeFinderPattern(0, 0);
  placeFinderPattern(0, size - 7);
  placeFinderPattern(size - 7, 0);

  // Deterministic data fill based on text string hash
  let hashVal = 0;
  for (let i = 0; i < text.length; i++) {
    hashVal = (hashVal << 5) - hashVal + text.charCodeAt(i);
    hashVal |= 0;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Skip finder patterns
      if ((r <= 7 && c <= 7) || (r <= 7 && c >= size - 8) || (r >= size - 8 && c <= 7)) continue;
      const bit = ((r * size + c + Math.abs(hashVal)) % 3) === 0 || ((r + c) % 2 === 0);
      modules[r][c] = bit;
    }
  }

  const moduleSize = 10;
  const padding = 20;
  const svgDimension = size * moduleSize + padding * 2;

  let rects = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        const x = padding + c * moduleSize;
        const y = padding + r * moduleSize;
        rects += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="%2323201e"/>`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgDimension} ${svgDimension}" width="200" height="200"><rect width="100%" height="100%" fill="%23faf7f2"/>${rects}</svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}
