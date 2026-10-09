export const formatRupees = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount) || 0);
export function formatToday(date = new Date()) {
  return `Today ${new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(date)}`;
}
export const formatDistance = (km) => `${Number(km).toFixed(1)} km away`;
