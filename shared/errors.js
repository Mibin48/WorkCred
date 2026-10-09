/**
 * WorkCred Isomorphic Error Specification
 * Pure ES Module running in Browser and Node 20.
 */

export class AppError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function createError(code, message, status = 400, details = null) {
  return new AppError(code, message, status, details);
}
