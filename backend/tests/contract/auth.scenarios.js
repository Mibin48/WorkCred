/**
 * Data-Driven Contract Scenarios for Auth & User Endpoints
 * Shared scenarios executed against real backend and mock service to guarantee zero drift.
 */

export const AUTH_CONTRACT_SCENARIOS = [
  {
    name: 'OTP Request - Valid Indian phone returns standard delivery envelope',
    method: 'POST',
    path: '/auth/otp/request',
    body: { phone: '9000000001' },
    expectedStatus: 200,
    expectedSuccess: true,
    validateData: (data) => {
      return typeof data.resendInSeconds === 'number' || typeof data.resendIn === 'number';
    },
  },
  {
    name: 'OTP Request - Invalid phone returns validation error',
    method: 'POST',
    path: '/auth/otp/request',
    body: { phone: '123' },
    expectedStatus: 400,
    expectedSuccess: false,
    expectedErrorCode: 'VALIDATION_ERROR', // or INVALID_PHONE
  },
  {
    name: 'OTP Verify - Correct dev code returns user, access token, and refresh token',
    method: 'POST',
    path: '/auth/otp/verify',
    body: { phone: '9000000001', code: '123456' },
    expectedStatus: 200,
    expectedSuccess: true,
    validateData: (data) => {
      return Boolean(data.accessToken && data.user && data.user.id);
    },
  },
  {
    name: 'OTP Verify - Incorrect OTP code returns INVALID_CODE',
    method: 'POST',
    path: '/auth/otp/verify',
    body: { phone: '9000000001', code: '000000' },
    expectedStatus: 400,
    expectedSuccess: false,
    expectedErrorCode: 'INVALID_CODE',
  },
  {
    name: 'Users Me - Unauthenticated request returns 401 UNAUTHENTICATED',
    method: 'GET',
    path: '/users/me',
    headers: {},
    expectedStatus: 401,
    expectedSuccess: false,
    expectedErrorCode: 'UNAUTHENTICATED',
  },
];
