export const normalizeBaseUrl = (value, fallback) => (value || fallback).replace(/\/$/, '');

export const toWebSocketBaseUrl = (value) => {
  const normalized = normalizeBaseUrl(value, 'http://localhost:3000');
  if (normalized.startsWith('https://')) return normalized.replace('https://', 'wss://');
  if (normalized.startsWith('http://')) return normalized.replace('http://', 'ws://');
  return normalized;
};

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

const normalizeHexColor = (value, fallback) => {
  const normalized = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : fallback;
};

export const ZOCALO_FONT_OPTIONS = zocaloFontOptions;

export const defaultZocaloBgStyle = {
  bgAlignX: 'left',
  bgLeft: 0,
  bgBottom: 0,
  bgWidth: 1120,
};

export const defaultZocaloTextStyle = {
  textInsetLeft: 180,
  textInsetRight: 40,
  textInsetTop: 36,
  textInsetBottom: 36,
  textAlignX: 'left',
  textAlignY: 'top',
  fontSize: 42,
  fontFamily: zocaloFontOptions[0],
  fontWeight: 900,
  textColor: '#FFFFFF',
  textUppercase: true,
};

export const defaultZocaloStyle = {
  bg: defaultZocaloBgStyle,
  text: defaultZocaloTextStyle,
};

export const normalizeZocaloBgStyle = (value) => ({
  bgAlignX: normalizeChoice(value?.bgAlignX, ['left', 'center', 'right'], defaultZocaloBgStyle.bgAlignX),
  bgLeft: clampNumber(value?.bgLeft, -1920, 1920, defaultZocaloBgStyle.bgLeft),
  bgBottom: clampNumber(value?.bgBottom, 0, 1080, defaultZocaloBgStyle.bgBottom),
  bgWidth: clampNumber(value?.bgWidth, 200, 1920, defaultZocaloBgStyle.bgWidth),
});

export const normalizeZocaloTextStyle = (value) => ({
  textInsetLeft: clampNumber(value?.textInsetLeft, 0, 1800, defaultZocaloTextStyle.textInsetLeft),
  textInsetRight: clampNumber(value?.textInsetRight, 0, 1800, defaultZocaloTextStyle.textInsetRight),
  textInsetTop: clampNumber(value?.textInsetTop, 0, 1000, defaultZocaloTextStyle.textInsetTop),
  textInsetBottom: clampNumber(value?.textInsetBottom, 0, 1000, defaultZocaloTextStyle.textInsetBottom),
  textAlignX: normalizeChoice(value?.textAlignX, ['left', 'center', 'right'], defaultZocaloTextStyle.textAlignX),
  textAlignY: normalizeChoice(value?.textAlignY, ['top', 'center', 'bottom'], defaultZocaloTextStyle.textAlignY),
  fontSize: clampNumber(value?.fontSize, 12, 180, defaultZocaloTextStyle.fontSize),
  fontFamily: normalizeChoice(value?.fontFamily, zocaloFontOptions, defaultZocaloTextStyle.fontFamily),
  fontWeight: clampNumber(value?.fontWeight, 100, 900, defaultZocaloTextStyle.fontWeight),
  textColor: normalizeHexColor(value?.textColor, defaultZocaloTextStyle.textColor),
  textUppercase: typeof value?.textUppercase === 'boolean' ? value.textUppercase : defaultZocaloTextStyle.textUppercase,
});

export const normalizeZocaloStyle = (value) => ({
  bg: normalizeZocaloBgStyle(value?.bg ?? value),
  text: normalizeZocaloTextStyle(value?.text ?? value),
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

export const OVERLAY_WS_BASE = toWebSocketBaseUrl(OVERLAY_BASE);

export const KEEPALIVE_INTERVAL_MS = toPositiveNumber(
  import.meta.env.VITE_KEEPALIVE_INTERVAL_MS,
  120000
);

export const WAKE_MAX_RETRY_MS = toPositiveNumber(
  import.meta.env.VITE_WAKE_MAX_RETRY_MS,
  8000
);
