import cors from 'cors';
import express from 'express';
import fs from 'fs';
import http from 'http';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const uploadsDir = path.join(dataDir, 'uploads');
const overlayDir = path.resolve(__dirname, '../overlay');
const imageMetadataPath = path.join(dataDir, 'image-metadata.json');
const textPresetsPath = path.join(dataDir, 'text-presets.json');
const zocaloStylePath = path.join(dataDir, 'zocalo-style.json');
const OBS_IMAGE_WIDTH = 1920;
const OBS_IMAGE_HEIGHT = 1080;
const IMAGE_MIN_SCALE = 1;
const IMAGE_MAX_SCALE = 4;
const IMAGE_MAX_OFFSET_X = OBS_IMAGE_WIDTH;
const IMAGE_MAX_OFFSET_Y = OBS_IMAGE_HEIGHT;
const textLayers = ['zocalo', 'title', 'quote'];

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use('/overlay', express.static(overlayDir));

const readImageMetadata = () => {
  if (!fs.existsSync(imageMetadataPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(imageMetadataPath, 'utf8'));
  } catch {
    return {};
  }
};

const writeImageMetadata = (metadata) => {
  fs.writeFileSync(imageMetadataPath, JSON.stringify(metadata, null, 2));
};

const imageMetadata = readImageMetadata();

const buildImageUrl = (filename, version) => {
  const suffix = version ? `?v=${version}` : '';
  return `${PUBLIC_BASE_URL}/uploads/${filename}${suffix}`;
};

const ensureUploadsDir = () => {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
};

const createNormalizedFilename = (originalName) => {
  const safeBaseName = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

  return `${safeBaseName || 'image'}-${uniqueSuffix}-obs.png`;
};

const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) {
    return [];
  }

  return Array.from(
    new Set(
      tags
        .map((tag) => String(tag).trim())
        .filter(Boolean)
    )
  ).slice(0, 12);
};

const clampNumber = (value, min, max, fallback) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsedValue));
};

const createDefaultImageTransform = () => ({
  scale: 1,
  x: 0,
  y: 0
});

const normalizeImageTransform = (value) => ({
  scale: clampNumber(value?.scale, IMAGE_MIN_SCALE, IMAGE_MAX_SCALE, 1),
  x: clampNumber(value?.x, -IMAGE_MAX_OFFSET_X, IMAGE_MAX_OFFSET_X, 0),
  y: clampNumber(value?.y, -IMAGE_MAX_OFFSET_Y, IMAGE_MAX_OFFSET_Y, 0)
});

const sanitizeZocalo = (value) => ({
  nombre: String(value?.nombre || ''),
  partido: String(value?.partido || ''),
  rol: String(value?.rol || '')
});

const sanitizeTitle = (value) => ({
  kicker: String(value?.kicker || ''),
  text: String(value?.text || '')
});

const sanitizeQuote = (value) => ({
  speaker: String(value?.speaker || ''),
  text: String(value?.text || '')
});

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

const createDefaultZocaloStyle = () => ({
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
  fontWeight: 900
});

const normalizeZocaloStyle = (value, fallback = createDefaultZocaloStyle()) => ({
  bgLeft: clampNumber(value?.bgLeft, 0, OBS_IMAGE_WIDTH, fallback.bgLeft),
  bgBottom: clampNumber(value?.bgBottom, 0, OBS_IMAGE_HEIGHT, fallback.bgBottom),
  bgWidth: clampNumber(value?.bgWidth, 200, OBS_IMAGE_WIDTH, fallback.bgWidth),
  textInsetLeft: clampNumber(value?.textInsetLeft, 0, 1800, fallback.textInsetLeft),
  textInsetRight: clampNumber(value?.textInsetRight, 0, 1800, fallback.textInsetRight),
  textInsetTop: clampNumber(value?.textInsetTop, 0, 1000, fallback.textInsetTop),
  textInsetBottom: clampNumber(value?.textInsetBottom, 0, 1000, fallback.textInsetBottom),
  textAlignX: normalizeChoice(value?.textAlignX, ['left', 'center', 'right'], fallback.textAlignX),
  textAlignY: normalizeChoice(value?.textAlignY, ['top', 'center', 'bottom'], fallback.textAlignY),
  fontSize: clampNumber(value?.fontSize, 12, 180, fallback.fontSize),
  fontFamily: normalizeChoice(value?.fontFamily, zocaloFontOptions, fallback.fontFamily),
  fontWeight: clampNumber(value?.fontWeight, 100, 900, fallback.fontWeight)
});

