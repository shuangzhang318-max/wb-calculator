import React from 'react';
import { BookOpen, Contrast, Crosshair, RefreshCw, Sun, Upload, ZoomIn, ZoomOut } from 'lucide-react';

const toolbarButtonClass = 'flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black transition-all';

const ImageCanvas = ({
  zoom,
  onZoomOut,
  onZoomIn,
  brightness,
  onBrightnessChange,
  onBrightnessReset,
  contrast,
  onContrastChange,
  onContrastReset,
  interactionMode,
  isKeyboardMoving,
  image,
  magnifierRef,
  canvasRef,
  canvasShellRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  isProcessing,
  onUploadImage,
  onResetWorkspace,
  selectedBandId,
  showMagnifier,
}) => (
  <div ref={canvasShellRef} className="relative flex h-[calc(100vh-12rem)] min-h-[560px] max-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-[40px] border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
    <div className="z-10 flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-5 py-3 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <button onClick={onZoomOut} className="rounded-xl p-2 transition-all hover:bg-slate-50"><ZoomOut size={17} /></button>
          <span className="w-12 text-center text-sm font-black text-indigo-600">{Math.round(zoom * 100)}%</span>
          <button onClick={onZoomIn} className="rounded-xl p-2 transition-all hover:bg-slate-50"><ZoomIn size={17} /></button>
        </div>

        <div className="flex items-center gap-4">
          <div className="group flex items-center gap-2.5" onDoubleClick={onBrightnessReset}>
            <Sun size={18} className="text-amber-500" />
            <input
              type="range"
              min="50"
              max="300"
              value={brightness}
              onChange={(event) => onBrightnessChange(parseInt(event.target.value, 10))}
              className="wb-slider w-24"
            />
          </div>
          <div className="group flex items-center gap-2.5" onDoubleClick={onContrastReset}>
            <Contrast size={18} className="text-indigo-500" />
            <input
              type="range"
              min="50"
              max="300"
              value={contrast}
              onChange={(event) => onContrastChange(parseInt(event.target.value, 10))}
              className="wb-slider w-24"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-[11px] font-black text-white shadow-lg shadow-indigo-100 transition-all hover:bg-indigo-700">
          <Upload size={15} />
          {isProcessing ? '处理中...' : '上传图像'}
          <input type="file" className="hidden" onChange={onUploadImage} accept="image/*,.tif,.tiff" />
        </label>

        <button
          onClick={onResetWorkspace}
          className={`${toolbarButtonClass} px-3.5 text-slate-600 hover:border-indigo-200 hover:text-indigo-600`}
        >
          <RefreshCw size={15} /> 重置
        </button>
      </div>

      <a
        href="/operation-guide.html"
        target="_blank"
        rel="noreferrer"
        className={`${toolbarButtonClass} text-slate-600 hover:border-indigo-200 hover:text-indigo-600`}
      >
        <BookOpen size={15} /> 操作指南
      </a>
    </div>

    <div className="relative flex flex-1 items-center justify-center overflow-auto bg-[#f8fafc] p-10 shadow-inner">
      {showMagnifier && (
        <div className="absolute left-8 top-8 z-20 pointer-events-none animate-in zoom-in-95">
          <div className="rounded-[32px] border-4 border-white/20 bg-slate-900 p-1.5 shadow-2xl">
            <canvas ref={magnifierRef} />
          </div>
        </div>
      )}

      {!image ? (
        <div className="flex flex-col items-center text-slate-300 opacity-40">
          <Crosshair size={80} className="mb-6" />
          <p className="text-sm font-black uppercase tracking-[0.4em]">Integrated Density Analysis</p>
        </div>
      ) : (
        <div className="relative border-[16px] border-white shadow-2xl ring-1 ring-slate-200">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            className="block cursor-crosshair touch-none"
          />
        </div>
      )}
    </div>
  </div>
);

export default ImageCanvas;
