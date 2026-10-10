/**
 * WorkCred Application Configuration
 * Phase B: Default USE_MOCK is false (Real Backend on MongoDB Atlas).
 * Mock mode is only activated when explicitly requested via ?mock=1 in a development context.
 */

export const APP_VERSION = '1.0.0-phase-b';

const isDevEnv =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    new URLSearchParams(location.search).get('dev') === '1');

const hasMockQuery =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('mock') === '1';

const USE_MOCK = Boolean(isDevEnv && hasMockQuery);

export const config = Object.freeze({
  USE_MOCK,
  API_BASE: '/api/v1',
  APP_VERSION,
  IS_DEV: isDevEnv,
});

export const MOCK_STORAGE_KEY = 'workcred_mock_v1';
export const SESSION_KEY = 'session';
