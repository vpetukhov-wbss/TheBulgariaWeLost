export function safeReturnTo(value: string | null, fallback = '/account'): string {
  if (!value || value.includes('\\') || value.startsWith('//')) return fallback;
  return /^\/(?:account|admin)(?=[/?#]|$)/.test(value) ? value : fallback;
}
