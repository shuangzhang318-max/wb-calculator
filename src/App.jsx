import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Upload, Trash2, Plus, RefreshCw, 
  Download, Layers, Copy, Check,
  Maximize2, Sun, Contrast, Keyboard,
  Eraser, Command, MousePointer2, Crosshair,
  ZoomIn, ZoomOut, Eye, EyeOff, Info, Target
} from 'lucide-react';

// --- 基础工具函数 ---
const clampInt = (v, min, fallback) => {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.max(min, n) : fallback;
};
const onlyInt = (s) => String(s).replace(/[^\d]/g, '');
const onlyFloat = (s) => {
  let t = String(s).replace(/[^\d.]/g, '');
  const parts = t.split('.');
  return parts.length <= 2 ? t : parts[0] + '.' + parts.slice(1).join('');
};

const App = () => {
  // --- 核心状态 ---
  const [image, setImage] = useState(null);
  const [bands, setBands] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [baseScale, setBaseScale] = useState(1);
  const [brightness, setBrightness] = useState(100); 
  const [contrast, setContrast] = useState(100);
  
  const [selectedBandId, setSelectedBandId] = useState(null);
  const [bgBandId, setBgBandId] = useState(null);
  const [refBandId, setRefBandId] = useState(null);
  
  const [calculationMode, setCalculationMode] = useState('reference'); 
  const [customTargetNetIntensity, setCustomTargetNetIntensity] = useState(50000); 

  const [isFixedSize, setIsFixedSize] = useState(false);
  const [fixedWidthStr, setFixedWidthStr] = useState('80');
  const [fixedHeightStr, setFixedHeightStr] = useState('30');
  
  const [interactionMode, setInteractionMode] = useState(null); 
  const [isKeyboardMoving, setIsKeyboardMoving] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, bandX: 0, bandY: 0, bandW: 0, bandH: 0, handle: null });
  const [currentRect, setCurrentRect] = useState(null);

  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const magnifierRef = useRef(null);
  const keyboardTimer = useRef(null);

  const totalScale = useMemo(() => {
    const s = baseScale * zoom;
    return Number.isFinite(s) && s > 0 ? s : 1;
  }, [baseScale, zoom]);

  // --- 核心算法：Integrated Density (增加安全校验) ---
  const calculateIntDen = useCallback((rect, originalImg) => {
    if (!originalImg || !rect || rect.width < 1 || rect.height < 1) return { sum: 0, area: 0 };
    try {
      const tempCanvas = document.createElement('canvas');
      const tCtx = tempCanvas.getContext('2d');
      const rx = Math.max(0, Math.floor(rect.x));
      const ry = Math.max(0, Math.floor(rect.y));
      const rw = Math.max(1, Math.floor(rect.width));
      const rh = Math.max(1, Math.floor(rect.height));
      
      // 防止超出原图边界
      const safeW = Math.min(rw, originalImg.width - rx);
      const safeH = Math.min(rh, originalImg.height - ry);
      if (safeW <= 0 || safeH <= 0) return { sum: 0, area: 0 };

      tempCanvas.width = safeW; tempCanvas.height = safeH;
      tCtx.drawImage(originalImg, rx, ry, safeW, safeH, 0, 0, safeW, safeH);
      const data = tCtx.getImageData(0, 0, safeW, safeH).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      return { sum, area: safeW * safeH };
    } catch (e) {
      console.error("IntDen Calculation Error:", e);
      return { sum: 0, area: 0 };
    }
  }, []);

  const backgroundMean = useMemo(() => {
    const bg = bands.find(b => b.id === bgBandId);
    return bg && bg.area > 0 ? bg.grayscale / bg.area : 255;
  }, [bands, bgBandId]);

  const getNetIntensity = useCallback((band) => {
    if (!band) return 0;
    return Math.abs(band.grayscale - (band.area * backgroundMean));
  }, [backgroundMean, bands]);

  const getSuggestedLoading = (band) => {
    if (band.id === bgBandId) return "背景";
    const curNet = getNetIntensity(band);
    const refBand = bands.find(b => b.id === refBandId);
    const targetNet = calculationMode === 'reference' 
      ? (refBand ? getNetIntensity(refBand) : 0) 
      : customTargetNetIntensity;
    if (curNet <= 1 || targetNet <= 0) return "信号弱";
    return (band.currentLoading * (targetNet / curNet)).toFixed(2);
  };

  // --- 重置功能 (彻底解决画框 Bug) ---
  const resetWorkspace = useCallback(() => {
    setBands([]);
    setSelectedBandId(null);
    setBgBandId(null);
    setRefBandId(null);
    setInteractionMode(null);
    setCurrentRect(null);
  }, []);

  // --- 图像解析与加载 (增加防御) ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsProcessing(true);
    resetWorkspace();

    const reader = new FileReader();
    reader.onload = (event) => {
      const isTiff = file.name.toLowerCase().match(/\.tiff?$/);
      if (isTiff) {
        if (!window.UTIF) { alert("解析库未就绪"); setIsProcessing(false); return; }
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
          loadImageData(tc.toDataURL());
        } catch (err) { alert("TIFF解析失败"); setIsProcessing(false); }
      } else {
        loadImageData(event.target.result);
      }
    };
    if (file.name.toLowerCase().match(/\.tiff?$/)) reader.readAsArrayBuffer(file);
    else reader.readAsDataURL(file);
  };

  const loadImageData = (url) => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImage(url);
      const container = canvasRef.current?.parentElement?.clientWidth || 800;
      setBaseScale(container / img.width);
      setIsProcessing(false);
    };
    img.src = url;
  };

  // --- 交互绘制逻辑 ---
  const startNewDrawing = (x, y) => {
    setInteractionMode('drawing');
    setDragStart({ x, y });
    const fW = clampInt(fixedWidthStr, 5, 80); 
    const fH = clampInt(fixedHeightStr, 5, 30);
    setCurrentRect(isFixedSize ? { x: x - fW / 2, y: y - fH / 2, width: fW, height: fH } : { x, y, width: 0, height: 0 });
  };

  const handleMouseDown = (e) => {
    if (!image || !imgRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / totalScale;
    const y = (e.clientY - rect.top) / totalScale;

    // 如果列表为空，直接进入画框模式
    if (bands.length === 0) {
      startNewDrawing(x, y); return;
    }

    // 检查控制柄缩放
    if (selectedBandId && !isFixedSize) {
      const b = bands.find(band => band.id === selectedBandId);
      if (b) {
        const hs = 15 / totalScale;
        const points = [{ n: 'tl', x: b.x, y: b.y }, { n: 'br', x: b.x + b.width, y: b.y + b.height }];
        const hit = points.find(p => Math.abs(x - p.x) < hs && Math.abs(y - p.y) < hs);
        if (hit) {
          setInteractionMode('resizing');
          setDragStart({ x, y, bandX: b.x, bandY: b.y, bandW: b.width, bandH: b.height, handle: hit.n });
          return;
        }
      }
    }

    const clicked = [...bands].reverse().find(b => x > b.x && x < b.x + b.width && y > b.y && y < b.y + b.height);
    if (clicked) {
      setSelectedBandId(clicked.id); setInteractionMode('moving');
      setDragStart({ x, y, bandX: clicked.x, bandY: clicked.y });
    } else {
      setSelectedBandId(null);
      startNewDrawing(x, y);
    }
  };

  const handleMouseMove = (e) => {
    if (!interactionMode || !image || !imgRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / totalScale;
    const y = (e.clientY - rect.top) / totalScale;

    if (interactionMode === 'drawing') {
      const nr = isFixedSize 
        ? { ...currentRect, x: x - currentRect.width / 2, y: y - currentRect.height / 2 } 
        : { x: Math.min(x, dragStart.x), y: Math.min(y, dragStart.y), width: Math.max(1, Math.abs(x - dragStart.x)), height: Math.max(1, Math.abs(y - dragStart.y)) };
      setCurrentRect(nr); renderMagnifier(x, y, nr);
    } else if (interactionMode === 'moving') {
      const b = bands.find(b => b.id === selectedBandId);
      if (b) {
        const nb = { ...b, x: dragStart.bandX + (x - dragStart.x), y: dragStart.bandY + (y - dragStart.y) };
        setBands(bands.map(item => item.id === selectedBandId ? nb : item)); renderMagnifier(x, y, nb);
      }
    } else if (interactionMode === 'resizing') {
      let b = bands.find(b => b.id === selectedBandId);
      let { bandX, bandY, bandW, bandH, handle } = dragStart;
      let dx = x - dragStart.x, dy = y - dragStart.y;
      if (handle === 'tl') b = { ...b, x: bandX + dx, y: bandY + dy, width: Math.max(5, bandW - dx), height: Math.max(5, bandH - dy) };
      else if (handle === 'br') b = { ...b, width: Math.max(5, bandW + dx), height: Math.max(5, bandH + dy) };
      setBands(bands.map(item => item.id === selectedBandId ? b : item)); renderMagnifier(x, y, b);
    }
  };

  const handleMouseUp = () => {
    if (!interactionMode) return;
    if (interactionMode === 'drawing' && currentRect && (isFixedSize || currentRect.width > 2)) {
      const { sum, area } = calculateIntDen(currentRect, imgRef.current);
      const newBand = { ...currentRect, id: Date.now(), grayscale: sum, area, currentLoading: 20 };
      setBands([...bands, newBand]); setSelectedBandId(newBand.id); if (!refBandId) setRefBandId(newBand.id);
    } else if (interactionMode === 'moving' || interactionMode === 'resizing') {
      setBands(bands.map(b => (b.id === selectedBandId ? { ...b, ...calculateIntDen(b, imgRef.current), grayscale: calculateIntDen(b, imgRef.current).sum } : b)));
    }
    setInteractionMode(null); setCurrentRect(null);
  };

  const renderMagnifier = useCallback((x, y, activeBand) => {
    if (!magnifierRef.current || !imgRef.current) return;
    const mCanvas = magnifierRef.current; const mCtx = mCanvas.getContext('2d');
    const mSize = 240; const baseSrc = 110;
    mCanvas.width = mSize; mCanvas.height = mSize;
    const srcW = activeBand ? Math.max(baseSrc, activeBand.width + 40) : baseSrc;
    const srcH = activeBand ? Math.max(baseSrc, activeBand.height + 40) : baseSrc;
    const sx = Math.max(0, Math.min(x - srcW / 2, imgRef.current.width - srcW));
    const sy = Math.max(0, Math.min(y - srcH / 2, imgRef.current.height - srcH));
    const scale = Math.min(mSize / srcW, mSize / srcH);
    mCtx.save();
    mCtx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    mCtx.imageSmoothingEnabled = false;
    mCtx.drawImage(imgRef.current, sx, sy, srcW, srcH, (mSize - srcW * scale) / 2, (mSize - srcH * scale) / 2, srcW * scale, srcH * scale);
    mCtx.restore();
    if (activeBand) {
      mCtx.strokeStyle = '#3b82f6'; mCtx.lineWidth = 2;
      mCtx.strokeRect((mSize - srcW * scale) / 2 + (activeBand.x - sx) * scale, (mSize - srcH * scale) / 2 + (activeBand.y - sy) * scale, activeBand.width * scale, activeBand.height * scale);
    }
  }, [brightness, contrast]);

  // --- 画布渲染 ---
  useEffect(() => {
    if (!image || !canvasRef.current || !imgRef.current) return;
    const canvas = canvasRef.current; const ctx = canvas.getContext('2d');
    canvas.width = imgRef.current.width * totalScale;
    canvas.height = imgRef.current.height * totalScale;
    ctx.save(); ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.scale(totalScale, totalScale); ctx.drawImage(imgRef.current, 0, 0);
    ctx.restore();
    ctx.save(); ctx.scale(totalScale, totalScale);
    bands.forEach(b => {
      const isSel = b.id === selectedBandId;
      ctx.setLineDash(b.id === bgBandId ? [4, 4] : []);
      ctx.strokeStyle = isSel ? '#3b82f6' : (b.id === bgBandId ? '#f59e0b' : (b.id === refBandId ? '#10b981' : 'rgba(148,163,184,0.5)'));
      ctx.lineWidth = (isSel ? 3 : 1.5) / totalScale; ctx.strokeRect(b.x, b.y, b.width, b.height);
    });
    if (currentRect) { ctx.strokeStyle = '#3b82f6'; ctx.setLineDash([5, 5]); ctx.strokeRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height); }
    ctx.restore();
  }, [image, bands, currentRect, totalScale, brightness, contrast, selectedBandId, bgBandId, refBandId]);

  useEffect(() => {
    if (!window.UTIF) {
      const s = document.createElement('script'); s.src = "https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js"; s.async = true; document.body.appendChild(s);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8 font-sans text-slate-800 select-none">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-8 flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-5">
              <div className="bg-slate-900 p-4 rounded-3xl text-white shadow-2xl"><Layers size={36} /></div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">WB 蛋白定量助手 <span className="text-indigo-600 font-black">Pro Max</span></h1>
                <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] font-mono mt-1 italic">Scientific IntDen Calibration Tool</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3.5 rounded-2xl cursor-pointer flex items-center gap-3 transition-all shadow-xl font-black text-base">
                <Upload size={22} /> {isProcessing ? "处理中..." : "上传图像"}
                <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*,.tif,.tiff" />
              </label>
              <button onClick={resetWorkspace} className="p-4 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 text-slate-400 shadow-sm"><RefreshCw size={22}/></button>
            </div>
          </div>

          <div className="bg-white border border-indigo-100 rounded-[28px] p-8 shadow-sm flex items-center gap-8">
            <div className="bg-indigo-600 p-3 text-white rounded-2xl shadow-lg shadow-indigo-100"><Info size={28}/></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 flex-1 text-sm font-bold text-slate-500">
              <div><p className="text-indigo-600 font-black uppercase text-[12px] mb-2 tracking-widest">Step 1</p>上传原始图像或 TIFF 文件数据</div>
              <div className="border-l pl-8"><p className="text-indigo-600 font-black uppercase text-[12px] mb-2 tracking-widest">Step 2</p>框选背景，点击右侧“设为背景”</div>
              <div className="border-l pl-8"><p className="text-indigo-600 font-black uppercase text-[12px] mb-2 tracking-widest">Step 3</p>框选样品，点击条带上的“基准”</div>
              <div className="border-l pl-8"><p className="text-indigo-600 font-black uppercase text-[12px] mb-2 tracking-widest">Step 4</p>调整上样量，导出 IntDen 分析报告</div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-8">
            <div className="bg-white rounded-[48px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[800px] relative">
              <div className="px-10 py-5 border-b flex items-center justify-between bg-white/90 backdrop-blur-md z-10">
                <div className="flex items-center gap-8">
                  <div className="flex items-center gap-2 bg-slate-100 rounded-2xl p-1.5 border">
                    <button onClick={() => setZoom(Math.max(0.1, zoom - 0.2))} className="p-2 hover:bg-white rounded-xl transition-all"><ZoomOut size={18}/></button>
                    <span className="text-sm font-black w-14 text-center text-indigo-600">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(Math.min(10, zoom + 0.2))} className="p-2 hover:bg-white rounded-xl transition-all"><ZoomIn size={18}/></button>
                  </div>
                  <div className="flex items-center gap-8 ml-4">
                    <div className="flex items-center gap-4 group" onDoubleClick={() => setBrightness(100)}><Sun size={20} className="text-amber-500"/><input type="range" min="50" max="300" value={brightness} onChange={e => setBrightness(e.target.value)} className="wb-slider w-32" /></div>
                    <div className="flex items-center gap-4 group" onDoubleClick={() => setContrast(100)}><Contrast size={20} className="text-indigo-500"/><input type="range" min="50" max="300" value={contrast} onChange={e => setContrast(e.target.value)} className="wb-slider w-32" /></div>
                  </div>
                </div>
                {selectedBandId && <button onClick={() => setBgBandId(selectedBandId)} className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl text-xs font-black uppercase transition-all shadow-md ${bgBandId === selectedBandId ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}><Eraser size={16} /> 设为背景</button>}
              </div>
              <div className="flex-1 overflow-auto bg-[#f8fafc] p-12 flex items-center justify-center relative shadow-inner">
                {(interactionMode || isKeyboardMoving) && <div className="absolute top-8 left-8 z-20 pointer-events-none animate-in zoom-in-95"><div className="bg-slate-900 p-1.5 rounded-[32px] shadow-2xl border-4 border-white/20"><canvas ref={magnifierRef} /></div></div>}
                {!image ? <div className="text-slate-300 flex flex-col items-center opacity-40"><Crosshair size={80} className="mb-6"/><p className="text-sm font-black uppercase tracking-[0.4em]">Integrated Density Analysis</p></div> : <div className="relative shadow-2xl border-[16px] border-white ring-1 ring-slate-200"><canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} className="cursor-crosshair block" /></div>}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="bg-white rounded-[48px] shadow-2xl border border-slate-200 flex flex-col max-h-[800px] min-h-[400px] overflow-hidden">
              <div className="px-10 py-8 border-b flex justify-between items-center bg-slate-50/50">
                <h2 className="font-black text-slate-800 uppercase text-xl tracking-tight">定量数据</h2>
                <button onClick={() => {
                   const text = bands.map((b, i) => `Band ${i + 1}: ${getNetIntensity(b).toFixed(0)}`).join('\n');
                   navigator.clipboard.writeText(text).then(() => { setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); });
                }} className={`px-4 py-2.5 rounded-2xl border flex items-center gap-2 transition-all font-black text-xs ${copySuccess ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-500 hover:bg-slate-50 shadow-sm'}`}>{copySuccess ? <Check size={16}/> : <Copy size={16}/>} {copySuccess ? '已复制' : '复制数据'}</button>
              </div>

              <div className="px-10 py-6 border-b bg-indigo-50/40 space-y-6">
                 <div className="flex gap-3">
                    <button onClick={() => setCalculationMode('reference')} className={`flex-1 py-4 rounded-2xl text-[11px] font-black uppercase transition-all shadow-sm ${calculationMode === 'reference' ? 'bg-indigo-600 text-white shadow-indigo-100' : 'bg-white text-slate-400 border border-indigo-100'}`}>基准参照</button>
                    <button onClick={() => setCalculationMode('custom')} className={`flex-1 py-4 rounded-2xl text-[11px] font-black uppercase transition-all shadow-sm ${calculationMode === 'custom' ? 'bg-indigo-600 text-white shadow-indigo-100' : 'bg-white text-slate-400 border border-indigo-100'}`}>定值模式</button>
                 </div>
                 {calculationMode === 'custom' && (
                    <div className="space-y-4 p-5 bg-white rounded-[28px] border border-indigo-100 shadow-inner">
                       <div className="flex justify-between items-center px-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target IntDen</span>
                          <span className="text-sm font-mono font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">{customTargetNetIntensity}</span>
                       </div>
                       <input type="range" min="1000" max="1000000" step="1000" value={customTargetNetIntensity} onChange={e => setCustomTargetNetIntensity(parseInt(e.target.value))} className="wb-slider w-full" />
                    </div>
                 )}
                 <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={isFixedSize} onChange={e => setIsFixedSize(e.target.checked)} className="w-6 h-6 rounded-lg text-indigo-600 focus:ring-0 shadow-inner" /><span className="text-xs font-black uppercase text-slate-500 tracking-wider">固定尺寸选框</span></label>
                    {isFixedSize && <div className="flex gap-2"><input type="text" value={fixedWidthStr} onChange={e => setFixedWidthStr(onlyInt(e.target.value))} className="w-16 text-xs font-black p-2 border rounded-xl text-center shadow-inner" /><input type="text" value={fixedHeightStr} onChange={e => setFixedHeightStr(onlyInt(e.target.value))} className="w-16 text-xs font-black p-2 border rounded-xl text-center shadow-inner" /></div>}
                 </div>
              </div>

              <div className="overflow-y-auto flex-1 custom-scrollbar bg-white">
                <div className="p-8 space-y-6">
                  {bands.length === 0 ? <div className="py-24 text-center opacity-20 font-black uppercase text-xs tracking-[0.3em] leading-loose">No Protein Detected<br/>Select Bands to Start Quantification</div> : 
                    bands.map((band, i) => (
                      <div key={band.id} onClick={() => setSelectedBandId(band.id)} className={`p-6 rounded-[36px] border-2 transition-all cursor-pointer relative shadow-sm hover:shadow-md ${band.id === selectedBandId ? 'border-blue-500 ring-8 ring-blue-50 bg-white' : (band.id === bgBandId ? 'bg-amber-50/60 border-amber-200' : (band.id === refBandId ? 'bg-emerald-50/60 border-emerald-100' : 'bg-slate-50/50 border-slate-100'))}`}>
                        <div className="flex justify-between items-start mb-5">
                          <div className="flex items-center gap-4">
                            <span className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black shadow-sm ${band.id === bgBandId ? 'bg-amber-500 text-white' : (band.id === refBandId ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white')}`}>{i+1}</span>
                            <div>
                               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{band.id === bgBandId ? '背景参考' : (band.id === refBandId ? '基准样品' : '实验样品')}</span>
                               <span className="text-lg font-mono font-black block text-slate-900 mt-0.5">净强度: {getNetIntensity(band).toFixed(0)}</span>
                            </div>
                          </div>
                          <div className="flex gap-3">
                             {band.id !== refBandId && band.id !== bgBandId && <button onClick={(e) => {e.stopPropagation(); setRefBandId(band.id);}} className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-5 py-2.5 rounded-xl border border-emerald-100 hover:bg-emerald-500 hover:text-white transition-all shadow-sm">基准</button>}
                             <button onClick={(e) => {e.stopPropagation(); setBands(bands.filter(b => b.id !== band.id));}} className="text-rose-400 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 size={22}/></button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-8">
                          <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">本次上样 (微升)</label><input type="text" value={band.currentLoading} onChange={(e) => setBands(bands.map(b => b.id === band.id ? {...b, currentLoading: onlyFloat(e.target.value)} : b))} className="w-full text-lg font-mono font-black bg-white border-2 border-slate-100 rounded-2xl px-5 py-4 outline-none focus:border-indigo-500 transition-colors shadow-inner" /></div>
                          <div className="space-y-2"><label className="text-[10px] font-black text-blue-500 uppercase ml-1 tracking-wider">建议下回(微升)</label><div className="bg-blue-600 text-white rounded-2xl px-5 py-4 text-lg font-mono font-black text-center shadow-lg shadow-blue-100 border-2 border-blue-400">{getSuggestedLoading(band)}</div></div>
                        </div>
                      </div>
                    ))
                  }
                  {bands.length > 0 && (
                    <div className="pt-4 space-y-5">
                      <button onClick={() => {
                        const rb = bands.find(b => b.id === (refBandId || bands[0].id));
                        if (!rb) return;
                        setBands(bands.map(b => {
                          const nb = { ...b, width: rb.width, height: rb.height };
                          const { sum, area } = calculateIntDen(nb, imgRef.current);
                          return { ...nb, grayscale: sum, area };
                        }));
                      }} className="w-full bg-emerald-600 text-white py-5 rounded-[24px] font-black text-xs uppercase tracking-[0.25em] shadow-xl hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-3"><Maximize2 size={20} /> 同步选区面积</button>
                      <button onClick={() => {
                        const csv = "序号,净强度(IntDen),上样量(uL),建议下回(uL)\n" + bands.map((b,i)=>`${i+1},${getNetIntensity(b).toFixed(0)},${b.currentLoading},${getSuggestedLoading(b)}`).join("\n");
                        const blob = new Blob(["\ufeff"+csv], {type: 'text/csv'}); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download=`WB_Quant_Report.csv`; link.click();
                      }} className="w-full bg-slate-900 text-white py-5.5 rounded-[24px] font-black text-xs uppercase tracking-[0.25em] shadow-2xl hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-3"><Download size={22} /> 导出分析报告</button>
                    </div>
                  )}
                </div>
              </div>
              <footer className="text-center text-slate-300 text-[11px] font-black uppercase tracking-[0.5em] py-8 bg-white">All Rights Reserved by zhangshuang</footer>
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