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

const zocaloFontOptions = [
  '"Arial Narrow", "Trebuchet MS", sans-serif',
  'Arial, Helvetica, sans-serif',
  '"Trebuchet MS", sans-serif',
  'Georgia, "Times New Roman", serif',
  'Tahoma, Geneva, sans-serif',
  'Verdana, Geneva, sans-serif',
  'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif'
];

const normalizeChoice = (value, choices, fallback) => (
  choices.includes(value) ? value : fallback
);

export const ZOCALO_FONT_OPTIONS = zocaloFontOptions;

export const defaultZocaloStyle = {
  bgAlignX: 'left',
  bgLeft: 0,
  bgBottom: 0,
  bgWidth: 1120,
  textInsetLeft: 180,
  textInsetRight: 40,
  textInsetTop: 36,
  textInsetBottom: 36,
  textAlignX: 'left',
  textAlignY: 'top',
  fontSize: 42,
  fontFamily: zocaloFontOptions[0],
  fontWeight: 900,
};

export const normalizeZocaloStyle = (value) => ({
  bgAlignX: normalizeChoice(value?.bgAlignX, ['left', 'center', 'right'], defaultZocaloStyle.bgAlignX),
  bgLeft: clampNumber(value?.bgLeft, 0, 1920, defaultZocaloStyle.bgLeft),
  bgBottom: clampNumber(value?.bgBottom, 0, 1080, defaultZocaloStyle.bgBottom),
  bgWidth: clampNumber(value?.bgWidth, 200, 1920, defaultZocaloStyle.bgWidth),
  textInsetLeft: clampNumber(value?.textInsetLeft, 0, 1800, defaultZocaloStyle.textInsetLeft),
  textInsetRight: clampNumber(value?.textInsetRight, 0, 1800, defaultZocaloStyle.textInsetRight),
  textInsetTop: clampNumber(value?.textInsetTop, 0, 1000, defaultZocaloStyle.textInsetTop),
  textInsetBottom: clampNumber(value?.textInsetBottom, 0, 1000, defaultZocaloStyle.textInsetBottom),
  textAlignX: normalizeChoice(value?.textAlignX, ['left', 'center', 'right'], defaultZocaloStyle.textAlignX),
  textAlignY: normalizeChoice(value?.textAlignY, ['top', 'center', 'bottom'], defaultZocaloStyle.textAlignY),
  fontSize: clampNumber(value?.fontSize, 12, 180, defaultZocaloStyle.fontSize),
  fontFamily: normalizeChoice(value?.fontFamily, zocaloFontOptions, defaultZocaloStyle.fontFamily),
  fontWeight: clampNumber(value?.fontWeight, 100, 900, defaultZocaloStyle.fontWeight),
});

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
