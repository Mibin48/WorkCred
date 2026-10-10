/**
 * WorkCred Input Validation Middleware Adapter
 * Connects pure isomorphic validation functions from /shared/validators.js
 * to Express route handlers.
 */

import { AppError } from '../../../shared/errors.js';

/**
 * Creates middleware from a validator function.
 * @param {Function} validatorFn - Function receiving (req.body, req.query, req.params) and returning array of { field, message }
 * @param {'body' | 'query' | 'params'} source - Request property to validate (default: 'body')
 */
export function validate(validatorFn, source = 'body') {
  return (req, _res, next) => {
    const target = req[source] || {};
    const errors = validatorFn(target);

    if (errors && errors.length > 0) {
      const primaryMessage = errors[0].message || 'Validation failed on request.';
      return next(new AppError('VALIDATION_ERROR', primaryMessage, 400, errors));
    }

    next();
  };
}
