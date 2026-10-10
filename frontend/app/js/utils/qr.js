/**
 * WorkCred Dependency-Free QR Code Generator
 * Generates valid QR code SVG string and matrix in pure JS (ES Module).
 * Supports Byte Mode, Error Correction Level M (15%), Versions 1 to 10.
 */

// GF(256) Log and Exp tables using primitive polynomial 0x11D (285)
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);
(() => {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    EXP_TABLE[i + 255] = val;
    LOG_TABLE[val] = i;
    val = (val << 1) ^ (val >= 128 ? 0x11d : 0);
  }
  LOG_TABLE[0] = 0;
})();

function gfMul(x, y) {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
}

function polyMul(p1, p2) {
  const result = new Uint8Array(p1.length + p2.length - 1);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      result[i + j] ^= gfMul(p1[i], p2[j]);
    }
  }
  return result;
}

function getGeneratorPoly(deg) {
  let g = new Uint8Array([1]);
  for (let i = 0; i < deg; i++) {
    g = polyMul(g, new Uint8Array([1, EXP_TABLE[i]]));
  }
  return g;
}

function rsEncode(data, ecCount) {
  const gen = getGeneratorPoly(ecCount);
  const remainder = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[ecCount - 1] = 0;
    for (let j = 0; j < ecCount; j++) {
      remainder[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return remainder;
}

// Version table for EC Level M (byte capacity, total codeworks, ec per block, blocks)
const VERSION_SPECS_M = [
  null,
  { version: 1, size: 21, dataBytes: 14, totalBytes: 26, ecPerBlock: 10, blocks: 1, align: [] },
  { version: 2, size: 25, dataBytes: 26, totalBytes: 44, ecPerBlock: 16, blocks: 1, align: [6, 18] },
  { version: 3, size: 29, dataBytes: 42, totalBytes: 70, ecPerBlock: 26, blocks: 1, align: [6, 22] },
  { version: 4, size: 33, dataBytes: 62, totalBytes: 100, ecPerBlock: 18, blocks: 2, align: [6, 26] },
  { version: 5, size: 37, dataBytes: 84, totalBytes: 134, ecPerBlock: 24, blocks: 2, align: [6, 30] },
  { version: 6, size: 41, dataBytes: 106, totalBytes: 172, ecPerBlock: 16, blocks: 4, align: [6, 34] },
  { version: 7, size: 45, dataBytes: 122, totalBytes: 196, ecPerBlock: 18, blocks: 4, align: [6, 22, 38] },
  { version: 8, size: 49, dataBytes: 152, totalBytes: 242, ecPerBlock: 22, blocks: 4, align: [6, 24, 42] },
  { version: 9, size: 53, dataBytes: 180, totalBytes: 292, ecPerBlock: 22, blocks: 5, align: [6, 26, 46] },
  { version: 10, size: 57, dataBytes: 213, totalBytes: 346, ecPerBlock: 26, blocks: 5, align: [6, 28, 50] },
];

function selectVersion(byteLength) {
  for (let v = 1; v <= 10; v++) {
    // 4 bits mode + (v < 10 ? 8 : 16) bits char count
    const overhead = v < 10 ? 12 : 20;
    const capacity = Math.floor((VERSION_SPECS_M[v].dataBytes * 8 - overhead) / 8);
    if (byteLength <= capacity) return v;
  }
  throw new Error(`Data too long for QR Code (max ~200 bytes, got ${byteLength})`);
}

function encodeData(text, version) {
  const spec = VERSION_SPECS_M[version];
  const utf8 = new TextEncoder().encode(text);
  const bitArray = [];

  const writeBits = (val, length) => {
    for (let i = length - 1; i >= 0; i--) {
      bitArray.push((val >> i) & 1);
    }
  };

  // Byte mode indicator: 0100
  writeBits(0b0100, 4);
  // Character count
  writeBits(utf8.length, version < 10 ? 8 : 16);
  // Payload
  for (const b of utf8) writeBits(b, 8);

  // Terminator (up to 4 zeroes)
  const maxBits = spec.dataBytes * 8;
  const termBits = Math.min(4, maxBits - bitArray.length);
  for (let i = 0; i < termBits; i++) bitArray.push(0);

  // Pad to byte boundary
  while (bitArray.length % 8 !== 0) bitArray.push(0);

  // Pad bytes 0xEC and 0x11
  const padPatterns = [0xec, 0x11];
  let padIdx = 0;
  while (bitArray.length < maxBits) {
    writeBits(padPatterns[padIdx % 2], 8);
    padIdx++;
  }

  const bytes = new Uint8Array(spec.dataBytes);
  for (let i = 0; i < bytes.length; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bitArray[i * 8 + j];
    bytes[i] = b;
  }

  return bytes;
}

function buildCodewords(dataBytes, spec) {
  const totalBlocks = spec.blocks;
  const baseBlockDataLen = Math.floor(spec.dataBytes / totalBlocks);
  const extraDataBlocks = spec.dataBytes % totalBlocks;
  const ecLen = spec.ecPerBlock;

  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;

  for (let b = 0; b < totalBlocks; b++) {
    const dLen = baseBlockDataLen + (b >= totalBlocks - extraDataBlocks ? 1 : 0);
    const slice = dataBytes.slice(offset, offset + dLen);
    offset += dLen;
    dataBlocks.push(slice);
    ecBlocks.push(rsEncode(slice, ecLen));
  }

  // Interleave data
  const finalCodewords = [];
  const maxDataBlockLen = Math.max(...dataBlocks.map((d) => d.length));
  for (let i = 0; i < maxDataBlockLen; i++) {
    for (let b = 0; b < totalBlocks; b++) {
      if (i < dataBlocks[b].length) finalCodewords.push(dataBlocks[b][i]);
    }
  }
  // Interleave EC
  for (let i = 0; i < ecLen; i++) {
    for (let b = 0; b < totalBlocks; b++) {
      finalCodewords.push(ecBlocks[b][i]);
    }
  }

  return new Uint8Array(finalCodewords);
}

function createMatrix(version) {
  const spec = VERSION_SPECS_M[version];
  const size = spec.size;
  // matrix: 0=light, 1=dark, -1=unassigned
  const mat = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const isFunction = Array.from({ length: size }, () => new Uint8Array(size));

  function setFinder(row, col) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isDark = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        mat[row + r][col + c] = isDark ? 1 : 0;
        isFunction[row + r][col + c] = 1;
      }
    }
    // Separator
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && !isFunction[nr][nc]) {
          mat[nr][nc] = 0;
          isFunction[nr][nc] = 1;
        }
      }
    }
  }

  // Finders
  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0 ? 1 : 0;
    if (!isFunction[6][i]) { mat[6][i] = val; isFunction[6][i] = 1; }
    if (!isFunction[i][6]) { mat[i][6] = val; isFunction[i][6] = 1; }
  }

  // Alignment patterns
  const aligns = spec.align;
  if (aligns.length > 0) {
    for (const r of aligns) {
      for (const c of aligns) {
        if (isFunction[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isDark = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
            mat[r + dr][c + dc] = isDark ? 1 : 0;
            isFunction[r + dr][c + dc] = 1;
          }
        }
      }
    }
  }

  // Dark module
  mat[4 * version + 9][8] = 1;
  isFunction[4 * version + 9][8] = 1;

  // Reserve format information areas
  for (let i = 0; i < 9; i++) {
    if (i !== 6) { isFunction[8][i] = 1; isFunction[i][8] = 1; }
  }
  for (let i = 0; i < 8; i++) {
    isFunction[8][size - 1 - i] = 1;
    isFunction[size - 1 - i][8] = 1;
  }

  return { mat, isFunction, size };
}

