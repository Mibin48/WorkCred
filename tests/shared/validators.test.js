import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isIndianMobile,
  validateOtpRequest,
  validateJobCreate,
  validateStartBooking,
  validateFinishBooking,
} from '../../shared/validators.js';

describe('shared/validators', () => {
  it('validates 10-digit Indian mobile numbers', () => {
    assert.equal(isIndianMobile('9000000001'), true);
    assert.equal(isIndianMobile('+91 98765 43210'), true);
    assert.equal(isIndianMobile('12345'), false);
  });

  it('validates OTP request payloads', () => {
    assert.equal(validateOtpRequest({ phone: '9000000001' }).length, 0);
    assert.equal(validateOtpRequest({ phone: '123' }).length, 1);
  });

  it('validates job creation payloads', () => {
    const validJob = {
      title: 'Fix electrical wiring',
      skill: 'electrician',
      area: 'Shivajinagar',
      city: 'Pune',
      lat: 18.53,
      lng: 73.84,
      rate: 750,
      rateUnit: 'day',
    };
    assert.equal(validateJobCreate(validJob).length, 0);

    const invalidJob = { title: 'Hi', skill: 'wizard' };
    const errors = validateJobCreate(invalidJob);
    assert.ok(errors.length >= 3);
  });

  it('validates start and finish booking codes', () => {
    assert.equal(validateStartBooking({ startCode: '8429', lat: 18.5, lng: 73.8 }).length, 0);
    assert.equal(validateStartBooking({ startCode: 'abc' }).length, 2);

    assert.equal(validateFinishBooking({ finishCode: '6104', paidCash: true, rating: 5 }).length, 0);
    assert.equal(validateFinishBooking({ finishCode: '6104', paidCash: false, rating: 6 }).length, 2);
  });
});