const readZocaloStyle = () => {
  if (!fs.existsSync(zocaloStylePath)) {
    return createDefaultZocaloStyle();
  }

  try {
    return normalizeZocaloStyle(JSON.parse(fs.readFileSync(zocaloStylePath, 'utf8')));
  } catch {
    return createDefaultZocaloStyle();
  }
};

const writeZocaloStyle = (style) => {
  fs.writeFileSync(zocaloStylePath, JSON.stringify(style, null, 2));
};

const createDefaultPresetElements = () => ({
  zocalo: {
    enabled: true,
    x: 64,
    y: 860,
    content: sanitizeZocalo({
      nombre: 'DON MANOLO',
      partido: 'PARTIDO POR LA PAZ',
      rol: 'CANDIDATO PRESIDENCIAL'
    })
  },
  title: {
    enabled: false,
    x: 64,
    y: 96,
    content: sanitizeTitle({
      kicker: 'TITULO',
      text: ''
    })
  },
  quote: {
    enabled: false,
    x: 1296,
    y: 760,
    content: sanitizeQuote({
      speaker: '',
      text: ''
    })
  }
});

const clonePresetElements = (elements = createDefaultPresetElements()) => ({
  zocalo: {
    ...elements.zocalo,
    content: sanitizeZocalo(elements.zocalo?.content)
  },
  title: {
    ...elements.title,
    content: sanitizeTitle(elements.title?.content)
  },
  quote: {
    ...elements.quote,
    content: sanitizeQuote(elements.quote?.content)
  }
});

const normalizePresetElements = (elements, fallbackElements = createDefaultPresetElements()) => ({
  zocalo: {
    enabled: typeof elements?.zocalo?.enabled === 'boolean' ? elements.zocalo.enabled : Boolean(fallbackElements.zocalo.enabled),
    x: clampNumber(elements?.zocalo?.x, 0, OBS_IMAGE_WIDTH, fallbackElements.zocalo.x),
    y: clampNumber(elements?.zocalo?.y, 0, OBS_IMAGE_HEIGHT, fallbackElements.zocalo.y),
    content: sanitizeZocalo(elements?.zocalo?.content ?? fallbackElements.zocalo.content)
  },
  title: {
    enabled: typeof elements?.title?.enabled === 'boolean' ? elements.title.enabled : Boolean(fallbackElements.title.enabled),
    x: clampNumber(elements?.title?.x, 0, OBS_IMAGE_WIDTH, fallbackElements.title.x),
    y: clampNumber(elements?.title?.y, 0, OBS_IMAGE_HEIGHT, fallbackElements.title.y),
    content: sanitizeTitle(elements?.title?.content ?? fallbackElements.title.content)
  },
  quote: {
    enabled: typeof elements?.quote?.enabled === 'boolean' ? elements.quote.enabled : Boolean(fallbackElements.quote.enabled),
    x: clampNumber(elements?.quote?.x, 0, OBS_IMAGE_WIDTH, fallbackElements.quote.x),
    y: clampNumber(elements?.quote?.y, 0, OBS_IMAGE_HEIGHT, fallbackElements.quote.y),
    content: sanitizeQuote(elements?.quote?.content ?? fallbackElements.quote.content)
  }
});

