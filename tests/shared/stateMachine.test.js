import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transition } from '../../shared/stateMachine.js';
import { BOOKING_STATUS, ROLES } from '../../shared/constants.js';

describe('shared/stateMachine', () => {
  it('allows worker to confirm a pending booking', () => {
    const next = transition(BOOKING_STATUS.PENDING, 'confirm', ROLES.WORKER);
    assert.equal(next, BOOKING_STATUS.CONFIRMED);
  });

  it('rejects customer confirming a pending booking', () => {
    assert.throws(() => transition(BOOKING_STATUS.PENDING, 'confirm', ROLES.CUSTOMER), {
      code: 'INVALID_TRANSITION',
    });
  });

  it('allows worker to start a confirmed booking', () => {
    const next = transition(BOOKING_STATUS.CONFIRMED, 'start', ROLES.WORKER);
    assert.equal(next, BOOKING_STATUS.IN_PROGRESS);
  });

  it('allows customer to finish an in_progress booking', () => {
    const next = transition(BOOKING_STATUS.IN_PROGRESS, 'finish', ROLES.CUSTOMER);
    assert.equal(next, BOOKING_STATUS.COMPLETED);
  });

  it('allows customer or worker to cancel pending or confirmed booking', () => {
    assert.equal(transition(BOOKING_STATUS.PENDING, 'cancel', ROLES.CUSTOMER), BOOKING_STATUS.CANCELLED);
    assert.equal(transition(BOOKING_STATUS.CONFIRMED, 'cancel', ROLES.WORKER), BOOKING_STATUS.CANCELLED);
  });

  it('rejects cancelling a completed booking', () => {
    assert.throws(() => transition(BOOKING_STATUS.COMPLETED, 'cancel', ROLES.CUSTOMER), {
      code: 'INVALID_TRANSITION',
    });
  });

  it('allows customer to mark no_show on confirmed booking', () => {
    assert.equal(transition(BOOKING_STATUS.CONFIRMED, 'no_show', ROLES.CUSTOMER), BOOKING_STATUS.NO_SHOW);
  });
});
