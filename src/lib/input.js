export const clampInt = (value, min, fallback) => {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
};

export const onlyInt = (value) => String(value).replace(/[^\d]/g, '');

export const onlyFloat = (value) => {
  const sanitized = String(value).replace(/[^\d.]/g, '');
  const parts = sanitized.split('.');
  return parts.length <= 2 ? sanitized : `${parts[0]}.${parts.slice(1).join('')}`;
};