// Format info strings for EC M (mask patterns 0..7 with BCH 15,5 error correction)
const FORMAT_INFO_M = [
  0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0,
];

function applyMaskAndFormat(matrixObj, maskPattern) {
  const { mat, isFunction, size } = matrixObj;
  const result = Array.from({ length: size }, () => new Uint8Array(size));

  const maskFn = [
    (r, c) => (r + c) % 2 === 0,
    (r, c) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ][maskPattern];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let val = mat[r][c];
      if (!isFunction[r][c]) {
        if (maskFn(r, c)) val = val ^ 1;
      }
      result[r][c] = val === 1 ? 1 : 0;
    }
  }

  // Apply format info
  const fmt = FORMAT_INFO_M[maskPattern];
  for (let i = 0; i < 15; i++) {
    const bit = (fmt >> (14 - i)) & 1;
    // Top-left
    if (i < 6) result[8][i] = bit;
    else if (i === 6) result[8][7] = bit;
    else if (i === 7) result[8][8] = bit;
    else if (i === 8) result[7][8] = bit;
    else result[14 - i][8] = bit;

    // Bottom-left / Top-right
    if (i < 8) result[size - 1 - i][8] = bit;
    else result[8][size - 15 + i] = bit;
  }

  return result;
}

function placeData(matrixObj, codewords) {
  const { mat, isFunction, size } = matrixObj;
  let bitIdx = 0;
  const totalBits = codewords.length * 8;

  let right = size - 1;
  let upward = true;

  while (right > 0) {
    if (right === 6) right--; // skip timing column

    const rows = [];
    if (upward) {
      for (let r = size - 1; r >= 0; r--) rows.push(r);
    } else {
      for (let r = 0; r < size; r++) rows.push(r);
    }

    for (const r of rows) {
      for (const col of [right, right - 1]) {
        if (!isFunction[r][col]) {
          let bit = 0;
          if (bitIdx < totalBits) {
            const byte = codewords[Math.floor(bitIdx / 8)];
            bit = (byte >> (7 - (bitIdx % 8))) & 1;
            bitIdx++;
          }
          mat[r][col] = bit;
        }
      }
    }
    right -= 2;
    upward = !upward;
  }
}