const createPresetId = () => `preset-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

const normalizePresetRecord = (preset) => {
  const now = Date.now();
  const fallbackElements = createDefaultPresetElements();

  return {
    id: String(preset?.id || createPresetId()),
    name: String(preset?.name || 'Nuevo preset').trim() || 'Nuevo preset',
    backgroundImageId: preset?.backgroundImageId ? String(preset.backgroundImageId) : null,
    elements: normalizePresetElements(preset?.elements, fallbackElements),
    createdAt: clampNumber(preset?.createdAt, 0, Number.MAX_SAFE_INTEGER, now),
    updatedAt: clampNumber(preset?.updatedAt, 0, Number.MAX_SAFE_INTEGER, now)
  };
};

const readTextPresets = () => {
  if (!fs.existsSync(textPresetsPath)) {
    return [];
  }

  try {
    const payload = JSON.parse(fs.readFileSync(textPresetsPath, 'utf8'));
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload.map(normalizePresetRecord);
  } catch {
    return [];
  }
};

const writeTextPresets = (presets) => {
  fs.writeFileSync(textPresetsPath, JSON.stringify(presets, null, 2));
};

const getImageMeta = (filename) => ({
  favorite: Boolean(imageMetadata[filename]?.favorite),
  tags: normalizeTags(imageMetadata[filename]?.tags || [])
});

const toImageAsset = (filename) => {
  const filePath = path.join(uploadsDir, filename);
  const stats = fs.statSync(filePath);
  const meta = getImageMeta(filename);

  return {
    id: filename,
    filename,
    label: filename,
    uploadedAt: stats.mtimeMs,
    width: OBS_IMAGE_WIDTH,
    height: OBS_IMAGE_HEIGHT,
    format: 'png',
    favorite: meta.favorite,
    tags: meta.tags,
    url: buildImageUrl(filename, stats.mtimeMs)
  };
};

const normalizeImageBuffer = async (inputBuffer, outputPath) => {
  await sharp(inputBuffer)
    .resize(OBS_IMAGE_WIDTH, OBS_IMAGE_HEIGHT, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(outputPath);
};

const normalizeLegacyImage = async (filename) => {
  if (filename.endsWith('-obs.png')) {
    return { from: filename, to: filename };
  }

  const sourcePath = path.join(uploadsDir, filename);
  const normalizedFilename = `${path.basename(filename, path.extname(filename))}-obs.png`;
  const normalizedPath = path.join(uploadsDir, normalizedFilename);
  const inputBuffer = await fs.promises.readFile(sourcePath);

  await normalizeImageBuffer(inputBuffer, normalizedPath);
  await fs.promises.unlink(sourcePath);

  return { from: filename, to: normalizedFilename };
};

const normalizeExistingUploads = async () => {
  ensureUploadsDir();
  const filenames = fs
    .readdirSync(uploadsDir)
    .filter((filename) => fs.statSync(path.join(uploadsDir, filename)).isFile());

  for (const filename of filenames) {
    const renameResult = await normalizeLegacyImage(filename);

    if (renameResult.from !== renameResult.to && imageMetadata[renameResult.from]) {
      imageMetadata[renameResult.to] = imageMetadata[renameResult.from];
      delete imageMetadata[renameResult.from];
    }
  }

  writeImageMetadata(imageMetadata);
};

const sortImages = (images) => {
  return [...images].sort((left, right) => {
    if (left.favorite !== right.favorite) {
      return Number(right.favorite) - Number(left.favorite);
    }

    return right.uploadedAt - left.uploadedAt;
  });
};

const loadExistingImages = () => {
  ensureUploadsDir();

  return sortImages(fs
    .readdirSync(uploadsDir)
    .filter((filename) => fs.statSync(path.join(uploadsDir, filename)).isFile())
    .map(toImageAsset)
  );
};

await normalizeExistingUploads();

const savedPresets = readTextPresets();

const state = {
  zocalo: {
    nombre: 'DON MANOLO',
    partido: 'PARTIDO POR LA PAZ',
    rol: 'CANDIDATO PRESIDENCIAL'
  },
  title: {
    kicker: 'TITULO',
    text: ''
  },
  quote: {
    speaker: '',
    text: ''
  },
  visibility: {
    text: true,
    image: false,
    zocalo: true,
    title: false,
    quote: false
  },
  images: loadExistingImages(),
  selectedImageId: null,
  imageTransforms: {},
  zocaloStyle: readZocaloStyle(),
  presets: savedPresets,
  activeTextPreset: null,
  updatedAt: Date.now()
};

if (state.images.length > 0) {
  state.selectedImageId = state.images[0].id;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }

    cb(new Error('Only image uploads are allowed'));
  }
});

const serializeState = () => {
  const selectedImage = state.images.find((image) => image.id === state.selectedImageId) || null;
  const selectedImageTransform = selectedImage
    ? normalizeImageTransform(state.imageTransforms[selectedImage.id] || createDefaultImageTransform())
    : createDefaultImageTransform();

  return {
    zocalo: state.zocalo,
    zocaloStyle: state.zocaloStyle,
    title: state.title,
    quote: state.quote,
    visibility: state.visibility,
    images: state.images,
    selectedImage,
    selectedImageTransform,
    presets: state.presets,
    activeTextPreset: state.activeTextPreset,
    updatedAt: state.updatedAt
  };
};

const clients = new Set();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const broadcast = (event) => {
  const payload = JSON.stringify(event);

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
};

const syncState = () => {
  broadcast({
    type: 'STATE_SYNC',
    payload: serializeState()
  });
};

wss.on('connection', (socket) => {
  clients.add(socket);
  socket.send(JSON.stringify({ type: 'STATE_SYNC', payload: serializeState() }));

  socket.on('close', () => {
    clients.delete(socket);
  });
});

const touchState = () => {
  state.updatedAt = Date.now();
};

const getSelectedImageTransform = () => {
  if (!state.selectedImageId) {
    return createDefaultImageTransform();
  }

  if (!state.imageTransforms[state.selectedImageId]) {
    state.imageTransforms[state.selectedImageId] = createDefaultImageTransform();
  }

  return normalizeImageTransform(state.imageTransforms[state.selectedImageId]);
};

const setSelectedImageTransform = (transform) => {
  if (!state.selectedImageId) {
    return createDefaultImageTransform();
  }

  const normalizedTransform = normalizeImageTransform(transform);
  state.imageTransforms[state.selectedImageId] = normalizedTransform;
  return normalizedTransform;
};

const applyPresetToState = (presetRuntime) => {
  state.activeTextPreset = {
    presetId: presetRuntime.presetId || presetRuntime.id || null,
    name: String(presetRuntime.name || 'Preset activo'),
    backgroundImageId: presetRuntime.backgroundImageId || null,
    elements: clonePresetElements(presetRuntime.elements)
  };
  state.zocalo = sanitizeZocalo(state.activeTextPreset.elements.zocalo.content);
  state.title = sanitizeTitle(state.activeTextPreset.elements.title.content);
  state.quote = sanitizeQuote(state.activeTextPreset.elements.quote.content);
  state.visibility.zocalo = Boolean(state.activeTextPreset.elements.zocalo.enabled);
  state.visibility.title = Boolean(state.activeTextPreset.elements.title.enabled);
  state.visibility.quote = Boolean(state.activeTextPreset.elements.quote.enabled);
};

const syncActivePresetContent = (layer, content) => {
  if (!state.activeTextPreset?.elements?.[layer]) {
    return;
  }

  state.activeTextPreset.elements[layer].content = content;
};

const syncActivePresetVisibility = (layer, visible) => {
  if (!state.activeTextPreset?.elements?.[layer]) {
    return;
  }

  state.activeTextPreset.elements[layer].enabled = Boolean(visible);
};

const createRuntimePresetFromRecord = (presetRecord, overrides = {}) => {
  const fallbackElements = clonePresetElements(presetRecord.elements);
  const overrideElements = {
    zocalo: {
      enabled: overrides.elements?.zocalo?.enabled,
      x: overrides.elements?.zocalo?.x,
      y: overrides.elements?.zocalo?.y,
      content: overrides.zocalo || overrides.elements?.zocalo?.content
    },
    title: {
      enabled: overrides.elements?.title?.enabled,
      x: overrides.elements?.title?.x,
      y: overrides.elements?.title?.y,
      content: overrides.title || overrides.elements?.title?.content
    },
    quote: {
      enabled: overrides.elements?.quote?.enabled,
      x: overrides.elements?.quote?.x,
      y: overrides.elements?.quote?.y,
      content: overrides.quote || overrides.elements?.quote?.content
    }
  };

  return {
    presetId: presetRecord.id,
    name: presetRecord.name,
    backgroundImageId: typeof overrides.backgroundImageId === 'string'
      ? overrides.backgroundImageId
      : presetRecord.backgroundImageId,
    elements: normalizePresetElements(overrideElements, fallbackElements)
  };
};

const refreshImages = () => {
  state.images = sortImages(state.images.map((image) => toImageAsset(image.filename)));

  if (state.selectedImageId && !state.images.some((image) => image.id === state.selectedImageId)) {
    state.selectedImageId = state.images[0]?.id ?? null;
  }

  const availableImageIds = new Set(state.images.map((image) => image.id));

  for (const imageId of Object.keys(state.imageTransforms)) {
    if (!availableImageIds.has(imageId)) {
      delete state.imageTransforms[imageId];
    }
  }

  state.presets = state.presets.map((preset) => ({
    ...preset,
    backgroundImageId: preset.backgroundImageId && availableImageIds.has(preset.backgroundImageId)
      ? preset.backgroundImageId
      : null
  }));

  if (state.activeTextPreset?.backgroundImageId && !availableImageIds.has(state.activeTextPreset.backgroundImageId)) {
    state.activeTextPreset.backgroundImageId = null;
  }
};

const setScene = (scene) => {
  if (scene === 'lower_third') {
    state.visibility.text = true;
    state.visibility.image = false;
    state.visibility.zocalo = true;
  }

  if (scene === 'image_full') {
    state.visibility.text = false;
    state.visibility.image = true;
  }

  if (scene === 'hidden') {
    state.visibility.text = false;
    state.visibility.image = false;
  }
};

const setTextLayerVisibility = (layer, visible) => {
  if (!textLayers.includes(layer)) {
    return false;
  }

  state.visibility[layer] = Boolean(visible);
  syncActivePresetVisibility(layer, state.visibility[layer]);
  return true;
};

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/state', (req, res) => {
  res.json(serializeState());
});

app.get('/images', (req, res) => {
  res.json({
    images: state.images,
    selectedImageId: state.selectedImageId,
    selectedImageTransform: getSelectedImageTransform()
  });
});

app.get('/presets', (req, res) => {
  res.json({
    presets: state.presets,
    activeTextPreset: state.activeTextPreset
  });
});

app.patch('/image/:imageId/meta', (req, res) => {
  const { imageId } = req.params;
  const image = state.images.find((item) => item.id === imageId);

  if (!image) {
    res.status(404).json({ error: 'Image not found' });
    return;
  }

  const currentMeta = getImageMeta(imageId);
  imageMetadata[imageId] = {
    favorite: typeof req.body?.favorite === 'boolean' ? req.body.favorite : currentMeta.favorite,
    tags: req.body?.tags ? normalizeTags(req.body.tags) : currentMeta.tags
  };
  writeImageMetadata(imageMetadata);

  refreshImages();
  touchState();
  broadcast({ type: 'IMAGE_LIBRARY', payload: { images: state.images } });
  syncState();

  res.json({
    success: true,
    image: state.images.find((item) => item.id === imageId),
    state: serializeState()
  });
});

app.post('/zocalo', (req, res) => {
  const { nombre = '', partido = '', rol = '' } = req.body ?? {};

  state.zocalo = {
    nombre: String(nombre),
    partido: String(partido),
    rol: String(rol)
  };
  syncActivePresetContent('zocalo', state.zocalo);
  touchState();

  broadcast({ type: 'ZOCALO', payload: state.zocalo });
  syncState();

  res.json({ success: true, state: serializeState() });
});

app.post('/zocalo-style', (req, res) => {
  state.zocaloStyle = normalizeZocaloStyle({
    ...state.zocaloStyle,
    ...(req.body ?? {})
  });
  writeZocaloStyle(state.zocaloStyle);
  touchState();

  broadcast({ type: 'ZOCALO_STYLE', payload: state.zocaloStyle });
  syncState();

  res.json({ success: true, zocaloStyle: state.zocaloStyle, state: serializeState() });
});

app.post('/title', (req, res) => {
  const { kicker = '', text = '' } = req.body ?? {};

  state.title = {
    kicker: String(kicker),
    text: String(text)
  };
  syncActivePresetContent('title', state.title);
  touchState();

  broadcast({ type: 'TITLE', payload: state.title });
  syncState();

  res.json({ success: true, state: serializeState() });
});

app.post('/quote', (req, res) => {
  const { speaker = '', text = '' } = req.body ?? {};

  state.quote = {
    speaker: String(speaker),
    text: String(text)
  };
  syncActivePresetContent('quote', state.quote);
  touchState();

  broadcast({ type: 'QUOTE', payload: state.quote });
  syncState();

  res.json({ success: true, state: serializeState() });
});

app.post('/text/visibility', (req, res) => {
  const { visible } = req.body ?? {};
  state.visibility.text = Boolean(visible);
  touchState();

  broadcast({ type: 'TEXT_VISIBILITY', payload: { visible: state.visibility.text } });
  syncState();

  res.json({ success: true, state: serializeState() });
});

app.post('/text-layer-visibility', (req, res) => {
  const { layer, visible } = req.body ?? {};

  if (!setTextLayerVisibility(layer, visible)) {
    res.status(400).json({ error: 'Invalid text layer' });
    return;
  }

  touchState();
  broadcast({
    type: 'TEXT_LAYER_VISIBILITY',
    payload: { layer, visible: state.visibility[layer] }
  });
  syncState();

  res.json({ success: true, state: serializeState() });
});

app.post('/image/visibility', (req, res) => {
  const { visible } = req.body ?? {};
  state.visibility.image = Boolean(visible);
  touchState();

  broadcast({ type: 'IMAGE_VISIBILITY', payload: { visible: state.visibility.image } });
  syncState();

  res.json({ success: true, state: serializeState() });
});

app.post('/image/select', (req, res) => {
  const { imageId } = req.body ?? {};
  const image = state.images.find((item) => item.id === imageId);

  if (!image) {
    res.status(404).json({ error: 'Image not found' });
    return;
  }

  state.selectedImageId = image.id;
  const selectedImageTransform = getSelectedImageTransform();
  touchState();

  broadcast({ type: 'SHOW_IMAGE', payload: image });
  broadcast({ type: 'IMAGE_TRANSFORM', payload: { imageId: image.id, transform: selectedImageTransform } });
  syncState();

  res.json({ success: true, image, selectedImageTransform, state: serializeState() });
});

app.post('/image/zoom', (req, res) => {
  if (!state.selectedImageId) {
    res.status(400).json({ error: 'No image selected' });
    return;
  }

  const transform = setSelectedImageTransform(req.body ?? {});
  touchState();

  broadcast({
    type: 'IMAGE_TRANSFORM',
    payload: { imageId: state.selectedImageId, transform }
  });
  syncState();

  res.json({ success: true, transform, state: serializeState() });
});

app.delete('/image/:imageId', async (req, res) => {
  const { imageId } = req.params;
  const imageIndex = state.images.findIndex((item) => item.id === imageId);

  if (imageIndex === -1) {
    res.status(404).json({ error: 'Image not found' });
    return;
  }

  const [removedImage] = state.images.splice(imageIndex, 1);

  try {
    await fs.promises.unlink(path.join(uploadsDir, removedImage.filename));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (state.selectedImageId === removedImage.id) {
    state.selectedImageId = state.images[0]?.id ?? null;

    if (!state.selectedImageId) {
      state.visibility.image = false;
    }
  }

  delete state.imageTransforms[removedImage.id];
  refreshImages();

  delete imageMetadata[removedImage.id];
  writeImageMetadata(imageMetadata);
  writeTextPresets(state.presets);

  touchState();

  broadcast({ type: 'IMAGE_LIBRARY', payload: { images: state.images } });
  syncState();

  res.json({
    success: true,
    removedImageId: removedImage.id,
    state: serializeState()
  });
});

app.post('/zocalo-bg', upload.single('image'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const destPath = path.join(overlayDir, 'zocalo-bg.png');

  try {
    await sharp(req.file.buffer).png().toFile(destPath);
  } catch (error) {
    res.status(500).json({ error: 'Error al procesar la imagen' });
    return;
  }

  res.status(200).json({ success: true });
});

app.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const normalizedFilename = createNormalizedFilename(req.file.originalname);
  const normalizedPath = path.join(uploadsDir, normalizedFilename);

  await normalizeImageBuffer(req.file.buffer, normalizedPath);

  const image = toImageAsset(normalizedFilename);
  imageMetadata[normalizedFilename] = { favorite: false, tags: [] };
  writeImageMetadata(imageMetadata);

  state.images.unshift(image);
  state.images = sortImages(state.images);
  state.selectedImageId = image.id;
  state.imageTransforms[image.id] = createDefaultImageTransform();
  touchState();

  broadcast({ type: 'IMAGE_LIBRARY', payload: { images: state.images } });
  broadcast({ type: 'SHOW_IMAGE', payload: image });
  broadcast({ type: 'IMAGE_TRANSFORM', payload: { imageId: image.id, transform: state.imageTransforms[image.id] } });
  syncState();

  res.status(201).json({ success: true, image, state: serializeState() });
});

app.post('/presets', (req, res) => {
  const now = Date.now();
  const preset = normalizePresetRecord({
    id: createPresetId(),
    name: req.body?.name,
    backgroundImageId: req.body?.backgroundImageId,
    elements: req.body?.elements,
    createdAt: now,
    updatedAt: now
  });

  state.presets.unshift(preset);
  writeTextPresets(state.presets);
  touchState();
  syncState();

  res.status(201).json({ success: true, preset, state: serializeState() });
});

app.patch('/presets/:presetId', (req, res) => {
  const { presetId } = req.params;
  const presetIndex = state.presets.findIndex((item) => item.id === presetId);

  if (presetIndex === -1) {
    res.status(404).json({ error: 'Preset not found' });
    return;
  }

  const currentPreset = state.presets[presetIndex];
  const updatedPreset = normalizePresetRecord({
    ...currentPreset,
    name: typeof req.body?.name === 'string' ? req.body.name : currentPreset.name,
    backgroundImageId: req.body?.backgroundImageId !== undefined ? req.body.backgroundImageId : currentPreset.backgroundImageId,
    elements: req.body?.elements || currentPreset.elements,
    createdAt: currentPreset.createdAt,
    updatedAt: Date.now()
  });

  state.presets[presetIndex] = updatedPreset;
  writeTextPresets(state.presets);
  touchState();
  syncState();

  res.json({ success: true, preset: updatedPreset, state: serializeState() });
});

app.delete('/presets/:presetId', (req, res) => {
  const { presetId } = req.params;
  const presetIndex = state.presets.findIndex((item) => item.id === presetId);

  if (presetIndex === -1) {
    res.status(404).json({ error: 'Preset not found' });
    return;
  }

  const [removedPreset] = state.presets.splice(presetIndex, 1);
  writeTextPresets(state.presets);
  touchState();
  syncState();

  res.json({ success: true, removedPresetId: removedPreset.id, state: serializeState() });
});

app.post('/presets/:presetId/activate', (req, res) => {
  const { presetId } = req.params;
  const preset = state.presets.find((item) => item.id === presetId);

  if (!preset) {
    res.status(404).json({ error: 'Preset not found' });
    return;
  }

  const runtimePreset = createRuntimePresetFromRecord(preset, req.body ?? {});
  applyPresetToState(runtimePreset);
  touchState();

  broadcast({
    type: 'PRESET_ACTIVATE',
    payload: {
      activeTextPreset: state.activeTextPreset,
      zocalo: state.zocalo,
      title: state.title,
      quote: state.quote,
      visibility: state.visibility
    }
  });
  syncState();

  res.json({ success: true, activeTextPreset: state.activeTextPreset, state: serializeState() });
});

app.post('/presets/clear-active', (req, res) => {
  state.activeTextPreset = null;
  touchState();
  broadcast({ type: 'PRESET_CLEAR', payload: { activeTextPreset: null } });
  syncState();

  res.json({ success: true, state: serializeState() });
});

app.post('/scene', (req, res) => {
  const { scene } = req.body ?? {};

  if (!['lower_third', 'image_full', 'hidden'].includes(scene)) {
    res.status(400).json({ error: 'Invalid scene' });
    return;
  }

  setScene(scene);
  touchState();

  broadcast({ type: 'SCENE', payload: { scene } });
  syncState();

  res.json({ success: true, state: serializeState() });
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError || error.message) {
    res.status(400).json({ error: error.message });
    return;
  }

  next(error);
});

server.listen(PORT, () => {
  console.log(`HTTP Server running at ${PUBLIC_BASE_URL}`);
  console.log(`WebSocket Server running at ${PUBLIC_BASE_URL.replace(/^http/, 'ws')}`);
});
