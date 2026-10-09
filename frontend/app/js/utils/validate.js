export const isIndianMobile = (value) => /^[6-9]\d{9}$/.test(String(value).replace(/\D/g, ''));
export const isOtp = (value) => /^\d{6}$/.test(String(value));
export const isNonEmpty = (value) => String(value ?? '').trim().length > 0;
export const cleanPhone = (value) => String(value ?? '').replace(/\D/g, '').slice(-10);
