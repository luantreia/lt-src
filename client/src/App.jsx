import React, { useRef, useState } from 'react';
import { useSession } from './hooks/useSession.js';
import { initialImageTransform, normalizeImageTransform } from './utils.js';
import { useZocaloStyle } from './hooks/useZocaloStyle.js';
import { ZocaloPanel } from './components/ZocaloPanel.jsx';
import { BgPanel } from './components/BgPanel.jsx';
import { ImagesPanel } from './components/ImagesPanel.jsx';

function App() {
  const [texto, setTexto] = useState('');
  const [onAirTexto, setOnAirTexto] = useState('');
  const [visible, setVisible] = useState(true);
  const [images, setImages] = useState([]);
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [imageVisible, setImageVisible] = useState(false);
  const [imageTransform, setImageTransform] = useState(initialImageTransform);
  const skipTransformSyncRef = useRef(true);
  const onAirTextoRef = useRef('');

  const { requestJson, status, setStatus, loading, sessionLabel } = useSession({
    onStateSnapshot: applyStateSnapshot,
  });

  const {
    bgStyle,
    textStyle,
    bgDirty,
    textDirty,
    isSyncing,
    applyRemoteStyle,
    updateBgStyle,
    updateTextStyle,
    resetBgStyle,
    resetTextStyle,
  } = useZocaloStyle({ requestJson, setStatus });

  const textDraftDirty = texto !== onAirTexto;

  function handleTextoChange(nextValue) {
    setTexto(nextValue);
  }

  function markTextAsOnAir(nextValue) {
    onAirTextoRef.current = nextValue;
    setOnAirTexto(nextValue);
    setTexto(nextValue);
  }

  function applyStateSnapshot(data) {
    if (!data) return;
    const remoteTexto = data.zocalo?.nombre || '';
    const previousOnAirTexto = onAirTextoRef.current;
    onAirTextoRef.current = remoteTexto;
    setOnAirTexto(remoteTexto);
    setTexto((current) => (current === previousOnAirTexto ? remoteTexto : current));
    setVisible(Boolean(data.visibility?.text ?? true));
    setImages(data.images || []);
    setSelectedImageId(data.selectedImage?.id || null);
    setImageVisible(Boolean(data.visibility?.image ?? false));
    applyRemoteStyle(data.zocaloStyle);
    skipTransformSyncRef.current = true;
    setImageTransform(normalizeImageTransform(data.selectedImageTransform || initialImageTransform));
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-2xl space-y-6">

        <header className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-400">OBS graphics control</p>
          <h1 className="text-2xl font-black uppercase tracking-[0.2em]">Panel de realizacion</h1>
          <p className="text-sm text-slate-400">
            {loading ? 'Cargando...' : status}
            <span className="ml-2 text-slate-600">&mdash; {sessionLabel}</span>
          </p>
        </header>

        <ZocaloPanel
          texto={texto}
          setTexto={handleTextoChange}
          onAirTexto={onAirTexto}
          textDraftDirty={textDraftDirty}
          textStyleDirty={textDirty}
          styleSyncing={isSyncing}
          visible={visible}
          setVisible={setVisible}
          textStyle={textStyle}
          updateTextStyle={updateTextStyle}
          resetTextStyle={resetTextStyle}
          markTextAsOnAir={markTextAsOnAir}
          requestJson={requestJson}
          setStatus={setStatus}
        />

        <BgPanel
          texto={texto}
          textDraftDirty={textDraftDirty}
          bgStyle={bgStyle}
          textStyle={textStyle}
          bgDirty={bgDirty}
          textStyleDirty={textDirty}
          styleSyncing={isSyncing}
          updateBgStyle={updateBgStyle}
          resetBgStyle={resetBgStyle}
          requestJson={requestJson}
          setStatus={setStatus}
        />

        <ImagesPanel
          images={images}
          selectedImageId={selectedImageId}
          imageVisible={imageVisible}
          imageTransform={imageTransform}
          setImageTransform={setImageTransform}
          skipTransformSyncRef={skipTransformSyncRef}
          requestJson={requestJson}
          applyStateSnapshot={applyStateSnapshot}
          setStatus={setStatus}
        />

      </div>
    </div>
  );
}

export default App;