/**
 * Generate binary QR matrix for text string.
 * @param {string} text - URL or text payload
 * @returns {Array<Array<number>>} 2D binary matrix (1=dark, 0=light)
 */
export function generateQrMatrix(text) {
  const version = selectVersion(new TextEncoder().encode(text).length);
  const spec = VERSION_SPECS_M[version];
  const dataBytes = encodeData(text, version);
  const codewords = buildCodewords(dataBytes, spec);
  const matrixObj = createMatrix(version);
  placeData(matrixObj, codewords);

  // Mask pattern 0 is standard and clean
  return applyMaskAndFormat(matrixObj, 0);
}

/**
 * Generate accessible SVG string for a QR code.
 * @param {string} text - Destination URL / string
 * @param {object} options - { title, margin, darkColor, lightColor, sizePx }
 * @returns {string} Clean SVG markup
 */
export function generateQrSvg(text, options = {}) {
  const {
    title = `QR code for ${text}`,
    margin = 4,
    darkColor = 'currentColor',
    lightColor = 'var(--surface, #ffffff)',
    sizePx = 240,
  } = options;

  const matrix = generateQrMatrix(text);
  const rawSize = matrix.length;
  const totalSize = rawSize + margin * 2;

  let pathData = '';
  for (let r = 0; r < rawSize; r++) {
    for (let c = 0; c < rawSize; c++) {
      if (matrix[r][c] === 1) {
        pathData += `M${c + margin},${r + margin}h1v1h-1z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${sizePx}" height="${sizePx}" class="wc-qr-svg" role="img" aria-label="${escapeAttr(title)}">
  <title>${escapeHtml(title)}</title>
  <rect width="100%" height="100%" fill="${lightColor}" rx="4" />
  <path d="${pathData.trim()}" fill="${darkColor}" fill-rule="evenodd" />
</svg>`;
}

/**
 * Convert SVG string to downloadable PNG data URL.
 * @param {string} svgString 
 * @param {number} width 
 * @returns {Promise<string>} PNG Data URL
 */
export async function qrSvgToPng(svgString, width = 512) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = width;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, width);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttr(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}
