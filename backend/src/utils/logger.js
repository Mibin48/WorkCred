/**
 * WorkCred Structured Logger (Pino)
 * JSON formatting with strict redaction of credentials, auth tokens, OTPs,
 * handshake codes, and PII (phone numbers masked).
 */

import pino from 'pino';
import pinoHttp from 'pino-http';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

/**
 * Custom serializer / masker for phone numbers.
 * Masks '9000000001' or '+919000000001' to '+91*****0001'
 */
export function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  const last4 = digits.slice(-4);
  return `+91*****${last4}`;
}

export const logger = pino({
  level: logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["idempotency-key"]',
      'res.headers["set-cookie"]',
      'password',
      'code',
      'otp',
      'startCode',
      'finishCode',
      'startCodeEnc',
      'finishCodeEnc',
      'accessToken',
      'refreshToken',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'CODES_ENC_KEY',
      'MONGODB_URI',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        query: req.query,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const httpLogger = pinoHttp({
  logger,
  genReqId(req) {
    return req.headers['x-request-id'] || req.id || `req-${Math.random().toString(36).slice(2, 10)}`;
  },
  autoLogging: {
    ignore: (req) => req.url === '/api/v1/health' || req.url === '/api/v1/health/ready',
  },
  customLogLevel(req, res, err) {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
