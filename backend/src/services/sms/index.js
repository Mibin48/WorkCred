/**
 * WorkCred SMS Service Adapter Dispatcher
 */

import { sendDevSms } from './dev.sms.js';
import { sendMsg91Sms } from './msg91.sms.js';

export async function sendOtpSms(phone, code) {
  const provider = process.env.SMS_PROVIDER || 'dev';

  if (provider === 'msg91') {
    return sendMsg91Sms(phone, code);
  }

  return sendDevSms(phone, code);
}
