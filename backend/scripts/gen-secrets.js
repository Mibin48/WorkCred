#!/usr/bin/env node
import crypto from 'node:crypto';

console.log('--- Generated WorkCred Cryptographic Secrets ---');
console.log(`JWT_ACCESS_SECRET=${crypto.randomBytes(32).toString('hex')}`);
console.log(`JWT_REFRESH_SECRET=${crypto.randomBytes(32).toString('hex')}`);
console.log(`CODES_ENC_KEY=${crypto.randomBytes(32).toString('base64')}`);
console.log('------------------------------------------------');
