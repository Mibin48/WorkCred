/**
 * WorkCred MSG91 SMS Provider Adapter
 * Sends transactional OTP via MSG91 Send OTP HTTP API using native fetch.
 */

import { AppError } from '../../../../shared/errors.js';
import { logger, maskPhone } from '../../utils/logger.js';

export async function sendMsg91Sms(phone, code) {
  const authKey = process.env.SMS_API_KEY || process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID || 'workcred_otp_template';
  const digits = String(phone).replace(/\D/g, '').slice(-10);
  const mobile = `91${digits}`;

  if (!authKey || authKey === 'placeholder') {
    logger.error('MSG91 authKey is not configured in environment variables.');
    throw new AppError('SMS_UNAVAILABLE', 'SMS delivery service is temporarily unavailable.', 503);
  }

  const url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${mobile}&authkey=${authKey}&otp=${code}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok || (body.type && body.type === 'error')) {
      logger.error({
        msg: 'MSG91 OTP dispatch failed',
        phone: maskPhone(phone),
        statusCode: response.status,
        providerMessage: body.message,
      });
      throw new AppError('SMS_UNAVAILABLE', 'SMS delivery service is temporarily unavailable. Please try again shortly.', 503);
    }

    logger.info({ msg: 'MSG91 OTP dispatched successfully', phone: maskPhone(phone) });
    return { success: true, provider: 'msg91' };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ msg: 'MSG91 network request error', error: err.message, phone: maskPhone(phone) });
    throw new AppError('SMS_UNAVAILABLE', 'SMS delivery service is temporarily unavailable. Please try again shortly.', 503);
  }
}
