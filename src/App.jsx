import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Upload, Trash2, Plus, RefreshCw, 
  Download, Layers, CheckCircle2, 
  Move, ZoomIn, ZoomOut, Eye, EyeOff, 
  Maximize2, Sun, Contrast, HelpCircle, Keyboard, Target as TargetIcon,
  Search, Eraser, Command, MousePointer2, Crosshair
} from 'lucide-react';

const App = () => {
  const [image, setImage] = useState(null);
  const [bands, setBands] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState(null);
  
  const [showAllBandsOnCanvas, setShowAllBandsOnCanvas] = useState(true);
  const [isFixedSize, setIsFixedSize] = useState(false);
  const [fixedWidth, setFixedWidth] = useState(80);
  const [fixedHeight, setFixedHeight] = useState(30);

  const [brightness, setBrightness] = useState(100); 
  const [contrast, setContrast] = useState(100);

  const [zoom, setZoom] = useState(1);
  const [baseScale, setBaseScale] = useState(1);
  const [selectedBandId, setSelectedBandId] = useState(null);
  const [interactionMode, setInteractionMode] = useState(null); 
  const [isKeyboardMoving, setIsKeyboardMoving] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, bandX: 0, bandY: 0, bandW: 0, bandH: 0, handle: null });
  const [currentRect, setCurrentRect] = useState(null);
  
  const [refBandId, setRefBandId] = useState(null);
  const [bgBandId, setBgBandId] = useState(null); 
  const [calculationMode, setCalculationMode] = useState('reference'); 
  const [customTargetNetIntensity, setCustomTargetNetIntensity] = useState(100);

  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const magnifierRef = useRef(null);
  const keyboardTimer = useRef(null);

  const totalScale = useMemo(() => baseScale * zoom, [baseScale, zoom]);

  const backgroundGray = useMemo(() => {
    const bgBand = bands.find(b => b.id === bgBandId);
    return bgBand ? bgBand.grayscale : 255; 
  }, [bands, bgBandId]);

  // --- 1. 基础逻辑函数 ---

  const calculateGrayscale = useCallback((rect, originalImg) => {
    if (!originalImg) return 0;
    const tempCanvas = document.createElement('canvas');
    const tCtx = tempCanvas.getContext('2d');
    const rx = Math.max(0, Math.floor(rect.x));
    const ry = Math.max(0, Math.floor(rect.y));
    const rw = Math.max(1, Math.floor(rect.width));
    const rh = Math.max(1, Math.floor(rect.height));
    tempCanvas.width = rw;
    tempCanvas.height = rh;
    tCtx.drawImage(originalImg, rx, ry, rw, rh, 0, 0, rw, rh);
    const data = tCtx.getImageData(0, 0, rw, rh).data;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      total += g;
    }
    return total / (data.length / 4);
  }, []);

  const getNetIntensity = useCallback((bandGray) => {
    return Math.abs(backgroundGray - bandGray);
  }, [backgroundGray]);

  const renderMagnifier = useCallback((x, y, activeBand) => {
    if (!magnifierRef.current || !imgRef.current) return;
    const mCtx = magnifierRef.current.getContext('2d');
    const mSize = 150; 
    const mScale = 2; 
    const srcSize = mSize / mScale;

    magnifierRef.current.width = mSize;
    magnifierRef.current.height = mSize;
    mCtx.clearRect(0, 0, mSize, mSize);
    
    mCtx.save();
    mCtx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    const sx = Math.max(0, Math.min(x - srcSize / 2, imgRef.current.width - srcSize));
    const sy = Math.max(0, Math.min(y - srcSize / 2, imgRef.current.height - srcSize));
    mCtx.drawImage(imgRef.current, sx, sy, srcSize, srcSize, 0, 0, mSize, mSize);
    mCtx.restore();

    if (activeBand) {
      mCtx.save();
      mCtx.strokeStyle = '#3b82f6';
      mCtx.lineWidth = 2;
      const mx = (activeBand.x - sx) * mScale;
      const my = (activeBand.y - sy) * mScale;
      const mw = activeBand.width * mScale;
      const mh = activeBand.height * mScale;
      mCtx.strokeRect(mx, my, mw, mh);
      mCtx.restore();
    }

    mCtx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    mCtx.beginPath();
    mCtx.moveTo(mSize / 2, 0); mCtx.lineTo(mSize / 2, mSize);
    mCtx.moveTo(0, mSize / 2); mCtx.lineTo(mSize, mSize / 2);
    mCtx.stroke();
    mCtx.strokeStyle = '#cbd5e1'; mCtx.lineWidth = 2;
    mCtx.strokeRect(0, 0, mSize, mSize);
  }, [brightness, contrast]);

  const getImagePos = useCallback((e) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / totalScale, y: (e.clientY - rect.top) / totalScale };
  }, [totalScale]);

  const updateBandProperty = useCallback((id, key, val) => {
    setBands(prev => prev.map(b => {
      if (b.id === id) {
        const nb = { ...b, [key]: parseFloat(val) || 0 };
        return { ...nb, grayscale: calculateGrayscale(nb, imgRef.current) };
      }
      return b;
    }));
  }, [calculateGrayscale]);

  const syncAllSizes = useCallback(() => {
    const tid = refBandId || (bands.length > 0 ? bands[0].id : null);
    if (!tid || !imgRef.current) return;
    const rb = bands.find(b => b.id === tid);
    if (!rb) return;
    setBands(prev => prev.map(b => {
      const nb = { ...b, width: rb.width, height: rb.height };
      return { ...nb, grayscale: calculateGrayscale(nb, imgRef.current) };
    }));
    setMessage({ type: 'success', text: '面积已同步：所有样品选区大小已对齐。' });
  }, [refBandId, bands, calculateGrayscale]);

  // --- 2. 生命周期管理 ---

  useEffect(() => {
    if (!window.UTIF) {
      const script = document.createElement('script');
      script.src = "https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedBandId || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (document.activeElement.tagName === 'INPUT') return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const band = bands.find(b => b.id === selectedBandId);
      if (!band) return;
      let nx = band.x, ny = band.y;
      if (e.key === 'ArrowUp') ny -= step;
      if (e.key === 'ArrowDown') ny += step;
      if (e.key === 'ArrowLeft') nx -= step;
      if (e.key === 'ArrowRight') nx += step;
      updateBandProperty(selectedBandId, 'x', nx);
      updateBandProperty(selectedBandId, 'y', ny);
      setIsKeyboardMoving(true);
      renderMagnifier(nx + band.width/2, ny + band.height/2, { ...band, x: nx, y: ny });
      if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
      keyboardTimer.current = setTimeout(() => setIsKeyboardMoving(false), 800);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
    };
  }, [selectedBandId, bands, updateBandProperty, renderMagnifier]);

  useEffect(() => {
    if (!image || !canvasRef.current || !imgRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = Math.max(1, imgRef.current.width * totalScale);
    canvas.height = Math.max(1, imgRef.current.height * totalScale);
    ctx.save();
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.scale(totalScale, totalScale);
    ctx.drawImage(imgRef.current, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.scale(totalScale, totalScale);
    if (showAllBandsOnCanvas) {
      bands.forEach((band) => {
        const isSel = band.id === selectedBandId;
        const isRef = band.id === refBandId;
        const isBg = band.id === bgBandId;
        ctx.setLineDash(isBg ? [5, 5] : []);
        ctx.strokeStyle = isSel ? '#3b82f6' : (isBg ? '#f59e0b' : (isRef ? '#10b981' : 'rgba(148, 163, 184, 0.6)'));
        ctx.lineWidth = (isSel || isRef || isBg ? 3 : 1.5) / totalScale;
        ctx.strokeRect(band.x, band.y, band.width, band.height);
        ctx.fillStyle = isBg ? 'rgba(245, 158, 11, 0.1)' : (isRef ? 'rgba(16, 185, 129, 0.15)' : (isSel ? 'rgba(59, 130, 246, 0.1)' : 'rgba(148, 163, 184, 0.05)'));
        ctx.fillRect(band.x, band.y, band.width, band.height);
        if (isSel) {
          const hs = 8 / totalScale; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2563eb'; ctx.setLineDash([]);
          [[0,0], [band.width, 0], [0, band.height], [band.width, band.height]].forEach(([dx, dy]) => {
            ctx.fillRect(band.x+dx-hs/2, band.y+dy-hs/2, hs, hs);
            ctx.strokeRect(band.x+dx-hs/2, band.y+dy-hs/2, hs, hs);
          });
        }
      });
    }
    if (currentRect) {
      ctx.strokeStyle = '#3b82f6'; ctx.setLineDash([5/totalScale, 5/totalScale]);
      ctx.strokeRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height);
    }
    ctx.restore();
  }, [image, bands, currentRect, selectedBandId, refBandId, bgBandId, totalScale, showAllBandsOnCanvas, brightness, contrast]);

  // --- 3. 图像上传逻辑 ---

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const fn = file.name.toLowerCase();
      if (fn.match(/\.tiff?$/)) {
         try {
            const ifds = window.UTIF.decode(event.target.result);
            window.UTIF.decodeImage(event.target.result, ifds[0]);
            const rgba = window.UTIF.toRGBA8(ifds[0]);
            const tc = document.createElement('canvas');
            tc.width = ifds[0].width; tc.height = ifds[0].height;
            const ctx = tc.getContext('2d');
            const id = ctx.createImageData(tc.width, tc.height);
            id.data.set(rgba); ctx.putImageData(id, 0, 0);
            loadImageData(tc.toDataURL());
         } catch(err) {
            setIsProcessing(false); setMessage({type: 'error', text: 'TIFF 解码失败'});
         }
      } else {
        loadImageData(event.target.result);
      }
    };
    if (file.name.toLowerCase().match(/\.tiff?$/)) reader.readAsArrayBuffer(file);
    else reader.readAsDataURL(file);
  };

  const loadImageData = (dataURL) => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img; setImage(dataURL); setBands([]); setZoom(1); setBrightness(100); setContrast(100); setBgBandId(null); setRefBandId(null);
      const dw = canvasRef.current?.parentElement?.clientWidth || 800;
      setBaseScale(dw / img.width); setIsProcessing(false);
    };
    img.src = dataURL;
  };

  // --- 4. 鼠标交互处理器 ---

  const handleMouseDown = (e) => {
    if (!image) return;
    const pos = getImagePos(e);
    
    // 如果已有选中的框，且不是固定尺寸模式，先探测缩放手柄
    if (selectedBandId && !isFixedSize) {
      const band = bands.find(b => b.id === selectedBandId);
      // 优化点：缩小手柄判定范围，最大不超过宽高的 1/3，确保点击内部不会误触发
      const hLimit = Math.min(8 / totalScale, band.width / 3, band.height / 3);
      const hs = [
        { n: 'tl', x: band.x, y: band.y }, 
        { n: 'tr', x: band.x + band.width, y: band.y }, 
        { n: 'bl', x: band.x, y: band.y + band.height }, 
        { n: 'br', x: band.x + band.width, y: band.y + band.height }
      ];
      const hit = hs.find(h => Math.abs(pos.x - h.x) < hLimit && Math.abs(pos.y - h.y) < hLimit);
      if (hit) {
        setInteractionMode('resizing'); 
        setDragStart({ x: pos.x, y: pos.y, bandX: band.x, bandY: band.y, bandW: band.width, bandH: band.height, handle: hit.n });
        renderMagnifier(pos.x, pos.y, band); 
        return;
      }
    }

    const tBands = showAllBandsOnCanvas ? [...bands].reverse() : bands.filter(b => b.id === selectedBandId);
    const clickedBand = tBands.find(b => pos.x > b.x && pos.x < b.x + b.width && pos.y > b.y && pos.y < b.y + b.height);
    
    if (clickedBand) {
      // 点击选区内部：执行选中和移动
      setSelectedBandId(clickedBand.id); 
      setInteractionMode('moving');
      setDragStart({ x: pos.x, y: pos.y, bandX: clickedBand.x, bandY: clickedBand.y });
      renderMagnifier(pos.x, pos.y, clickedBand);
    } else {
      // 点击空白处：执行绘制
      setSelectedBandId(null); 
      setInteractionMode('drawing'); 
      setDragStart({ x: pos.x, y: pos.y });
      if (isFixedSize) {
        const nr = { x: pos.x - fixedWidth/2, y: pos.y - fixedHeight/2, width: fixedWidth, height: fixedHeight };
        setCurrentRect(nr); renderMagnifier(pos.x, pos.y, nr);
      } else {
        setCurrentRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
      }
    }
  };

  const handleMouseMove = (e) => {
    const pos = getImagePos(e);

    // 优化点：根据当前位置动态改变鼠标样式，增加交互预判
    if (canvasRef.current && !interactionMode) {
      const isOverBand = bands.some(b => pos.x > b.x && pos.x < b.x + b.width && pos.y > b.y && pos.y < b.y + b.height);
      
      let cursor = 'crosshair';
      if (selectedBandId && !isFixedSize) {
        const band = bands.find(b => b.id === selectedBandId);
        const hLimit = Math.min(8 / totalScale, band.width / 3, band.height / 3);
        const onTL = Math.abs(pos.x - band.x) < hLimit && Math.abs(pos.y - band.y) < hLimit;
        const onTR = Math.abs(pos.x - (band.x + band.width)) < hLimit && Math.abs(pos.y - band.y) < hLimit;
        const onBL = Math.abs(pos.x - band.x) < hLimit && Math.abs(pos.y - (band.y + band.height)) < hLimit;
        const onBR = Math.abs(pos.x - (band.x + band.width)) < hLimit && Math.abs(pos.y - (band.y + band.height)) < hLimit;
        
        if (onTL || onBR) cursor = 'nwse-resize';
        else if (onTR || onBL) cursor = 'nesw-resize';
        else if (isOverBand) cursor = 'move';
      } else if (isOverBand) {
        cursor = 'move';
      }
      canvasRef.current.style.cursor = cursor;
    }

    if (!interactionMode) return;

    if (interactionMode === 'drawing') {
      if (isFixedSize) {
        const nr = { x: pos.x - fixedWidth/2, y: pos.y - fixedHeight/2, width: fixedWidth, height: fixedHeight };
        setCurrentRect(nr); renderMagnifier(pos.x, pos.y, nr);
      } else {
        const nr = { x: Math.min(pos.x, dragStart.x), y: Math.min(pos.y, dragStart.y), width: Math.abs(pos.x - dragStart.x), height: Math.abs(pos.y - dragStart.y) };
        setCurrentRect(nr); renderMagnifier(pos.x, pos.y, nr);
      }
    } else if (interactionMode === 'moving') {
      const dx = pos.x - dragStart.x, dy = pos.y - dragStart.y;
      const ub = { ...bands.find(b => b.id === selectedBandId), x: dragStart.bandX + dx, y: dragStart.bandY + dy };
      setBands(bands.map(b => b.id === selectedBandId ? ub : b)); renderMagnifier(pos.x, pos.y, ub);
    } else if (interactionMode === 'resizing') {
      const dx = pos.x - dragStart.x, dy = pos.y - dragStart.y;
      let ub;
      setBands(bands.map(b => {
        if (b.id !== selectedBandId) return b;
        let { bandX: x, bandY: y, bandW: w, bandH: h, handle } = dragStart;
        if (handle === 'tl') { x += dx; y += dy; w -= dx; h -= dy; }
        else if (handle === 'tr') { y += dy; w += dx; h -= dy; }
        else if (handle === 'bl') { x += dx; w -= dx; h += dy; }
        else if (handle === 'br') { w += dx; h += dy; }
        ub = { ...b, x, y, width: Math.max(5, w), height: Math.max(5, h) }; return ub;
      }));
      renderMagnifier(pos.x, pos.y, ub);
    }
  };

  const handleMouseUp = () => {
    if (interactionMode === 'drawing' && currentRect && currentRect.width > 2) {
      const gray = calculateGrayscale(currentRect, imgRef.current);
      const newId = Date.now();
      setBands([...bands, { ...currentRect, id: newId, grayscale: gray, currentLoading: 20 }]);
      if (!refBandId) setRefBandId(newId);
      setSelectedBandId(newId);
    } else if (interactionMode === 'moving' || interactionMode === 'resizing') {
      setBands(bands.map(b => b.id === selectedBandId ? { ...b, grayscale: calculateGrayscale(b, imgRef.current) } : b));
    }
    setInteractionMode(null); setCurrentRect(null);
  };

  const getSuggestedLoading = (band) => {
    if (band.id === bgBandId) return "背景项";
    const curNet = getNetIntensity(band.grayscale);
    let targetNet = calculationMode === 'reference' ? getNetIntensity(bands.find(b => b.id === refBandId)?.grayscale || backgroundGray) : customTargetNetIntensity;
    if (curNet <= 0.5) return "信号极弱";
    const res = band.currentLoading * (targetNet / curNet);
    return isFinite(res) ? res.toFixed(2) : "0.00";
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8 font-sans text-slate-800 select-none">
      <div className="max-w-[1600px] mx-auto pb-6">
        <header className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-2xl shadow-xl shadow-indigo-200 text-white"><Layers size={32} /></div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                WB 蛋白定量助手
                <span className="bg-indigo-100 text-indigo-600 text-[10px] px-2 py-1 rounded-lg font-black uppercase">v9.5 Pro</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 font-mono italic">Scientific Precision Workflow</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
               <div className="flex items-center gap-3 group" onDoubleClick={() => setBrightness(100)} title="双击重置">
                  <Sun size={18} className="text-amber-500" />
                  <div className="flex flex-col">
                    <input type="range" min="50" max="300" value={brightness} onChange={e => setBrightness(e.target.value)} className="w-24 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                    <span className="text-[8px] font-bold text-slate-400 mt-1">亮度: {brightness}%</span>
                  </div>
               </div>
               <div className="w-px h-8 bg-slate-100 mx-1"></div>
               <div className="flex items-center gap-3 group" onDoubleClick={() => setContrast(100)} title="双击重置">
                  <Contrast size={18} className="text-indigo-500" />
                  <div className="flex flex-col">
                    <input type="range" min="50" max="300" value={contrast} onChange={e => setContrast(e.target.value)} className="w-24 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                    <span className="text-[8px] font-bold text-slate-400 mt-1">对比度: {contrast}%</span>
                  </div>
               </div>
            </div>
            <label className="bg-slate-900 hover:bg-black text-white px-6 py-2.5 rounded-2xl cursor-pointer flex items-center gap-2 transition-all shadow-md font-black text-sm">
              <Upload size={18} /> 上传图片
              <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*,.tif,.tiff" />
            </label>
            <button onClick={() => {setBands([]); setImage(null); setBgBandId(null); setSelectedBandId(null);}} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-colors shadow-sm"><RefreshCw size={18} className="text-slate-400"/></button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white rounded-[40px] shadow-2xl shadow-slate-200 border border-slate-200 overflow-hidden flex flex-col h-[750px] relative">
              <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 backdrop-blur-sm z-10 font-bold">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm font-sans text-slate-600">
                    <button onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} className="p-2 hover:bg-slate-100 rounded-xl"><ZoomOut size={18}/></button>
                    <span className="text-sm font-black w-14 text-center text-blue-600">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(Math.min(10, zoom + 0.25))} className="p-2 hover:bg-slate-100 rounded-xl"><ZoomIn size={18}/></button>
                  </div>
                  <button onClick={() => setShowAllBandsOnCanvas(!showAllBandsOnCanvas)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${showAllBandsOnCanvas ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-white border-slate-200 text-slate-400'}`}>
                    {showAllBandsOnCanvas ? <Eye size={14} /> : <EyeOff size={14} />} {showAllBandsOnCanvas ? '显示全部' : '隐藏其他'}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                   {selectedBandId && (
                     <button onClick={() => setBgBandId(selectedBandId)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${bgBandId === selectedBandId ? 'bg-amber-500 text-white shadow-amber-200' : 'bg-white border border-amber-200 text-amber-600 hover:bg-amber-50'}`}>
                        <Eraser size={14} /> 设为背景扣除选区
                     </button>
                   )}
                </div>
              </div>
              
              <div className="flex-1 overflow-auto bg-[#f8fafc] p-12 flex items-center justify-center relative custom-scrollbar shadow-inner">
                {(interactionMode || isKeyboardMoving) && (
                  <div className="absolute top-6 left-6 z-20 animate-in zoom-in-95 duration-200 pointer-events-none">
                    <div className="bg-slate-900 p-1.5 rounded-2xl shadow-2xl border-4 border-white/20 overflow-hidden">
                      <canvas ref={magnifierRef} className="bg-black" />
                      <div className="flex items-center justify-center gap-2 text-[9px] text-white font-black uppercase py-1 tracking-widest bg-blue-600">
                          校准视野 (2x)
                      </div>
                    </div>
                  </div>
                )}
                {!image ? (
                  <div className="flex flex-col items-center text-slate-300">
                    <div className="bg-white p-12 rounded-[56px] shadow-sm mb-8 animate-pulse"><Crosshair size={80} className="opacity-10"/></div>
                    <p className="text-xl font-black text-slate-400 tracking-tight text-center uppercase leading-relaxed font-sans">上传图像并框选条带</p>
                  </div>
                ) : (
                  <div className="relative shadow-2xl bg-white leading-[0] rounded-sm border-[12px] border-white ring-1 ring-slate-100">
                    <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} className="cursor-crosshair block" />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-8 rounded-[40px] shadow-xl border border-slate-200 relative overflow-hidden">
               <div className="flex gap-8 relative z-10 items-start">
                  <div className="space-y-6 flex-1">
                    <div className="flex gap-4 items-center border-b border-slate-50 pb-4">
                      <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600"><Command size={20}/></div>
                      <h3 className="font-black text-slate-900 uppercase tracking-widest text-sm">操作指南与快捷键</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-4">
                          <h4 className="text-[11px] font-black text-indigo-500 uppercase flex items-center gap-2 tracking-normal"><MousePointer2 size={14}/> 鼠标交互</h4>
                          <ul className="text-xs text-slate-500 space-y-2 font-medium">
                             <li>• <b>框选条带</b>：直接在图中拖拽。空白处点击自动新建。</li>
                             <li>• <b>编辑模式</b>：点击已有选区边框即可选中移动或缩放。</li>
                             <li>• <b>背景扣除</b>：先画一个空白区，点击顶部【设为背景】。</li>
                          </ul>
                       </div>
                       <div className="space-y-4">
                          <h4 className="text-[11px] font-black text-indigo-500 uppercase flex items-center gap-2 tracking-normal"><Keyboard size={14}/> 键盘微调</h4>
                          <ul className="text-xs text-slate-500 space-y-2 font-medium">
                             <li>• <b>方向键</b>：以 1 像素为单位微调选中框的位置。</li>
                             <li>• <b>Shift + 方向键</b>：以 10 像素为单位快速移动。</li>
                             <li>• <b>双击滑块</b>：瞬间重置亮度或对比度参数。</li>
                          </ul>
                       </div>
                    </div>
                  </div>
               </div>
            </div>
          </div>

          <div className="lg:col-span-4 h-fit sticky top-8">
            <div className="bg-white rounded-[40px] shadow-2xl shadow-slate-200 border border-slate-200 flex flex-col max-h-[calc(100vh-100px)] overflow-hidden font-sans">
              <div className="px-8 py-7 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 backdrop-blur-md">
                <h2 className="font-black text-slate-800 text-lg uppercase tracking-tight">定量分析数据</h2>
                <div className="flex items-center gap-2">
                   <label className="flex items-center gap-2 cursor-pointer bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-200 transition-colors">
                      <input type="checkbox" checked={isFixedSize} onChange={e => setIsFixedSize(e.target.checked)} className="rounded text-blue-600" />
                      <span className="text-[10px] font-black uppercase text-slate-500">固定尺寸</span>
                   </label>
                   <span className="bg-blue-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-black">{bands.length}</span>
                </div>
              </div>

              {isFixedSize && (
                <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-4 animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-slate-400 uppercase">宽度</span>
                    <input 
                      type="number" 
                      value={fixedWidth} 
                      onChange={e => setFixedWidth(Math.max(5, parseInt(e.target.value) || 0))}
                      className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-100" 
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-slate-400 uppercase">高度</span>
                    <input 
                      type="number" 
                      value={fixedHeight} 
                      onChange={e => setFixedHeight(Math.max(5, parseInt(e.target.value) || 0))}
                      className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-100" 
                    />
                  </div>
                </div>
              )}

              {calculationMode === 'custom' && bands.length > 0 && (
                <div className="px-8 py-5 bg-indigo-50 border-b border-indigo-100 animate-in slide-in-from-top-2">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-black text-indigo-900 uppercase">目标净强度设定</span>
                    <span className="text-sm font-mono font-black text-indigo-600 bg-white px-2 py-1 rounded-lg border border-indigo-200 shadow-sm">{customTargetNetIntensity}</span>
                  </div>
                  <input type="range" min="5" max="250" value={customTargetNetIntensity} onChange={e => setCustomTargetNetIntensity(parseInt(e.target.value))} className="w-full h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                </div>
              )}
              
              <div className="overflow-y-auto p-6 space-y-4 custom-scrollbar flex-1 bg-white">
                {bands.length === 0 ? (
                  <div className="py-24 text-center space-y-6 opacity-30 font-sans">
                    <Plus size={64} className="mx-auto" />
                    <p className="text-xs font-black uppercase tracking-widest leading-loose">请在图中框选样品</p>
                  </div>
                ) : (
                  bands.map((band, i) => {
                    const isRef = band.id === refBandId;
                    const isSel = band.id === selectedBandId;
                    const isBg = band.id === bgBandId;
                    return (
                      <div key={band.id} onClick={() => setSelectedBandId(band.id)} className={`p-5 rounded-[32px] border transition-all cursor-pointer group relative ${isSel ? 'border-blue-500 ring-[8px] ring-blue-50 bg-white shadow-xl -translate-y-1' : (isBg ? 'bg-amber-50/50 border-amber-200' : (isRef ? 'bg-emerald-50/40 border-emerald-100' : 'bg-slate-50/50 border-slate-100 hover:border-slate-300'))}`}>
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <span className={`w-9 h-9 rounded-2xl flex items-center justify-center text-xs font-black shadow-sm ${isBg ? 'bg-amber-500 text-white' : (isRef ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white')}`}>{i+1}</span>
                            <div>
                              <span className="text-[10px] font-black text-slate-400 uppercase leading-none block">{isBg ? '背景参考 (BG)' : (isRef ? '基准样品 (REF)' : '目标条带')}</span>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm font-mono font-bold text-indigo-600 block">净强度: {getNetIntensity(band.grayscale).toFixed(1)}</span>
                                <span className="text-[9px] text-slate-300 font-mono opacity-50">(原灰: {band.grayscale.toFixed(0)})</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all scale-95">
                            {!isRef && !isBg && (
                              <button onClick={(e) => {e.stopPropagation(); setRefBandId(band.id);}} className="text-[9px] bg-emerald-100 text-emerald-700 px-3 py-2 rounded-xl font-black hover:bg-emerald-500 hover:text-white transition-all uppercase">设为基准</button>
                            )}
                            <button onClick={(e) => {e.stopPropagation(); setBands(bands.filter(b => b.id !== band.id)); if(isSel) setSelectedBandId(null);}} className="text-slate-300 hover:text-rose-500 p-2 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={16}/></button>
                          </div>
                        </div>
                        {isSel && (
                          <div className="mb-4 p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex flex-col gap-2 shadow-inner">
                             <div className="grid grid-cols-4 gap-2 text-center">
                                {['x', 'y', 'width', 'height'].map(k => (
                                  <div key={k} className="space-y-1">
                                     <label className="text-[8px] font-bold text-slate-400 block uppercase italic">{k === 'width' ? '宽' : k === 'height' ? '高' : k}</label>
                                     <input type="number" value={Math.round(band[k])} onChange={e => updateBandProperty(band.id, k, e.target.value)} className="w-full bg-white border-none rounded-lg px-1 py-1 text-[10px] font-mono font-bold shadow-sm outline-none text-center" />
                                  </div>
                                ))}
                             </div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase ml-1 tracking-tight">本次上样 (μL)</label>
                            <input type="number" value={band.currentLoading} onClick={e => e.stopPropagation()} onChange={e => setBands(bands.map(b => b.id === band.id ? {...b, currentLoading: parseFloat(e.target.value)||0} : b))} className="w-full text-sm font-mono font-bold bg-white border border-slate-200 rounded-2xl px-4 py-2.5 focus:ring-4 focus:ring-blue-50 outline-none transition-all" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-blue-500 uppercase ml-1 tracking-tight">建议下回 (μL)</label>
                            <div className="bg-blue-600 text-white rounded-2xl px-4 py-2.5 text-sm font-mono font-black text-center shadow-lg shadow-blue-100 flex items-center justify-center gap-1">
                              {getSuggestedLoading(band)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              
              {bands.length > 0 && (
                <div className="p-8 border-t border-slate-100 bg-slate-50/50 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                       <button onClick={() => setCalculationMode('reference')} className={`py-4 rounded-2xl text-[11px] font-black uppercase transition-all shadow-sm ${calculationMode === 'reference' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>基准模式</button>
                       <button onClick={() => setCalculationMode('custom')} className={`py-4 rounded-2xl text-[11px] font-black uppercase transition-all shadow-sm ${calculationMode === 'custom' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>定值模式</button>
                    </div>
                    <button onClick={syncAllSizes} className="w-full bg-emerald-600 text-white py-3.5 rounded-2xl font-black flex items-center justify-center gap-3 text-xs hover:bg-emerald-700 transition-all uppercase tracking-widest shadow-lg shadow-emerald-100 active:scale-95 group">
                      <Maximize2 size={16} className="group-hover:rotate-90 transition-transform" /> 选区面积一键同步
                    </button>
                    <button onClick={() => {
                      const ch = "样品序号,净强度(扣背景),本次上样(微升),计算目标,建议下次上样(微升)\n";
                      const tv = calculationMode === 'reference' ? getNetIntensity(bands.find(b => b.id === refBandId)?.grayscale || backgroundGray) : customTargetNetIntensity;
                      const rows = bands.map((b,i)=>`${i+1},${getNetIntensity(b.grayscale).toFixed(2)},${b.currentLoading},${tv.toFixed(2)},${getSuggestedLoading(b)}`).join("\n"); 
                      const blob = new Blob(["\ufeff" + ch + rows], { type: 'text/csv;charset=utf-8;' });
                      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `WB定量报告_${new Date().toLocaleDateString()}.csv`; link.click();
                    }} className="w-full bg-slate-900 text-white py-5 rounded-[28px] font-black flex items-center justify-center gap-3 text-xs hover:bg-black transition-all shadow-xl shadow-slate-300 uppercase tracking-widest active:scale-95 group">
                      <Download size={20} className="group-hover:translate-y-0.5 transition-transform" /> 导出实验定量报告
                    </button>
                </div>
              )}
            </div>
            <footer className="mt-6 mb-8 text-center text-slate-400 text-[10px] uppercase tracking-[0.4em] font-bold animate-pulse">
              All Rights Reserved by zhangshuang
            </footer>
          </div>
        </div>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; } 
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0; }
        canvas { image-rendering: pixelated; }
      `}</style>
    </div>
  );
};

export default App;