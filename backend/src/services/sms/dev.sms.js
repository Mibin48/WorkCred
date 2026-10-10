/**
 * WorkCred Dev SMS Provider Adapter
 * Logs sanitized OTP dispatch audit events without ever revealing the code.
 */

import { logger, maskPhone } from '../../utils/logger.js';

export async function sendDevSms(phone, _code) {
  const masked = maskPhone(phone);
  logger.info(`[SMS Dev] OTP requested for ${masked}`);
  return { success: true, provider: 'dev' };
}
