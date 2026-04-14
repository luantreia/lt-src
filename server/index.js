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
const OBS_IMAGE_WIDTH = 1920;
const OBS_IMAGE_HEIGHT = 1080;

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

  return {
    zocalo: state.zocalo,
    title: state.title,
    quote: state.quote,
    visibility: state.visibility,
    images: state.images,
    selectedImage,
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

const refreshImages = () => {
  state.images = sortImages(state.images.map((image) => toImageAsset(image.filename)));

  if (state.selectedImageId && !state.images.some((image) => image.id === state.selectedImageId)) {
    state.selectedImageId = state.images[0]?.id ?? null;
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
  if (!['zocalo', 'title', 'quote'].includes(layer)) {
    return false;
  }

  state.visibility[layer] = Boolean(visible);
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
    selectedImageId: state.selectedImageId
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
  touchState();

  broadcast({ type: 'ZOCALO', payload: state.zocalo });
  syncState();

  res.json({ success: true, state: serializeState() });
});

app.post('/title', (req, res) => {
  const { kicker = '', text = '' } = req.body ?? {};

  state.title = {
    kicker: String(kicker),
    text: String(text)
  };
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
  touchState();

  broadcast({ type: 'SHOW_IMAGE', payload: image });
  syncState();

  res.json({ success: true, image, state: serializeState() });
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

  delete imageMetadata[removedImage.id];
  writeImageMetadata(imageMetadata);

  touchState();

  broadcast({ type: 'IMAGE_LIBRARY', payload: { images: state.images } });
  syncState();

  res.json({
    success: true,
    removedImageId: removedImage.id,
    state: serializeState()
  });
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
  touchState();

  broadcast({ type: 'IMAGE_LIBRARY', payload: { images: state.images } });
  broadcast({ type: 'SHOW_IMAGE', payload: image });
  syncState();

  res.status(201).json({ success: true, image, state: serializeState() });
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
