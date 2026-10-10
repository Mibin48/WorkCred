import test from 'node:test';
import assert from 'node:assert/strict';
import { generateQrMatrix, generateQrSvg } from '../frontend/app/js/utils/qr.js';

test('QR Generator generates valid matrix dimensions for URLs', () => {
  const url1 = 'https://workcred.org/p/ravi-kumar-8472';
  const matrix1 = generateQrMatrix(url1);

  // Expected version 3 (29x29) or version 4 (33x33) for ~40 char URL
  assert.ok([25, 29, 33].includes(matrix1.length), `Matrix size should match QR version, got ${matrix1.length}`);
  assert.equal(matrix1.length, matrix1[0].length, 'Matrix must be square');

  // Verify finder pattern corners (top-left 7x7 finder pattern)
  // Top row must be dark
  for (let c = 0; c < 7; c++) {
    assert.equal(matrix1[0][c], 1, `Top-left finder row 0 col ${c} should be dark`);
    assert.equal(matrix1[6][c], 1, `Top-left finder row 6 col ${c} should be dark`);
  }
  // Center module of finder (row 3, col 3) must be dark
  assert.equal(matrix1[3][3], 1, 'Finder center must be dark');
  // Row 1, col 1 must be light
  assert.equal(matrix1[1][1], 0, 'Finder ring module must be light');
});

test('QR Generator generates accessible SVG string with quiet zone', () => {
  const url = 'https://workcred.org/p/meera-patel-9912';
  const svg = generateQrSvg(url, {
    title: "QR code for Meera Patel's Work Passport",
    margin: 4,
    darkColor: '#23201e',
    lightColor: '#ffffff',
    sizePx: 200,
  });

  assert.ok(svg.startsWith('<svg'), 'Output should start with SVG tag');
  assert.ok(svg.includes('role="img"'), 'SVG should have accessible role');
  assert.ok(svg.includes('<title>QR code for Meera Patel\'s Work Passport</title>'), 'SVG includes title element');
  assert.ok(svg.includes('viewBox='), 'SVG has responsive viewBox');
  assert.ok(svg.includes('fill="#23201e"'), 'SVG uses specified dark color');
});
