import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJSON,
  sha256Hex,
  computeEntryHash,
  verifyChain,
  GENESIS_HASH,
} from '../../shared/hash.js';

describe('shared/hash', () => {
  it('canonicalJSON sorts object keys deterministically', () => {
    const objA = { b: 2, a: 1, c: { z: 10, y: 5 } };
    const objB = { a: 1, c: { y: 5, z: 10 }, b: 2 };
    assert.equal(canonicalJSON(objA), canonicalJSON(objB));
    assert.equal(canonicalJSON(objA), '{"a":1,"b":2,"c":{"y":5,"z":10}}');
  });

  it('sha256Hex produces a 64-char hex string using Web Crypto', async () => {
    const hash = await sha256Hex('workcred');
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
    assert.equal(hash, await sha256Hex('workcred'));
  });

  it('verifyChain validates a clean multi-entry passport hash chain', async () => {
    const entry1Fields = { bookingId: 'b-1', workerId: 'w-1', customerId: 'c-1', skill: 'electrician', hoursWorked: 4, amountPaid: 400, startedAt: '2026-10-01T10:00:00Z', finishedAt: '2026-10-01T14:00:00Z', rating: 5 };
    const hash1 = await computeEntryHash(GENESIS_HASH, entry1Fields);
    const entry1 = { seq: 1, prevHash: GENESIS_HASH, hash: hash1, fields: entry1Fields };

    const entry2Fields = { bookingId: 'b-2', workerId: 'w-1', customerId: 'c-2', skill: 'electrician', hoursWorked: 8, amountPaid: 800, startedAt: '2026-10-02T09:00:00Z', finishedAt: '2026-10-02T17:00:00Z', rating: 5 };
    const hash2 = await computeEntryHash(hash1, entry2Fields);
    const entry2 = { seq: 2, prevHash: hash1, hash: hash2, fields: entry2Fields };

    const entry3Fields = { bookingId: 'b-3', workerId: 'w-1', customerId: 'c-3', skill: 'electrician', hoursWorked: 6, amountPaid: 600, startedAt: '2026-10-03T11:00:00Z', finishedAt: '2026-10-03T17:00:00Z', rating: 4 };
    const hash3 = await computeEntryHash(hash2, entry3Fields);
    const entry3 = { seq: 3, prevHash: hash2, hash: hash3, fields: entry3Fields };

    const chain = [entry1, entry2, entry3];
    const result = await verifyChain(chain);
    assert.equal(result.valid, true);
    assert.equal(result.checkedEntries, 3);
    assert.equal(result.brokenAtSeq, null);
  });

  it('verifyChain detects tampering at entry 1, middle entry 2, and last entry 3', async () => {
    const entry1Fields = { bookingId: 'b-1', workerId: 'w-1', customerId: 'c-1', skill: 'plumber', hoursWorked: 2, amountPaid: 300, startedAt: '2026-10-01T10:00:00Z', finishedAt: '2026-10-01T12:00:00Z', rating: 5 };
    const hash1 = await computeEntryHash(GENESIS_HASH, entry1Fields);
    const entry1 = { seq: 1, prevHash: GENESIS_HASH, hash: hash1, fields: entry1Fields };

    const entry2Fields = { bookingId: 'b-2', workerId: 'w-1', customerId: 'c-2', skill: 'plumber', hoursWorked: 5, amountPaid: 600, startedAt: '2026-10-02T10:00:00Z', finishedAt: '2026-10-02T15:00:00Z', rating: 5 };
    const hash2 = await computeEntryHash(hash1, entry2Fields);
    const entry2 = { seq: 2, prevHash: hash1, hash: hash2, fields: entry2Fields };

    const entry3Fields = { bookingId: 'b-3', workerId: 'w-1', customerId: 'c-3', skill: 'plumber', hoursWorked: 4, amountPaid: 500, startedAt: '2026-10-03T10:00:00Z', finishedAt: '2026-10-03T14:00:00Z', rating: 4 };
    const hash3 = await computeEntryHash(hash2, entry3Fields);
    const entry3 = { seq: 3, prevHash: hash2, hash: hash3, fields: entry3Fields };

    // Tamper entry 1
    const tampered1 = structuredClone([entry1, entry2, entry3]);
    tampered1[0].fields.amountPaid = 9999;
    const res1 = await verifyChain(tampered1);
    assert.equal(res1.valid, false);
    assert.equal(res1.brokenAtSeq, 1);

    // Tamper entry 2
    const tampered2 = structuredClone([entry1, entry2, entry3]);
    tampered2[1].fields.rating = 1;
    const res2 = await verifyChain(tampered2);
    assert.equal(res2.valid, false);
    assert.equal(res2.brokenAtSeq, 2);

    // Tamper entry 3
    const tampered3 = structuredClone([entry1, entry2, entry3]);
    tampered3[2].fields.hoursWorked = 99;
    const res3 = await verifyChain(tampered3);
    assert.equal(res3.valid, false);
    assert.equal(res3.brokenAtSeq, 3);
  });
});
