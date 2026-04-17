export const normalizeBaseUrl = (value, fallback) => (value || fallback).replace(/\/$/, '');

export const toPositiveNumber = (value, fallback) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

export const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const clampNumber = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const normalizeImageTransform = (value) => ({
  scale: clampNumber(value?.scale, 1, 4, 1),
  x: clampNumber(value?.x, -1920, 1920, 0),
  y: clampNumber(value?.y, -1080, 1080, 0),
});

export const initialImageTransform = { scale: 1, x: 0, y: 0 };

export const API_BASE = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  'http://localhost:3000'
);

export const OVERLAY_BASE = normalizeBaseUrl(
  import.meta.env.VITE_OVERLAY_BASE_URL,
  API_BASE
);

export const KEEPALIVE_INTERVAL_MS = toPositiveNumber(
  import.meta.env.VITE_KEEPALIVE_INTERVAL_MS,
  120000
);

export const WAKE_MAX_RETRY_MS = toPositiveNumber(
  import.meta.env.VITE_WAKE_MAX_RETRY_MS,
  8000
);
