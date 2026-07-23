import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Info
} from 'lucide-react';
import { buildReportCsv, getReportFileName } from './lib/export';
import { getFileEndian, inferPreviewAlignedInvert } from './lib/image-io';
import { onlyInt, onlyFloat } from './lib/input';
import { getBackgroundMean, getNetIntensity as getQuantNetIntensity, getSuggestedLoading as getQuantSuggestedLoading } from './lib/quant';
import ImageCanvas from './components/ImageCanvas';
import QuantPanel from './components/QuantPanel';
import BandList from './components/BandList';
import { clampBandToBounds } from './lib/rect';
import useCanvasInteraction from './hooks/useCanvasInteraction';
import { copy } from './i18n';

const App = () => {
  const [language, setLanguage] = useState(() => new URLSearchParams(window.location.search).get('lang') === 'en' || localStorage.getItem('wb-calculator-language') === 'en' ? 'en' : 'zh');
  const t = copy[language];
  const changeLanguage = (nextLanguage) => {
    setLanguage(nextLanguage);
    localStorage.setItem('wb-calculator-language', nextLanguage);
    const url = new URL(window.location.href);
    if (nextLanguage === 'en') url.searchParams.set('lang', 'en'); else url.searchParams.delete('lang');
    window.history.replaceState({}, '', url);
  };
  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title = t.seoTitle;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.seoDescription);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', t.seoTitle);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', t.ogDescription);
    document.getElementById('og-url')?.setAttribute('content', language === 'en'
      ? 'https://wb.unwedomain.xyz/?lang=en'
      : 'https://wb.unwedomain.xyz/');
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', language === 'en'
      ? 'https://wb.unwedomain.xyz/?lang=en'
      : 'https://wb.unwedomain.xyz/');
  }, [language, t]);
  // --- 核心状态 ---
  const [image, setImage] = useState(null);
  const [imageFileName, setImageFileName] = useState('');
  const [imageQuantData, setImageQuantData] = useState(null);
  const [bands, setBands] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [baseScale, setBaseScale] = useState(1);
  const [brightness, setBrightness] = useState(100); 
  const [contrast, setContrast] = useState(100);
  
  const [selectedBandId, setSelectedBandId] = useState(null);
  const [bgBandId, setBgBandId] = useState(null);
  const [refBandId, setRefBandId] = useState(null);
  const [signalPolarity, setSignalPolarity] = useState('dark-on-light');
  
  const [calculationMode, setCalculationMode] = useState('reference'); 
  const [customTargetNetIntensity, setCustomTargetNetIntensity] = useState(50000); 

  const [isFixedSize, setIsFixedSize] = useState(true);
  const [fixedWidthStr, setFixedWidthStr] = useState('80');
  const [fixedHeightStr, setFixedHeightStr] = useState('30');
  
  const canvasRef = useRef(null);
  const canvasShellRef = useRef(null);
  const imgRef = useRef(null);
  const magnifierRef = useRef(null);

  const totalScale = useMemo(() => {
    const s = baseScale * zoom;
    return Number.isFinite(s) && s > 0 ? s : 1;
  }, [baseScale, zoom]);

  // --- 核心算法：Integrated Density (增加安全校验) ---
  const calculateIntDen = useCallback((rect, originalImg) => {
    if (!originalImg || !rect || rect.width < 1 || rect.height < 1) return { sum: 0, area: 0, saturatedPixels: 0 };

    const rx = Math.max(0, Math.floor(rect.x));
    const ry = Math.max(0, Math.floor(rect.y));
    const rw = Math.max(1, Math.floor(rect.width));
    const rh = Math.max(1, Math.floor(rect.height));
    const safeW = Math.min(rw, originalImg.width - rx);
    const safeH = Math.min(rh, originalImg.height - ry);
    if (safeW <= 0 || safeH <= 0) return { sum: 0, area: 0, saturatedPixels: 0 };

    if (imageQuantData?.kind === 'tiff-raw' && imageQuantData.width === originalImg.width && imageQuantData.height === originalImg.height) {
      try {
        const { data, bitDepth, samplesPerPixel, photometric, littleEndian, previewAlignedInvert } = imageQuantData;
        const bytesPerSample = bitDepth / 8;
        const maxValue = (2 ** bitDepth) - 1;
        const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
        let sum = 0;
        let saturatedPixels = 0;
        const alignBrightness = (brightnessValue) => (previewAlignedInvert ? maxValue - brightnessValue : brightnessValue);
        const isSignalEndSaturated = (brightnessValue) => (
          signalPolarity === 'dark-on-light'
            ? brightnessValue <= 0
            : brightnessValue >= maxValue
        );

        const readSample = (sampleIndex) => {
          if (bitDepth === 8) return data[sampleIndex];
          if (bitDepth === 16) return dataView.getUint16(sampleIndex * bytesPerSample, littleEndian);
          return null;
        };

        for (let yy = ry; yy < ry + safeH; yy += 1) {
          for (let xx = rx; xx < rx + safeW; xx += 1) {
            const pixelIndex = yy * imageQuantData.width + xx;
            if (samplesPerPixel === 1) {
              const rawValue = readSample(pixelIndex);
              if (rawValue == null) continue;
              const brightness = alignBrightness(photometric === 0 ? maxValue - rawValue : rawValue);
              sum += brightness;
              if (isSignalEndSaturated(brightness)) saturatedPixels += 1;
            } else if (samplesPerPixel >= 3) {
              const baseIndex = pixelIndex * samplesPerPixel;
              const r = readSample(baseIndex);
              const g = readSample(baseIndex + 1);
              const b = readSample(baseIndex + 2);
              if (r == null || g == null || b == null) continue;
              const brightness = alignBrightness(0.299 * r + 0.587 * g + 0.114 * b);
              sum += brightness;
              if (isSignalEndSaturated(brightness)) {
                saturatedPixels += 1;
              }
            }
          }
        }

        return { sum, area: safeW * safeH, saturatedPixels };
      } catch (e) {
        console.error('TIFF Raw IntDen Calculation Error:', e);
      }
    }

    try {
      const tempCanvas = document.createElement('canvas');
      const tCtx = tempCanvas.getContext('2d');
      tempCanvas.width = safeW;
      tempCanvas.height = safeH;
      tCtx.drawImage(originalImg, rx, ry, safeW, safeH, 0, 0, safeW, safeH);
      const data = tCtx.getImageData(0, 0, safeW, safeH).data;
      let sum = 0;
      let saturatedPixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        const luminance = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        sum += luminance;
        if (signalPolarity === 'dark-on-light' ? luminance <= 0 : luminance >= 255) {
          saturatedPixels += 1;
        }
      }
      return { sum, area: safeW * safeH, saturatedPixels };
    } catch (e) {
      console.error('IntDen Calculation Error:', e);
      return { sum: 0, area: 0, saturatedPixels: 0 };
    }
  }, [imageQuantData, signalPolarity]);

  const backgroundMean = useMemo(() => getBackgroundMean({ bands, bgBandId }), [bands, bgBandId]);

  const getNetIntensity = useCallback((band) => getQuantNetIntensity({
    band,
    backgroundMean,
    signalPolarity,
  }), [backgroundMean, signalPolarity]);

  const hasNonPositiveSignal = useMemo(
    () => bands.some((band) => band.id !== bgBandId && getNetIntensity(band) <= 0),
    [bands, bgBandId, getNetIntensity]
  );

  const setBandAsBackground = useCallback((bandId) => {
    setBgBandId((prevBgBandId) => prevBgBandId === bandId ? null : bandId);
    setRefBandId((prevRefBandId) => prevRefBandId === bandId ? null : prevRefBandId);
  }, []);

  const setBandAsReference = useCallback((bandId) => {
    setRefBandId((prevRefBandId) => prevRefBandId === bandId ? null : bandId);
    setBgBandId((prevBgBandId) => prevBgBandId === bandId ? null : prevBgBandId);
  }, []);

  const removeBand = useCallback((bandId) => {
    setBands((prevBands) => prevBands.filter((band) => band.id !== bandId));
    setSelectedBandId((prevSelectedBandId) => prevSelectedBandId === bandId ? null : prevSelectedBandId);
    setBgBandId((prevBgBandId) => prevBgBandId === bandId ? null : prevBgBandId);
    setRefBandId((prevRefBandId) => prevRefBandId === bandId ? null : prevRefBandId);
  }, []);

  const getDefaultBandLabel = useCallback((band, index) => {
    if (band.id === bgBandId) return t.background;
    return t.sample(index + 1);
  }, [bgBandId, t]);

  const getBandLabel = useCallback((band, index) => {
    if (band.id === bgBandId) return t.background;
    const customName = String(band.name || '').trim();
    return customName || getDefaultBandLabel(band, index);
  }, [bgBandId, getDefaultBandLabel, t]);

  const clampBandToImage = useCallback((band) => {
    if (!imgRef.current) return band;
    return clampBandToBounds(band, imgRef.current.width, imgRef.current.height);
  }, []);

  const getSuggestedLoading = useCallback((band) => getQuantSuggestedLoading({
    band,
    bands,
    bgBandId,
    refBandId,
    calculationMode,
    customTargetNetIntensity,
    backgroundMean,
    signalPolarity,
  }), [bands, bgBandId, refBandId, calculationMode, customTargetNetIntensity, backgroundMean, signalPolarity]);

  const handleBandNameChange = useCallback((bandId, value) => {
    setBands((prevBands) => prevBands.map((band) => (
      band.id === bandId ? { ...band, name: value } : band
    )));
  }, []);

  const handleBandLoadingChange = useCallback((bandId, value) => {
    setBands((prevBands) => prevBands.map((band) => (
      band.id === bandId ? { ...band, currentLoading: onlyFloat(value) } : band
    )));
  }, []);

  const handleSyncBandSize = useCallback(() => {
    const referenceBand = bands.find((band) => band.id === (refBandId || bands[0]?.id));
    if (!referenceBand) return;

    setBands((prevBands) => prevBands.map((band) => {
      const nextBand = { ...band, width: referenceBand.width, height: referenceBand.height };
      const { sum, area, saturatedPixels } = calculateIntDen(nextBand, imgRef.current);
      return { ...nextBand, grayscale: sum, area, saturatedPixels };
    }));
  }, [bands, refBandId, calculateIntDen]);

  const handleExport = useCallback(() => {
    const csv = buildReportCsv({
      bands,
      bgBandId,
      refBandId,
      signalPolarity,
      imageQuantData,
      getBandLabel,
      getNetIntensity,
      getSuggestedLoading,
    });
    const blob = new Blob(["﻿" + csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = getReportFileName(imageFileName);
    link.click();
  }, [bands, bgBandId, refBandId, signalPolarity, imageQuantData, getBandLabel, getNetIntensity, getSuggestedLoading, imageFileName]);

  const {
    interactionMode,
    isKeyboardMoving,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    resetInteraction,
    showMagnifier,
  } = useCanvasInteraction({
    image,
    bands,
    setBands,
    selectedBandId,
    setSelectedBandId,
    bgBandId,
    refBandId,
    setBgBandId,
    setRefBandId,
    isFixedSize,
    fixedWidthStr,
    fixedHeightStr,
    totalScale,
    brightness,
    contrast,
    canvasRef,
    canvasShellRef,
    imgRef,
    magnifierRef,
    calculateIntDen,
    clampBandToImage,
    removeBand,
  });

  // --- 重置功能 (彻底解决画框 Bug) ---
  const resetWorkspace = useCallback(() => {
    setBands([]);
    setSelectedBandId(null);
    setBgBandId(null);
    setRefBandId(null);
    resetInteraction();
    setImageQuantData(null);
  }, [resetInteraction]);

  // --- 图像解析与加载 (增加防御) ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsProcessing(true);
    setImageFileName(file.name);
    resetWorkspace();

    const reader = new FileReader();
    reader.onload = (event) => {
      const isTiff = file.name.toLowerCase().match(/\.tiff?$/);
      if (isTiff) {
        if (!window.UTIF) { alert(t.tiffUnavailable); setIsProcessing(false); return; }
        try {
          const buffer = event.target.result;
          const ifds = window.UTIF.decode(buffer);
          window.UTIF.decodeImage(buffer, ifds[0]);
          const rgba = window.UTIF.toRGBA8(ifds[0]);
          const tc = document.createElement('canvas');
          tc.width = ifds[0].width; tc.height = ifds[0].height;
          const ctx = tc.getContext('2d');
          const imgData = new ImageData(new Uint8ClampedArray(rgba), tc.width, tc.height);
          ctx.putImageData(imgData, 0, 0);
          const bitsPerSample = Array.isArray(ifds[0].t258) ? ifds[0].t258[0] : 8;
          const samplesPerPixel = ifds[0].t277 ? ifds[0].t277[0] : 1;
          const photometric = ifds[0].t262 ? ifds[0].t262[0] : (samplesPerPixel >= 3 ? 2 : 1);
          const planarConfig = ifds[0].t284 ? ifds[0].t284[0] : 1;
          const quantData = (() => {
            if (!((bitsPerSample === 8 || bitsPerSample === 16) && (samplesPerPixel === 1 || samplesPerPixel >= 3) && planarConfig === 1 && ifds[0].data)) {
              return null;
            }
            const rawData = new Uint8Array(ifds[0].data);
            const littleEndian = getFileEndian(buffer);
            return {
              kind: 'tiff-raw',
              width: ifds[0].width,
              height: ifds[0].height,
              bitDepth: bitsPerSample,
              samplesPerPixel,
              photometric,
              littleEndian,
              previewAlignedInvert: inferPreviewAlignedInvert({
                data: rawData,
                rgba,
                width: ifds[0].width,
                height: ifds[0].height,
                bitDepth: bitsPerSample,
                samplesPerPixel,
                photometric,
                littleEndian,
              }),
              data: rawData,
            };
          })();
          loadImageData(tc.toDataURL(), quantData);
        } catch { alert(t.tiffFailed); setIsProcessing(false); }
      } else {
        loadImageData(event.target.result, null);
      }
    };
    if (file.name.toLowerCase().match(/\.tiff?$/)) reader.readAsArrayBuffer(file);
    else reader.readAsDataURL(file);
  };

  const loadImageData = (url, quantData = null) => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImage(url);
      setImageQuantData(quantData);
      const container = canvasRef.current?.parentElement?.clientWidth || 800;
      setBaseScale(container / img.width);
      setIsProcessing(false);
    };
    img.src = url;
  };

  useEffect(() => {
    if (!window.UTIF) {
      const s = document.createElement('script'); s.src = "https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js"; s.async = true; document.body.appendChild(s);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-6 font-sans text-slate-800 select-none">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
  {/* 把 h1 改成“标题 + 首页按钮”同行 */}
  <div className="flex items-center gap-4">
    <h1 className="text-3xl font-black text-slate-900 tracking-tight">
      {t.title} <span className="text-indigo-600 font-black">Pro Max</span>
    </h1>

    {/* 首页按钮 */}
    <a
      href="https://cyanhelix.unwedomain.xyz"
      target="_blank"
      rel="noopener noreferrer"
      className="
  bg-indigo-600
  hover:bg-indigo-700
  text-white
  border border-indigo-600
  px-5 py-2
  rounded-xl
  font-bold
  text-sm
  shadow-md
  hover:shadow-lg
  transition-all duration-200
"

      title={t.openHome}
    >
      {t.home}
    </a>
    <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white" role="group" aria-label={t.language}>
      <button type="button" onClick={() => changeLanguage('zh')} aria-pressed={language === 'zh'} className={`px-3 py-2 text-xs font-black ${language === 'zh' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>中文</button>
      <button type="button" onClick={() => changeLanguage('en')} aria-pressed={language === 'en'} className={`border-l border-slate-200 px-3 py-2 text-xs font-black ${language === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>EN</button>
    </div>
  </div>

  <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] font-mono mt-1 italic">
    Scientific IntDen Calibration Tool
  </p>
</div>

          </div>

          <div className="mx-auto flex w-full max-w-[1120px] items-start gap-5 rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
            <div className="shrink-0 rounded-xl bg-indigo-600 p-2.5 text-white shadow-lg shadow-indigo-100"><Info size={22}/></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 flex-1 text-[13px] font-bold text-slate-500 leading-5">
              <div><p className="text-indigo-600 font-black uppercase text-[11px] mb-1 tracking-[0.2em]">Step 1</p>{t.step1}</div>
              <div className="border-l pl-4 md:pl-5"><p className="text-indigo-600 font-black uppercase text-[11px] mb-1 tracking-[0.2em]">Step 2</p>{t.step2}</div>
              <div className="border-l pl-4 md:pl-5"><p className="text-indigo-600 font-black uppercase text-[11px] mb-1 tracking-[0.2em]">Step 3</p>{t.step3}</div>
              <div className="border-l pl-4 md:pl-5"><p className="text-indigo-600 font-black uppercase text-[11px] mb-1 tracking-[0.2em]">Step 4</p>{t.step4}</div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7">
              <ImageCanvas
              t={t}
              zoom={zoom}
              onZoomOut={() => setZoom(Math.max(0.1, zoom - 0.2))}
              onZoomIn={() => setZoom(Math.min(10, zoom + 0.2))}
              brightness={brightness}
              onBrightnessChange={setBrightness}
              onBrightnessReset={() => setBrightness(100)}
              contrast={contrast}
              onContrastChange={setContrast}
              onContrastReset={() => setContrast(100)}
              isProcessing={isProcessing}
              onUploadImage={handleImageUpload}
              onResetWorkspace={resetWorkspace}
              selectedBandId={selectedBandId}
              showMagnifier={showMagnifier}
              interactionMode={interactionMode}
              isKeyboardMoving={isKeyboardMoving}
              image={image}
              magnifierRef={magnifierRef}
              canvasRef={canvasRef}
              canvasShellRef={canvasShellRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            />
          </div>

          <div className="lg:col-span-5">
            <div className="bg-white rounded-[48px] shadow-2xl border border-slate-200 flex flex-col h-[calc(100vh-12rem)] min-h-[560px] max-h-[calc(100vh-4rem)] overflow-hidden">
              <QuantPanel
                t={t}
                calculationMode={calculationMode}
                onCalculationModeChange={setCalculationMode}
                signalPolarity={signalPolarity}
                onSignalPolarityChange={setSignalPolarity}
                hasNonPositiveSignal={hasNonPositiveSignal}
                imageQuantData={imageQuantData}
                customTargetNetIntensity={customTargetNetIntensity}
                onCustomTargetNetIntensityChange={setCustomTargetNetIntensity}
                isFixedSize={isFixedSize}
                onFixedSizeChange={setIsFixedSize}
                fixedWidthStr={fixedWidthStr}
                fixedHeightStr={fixedHeightStr}
                onFixedWidthChange={(value) => setFixedWidthStr(onlyInt(value))}
                onFixedHeightChange={(value) => setFixedHeightStr(onlyInt(value))}
                bgBandId={bgBandId}
                refBandId={refBandId}
              />

              <BandList
                t={t}
                bands={bands}
                selectedBandId={selectedBandId}
              showMagnifier={showMagnifier}
                bgBandId={bgBandId}
                refBandId={refBandId}
                calculationMode={calculationMode}
                signalPolarity={signalPolarity}
                getNetIntensity={getNetIntensity}
                getBandLabel={getBandLabel}
                getDefaultBandLabel={getDefaultBandLabel}
                getSuggestedLoading={getSuggestedLoading}
                onSelectBand={setSelectedBandId}
                onSetReference={setBandAsReference}
                onToggleBackground={setBandAsBackground}
                onRemoveBand={removeBand}
                onNameChange={handleBandNameChange}
                onLoadingChange={handleBandLoadingChange}
                onSyncBandSize={handleSyncBandSize}
                onExport={handleExport}
              />

              <footer className="bg-white py-4 text-center text-[9px] font-black uppercase tracking-[0.35em] text-slate-300 md:py-3">All Rights Reserved by zhangshuang</footer>
            </div>
          </div>
        </div>
      </div>
      
      

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; } 
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        canvas { image-rendering: pixelated; }
        .wb-slider { -webkit-appearance: none; background: transparent; cursor: pointer; height: 16px; outline: none; }
        .wb-slider::-webkit-slider-runnable-track { background: #e2e8f0; height: 6px; border-radius: 10px; }
        .wb-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; background: #4f46e5; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-top: -6px; transition: scale 0.2s; }
        .wb-slider:hover::-webkit-slider-thumb { scale: 1.2; }
        .py-5\\.5 { padding-top: 1.375rem; padding-bottom: 1.375rem; }
      `}</style>
    </div>
  );
};

export default App;
