import React from 'react';
import { Trash2 } from 'lucide-react';

const saturationToneClasses = {
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
};

const BandCard = ({
  band,
  index,
  isSelected,
  isBackground,
  isReference,
  netIntensity,
  bandWarning,
  bandLabel,
  saturationMetrics,
  saturationRisk,
  suggestedLoading,
  defaultBandLabel,
  onSelect,
  onSetReference,
  onRemove,
  onNameChange,
  onLoadingChange,
}) => (
  <div
    onClick={onSelect}
    className={`p-6 rounded-[36px] border-2 transition-all cursor-pointer relative shadow-sm hover:shadow-md ${isSelected ? 'border-blue-500 ring-8 ring-blue-50 bg-white' : (isBackground ? 'bg-amber-50/60 border-amber-200' : (isReference ? 'bg-emerald-50/60 border-emerald-100' : 'bg-slate-50/50 border-slate-100'))}`}
  >
    <div className="flex justify-between items-start mb-5">
      <div className="flex items-center gap-4">
        <span className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black shadow-sm ${isBackground ? 'bg-amber-500 text-white' : (isReference ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white')}`}>{index + 1}</span>
        <div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBackground ? '背景区域' : (isReference ? '基准样品' : '实验样品')}</span>
          <span className="text-base font-black block text-slate-900 mt-1">{bandLabel}</span>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`text-lg font-mono font-black block ${netIntensity <= 0 && !isBackground ? 'text-amber-600' : 'text-slate-900'}`}>净强度: {netIntensity.toFixed(0)}</span>
            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${saturationToneClasses[saturationRisk.tone]}`}>{saturationRisk.level}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onSetReference();
          }}
          className={`text-[11px] font-black px-5 py-2.5 rounded-xl border transition-all shadow-sm ${isReference ? 'bg-emerald-500 text-white border-emerald-500' : 'text-emerald-600 bg-emerald-50 border-emerald-100 hover:bg-emerald-500 hover:text-white'}`}
        >
          {isReference ? '取消基准' : '设为基准'}
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="text-rose-400 hover:bg-rose-50 p-2 rounded-xl transition-all"
        >
          <Trash2 size={22} />
        </button>
      </div>
    </div>

    {bandWarning && <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">{bandWarning}</div>}

    <div className="mb-5 grid grid-cols-2 gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">饱和像素</div>
        <div className="mt-2 text-sm font-mono font-black text-slate-900">{saturationMetrics.saturatedPixels}</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">饱和比例</div>
        <div className="mt-2 text-sm font-mono font-black text-slate-900">{saturationMetrics.percentage.toFixed(2)}%</div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-8">
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">样品名称</label>
        <input
          type="text"
          value={isBackground ? '背景' : (band.name || '')}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={defaultBandLabel}
          disabled={isBackground}
          className={`w-full text-base font-black bg-white border-2 rounded-2xl px-5 py-4 outline-none transition-colors shadow-inner ${isBackground ? 'border-amber-200 bg-amber-50 text-amber-700 cursor-not-allowed' : 'border-slate-100 focus:border-indigo-500'}`}
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">本次上样 (微升)</label>
        <input
          type="text"
          value={band.currentLoading}
          onChange={(event) => onLoadingChange(event.target.value)}
          className="w-full text-lg font-mono font-black bg-white border-2 border-slate-100 rounded-2xl px-5 py-4 outline-none focus:border-indigo-500 transition-colors shadow-inner"
        />
      </div>
    </div>

    <div className="mt-8 space-y-2">
      <label className="text-[10px] font-black text-blue-500 uppercase ml-1 tracking-wider">建议下回(微升)</label>
      <div className={`rounded-2xl px-5 py-4 text-lg font-mono font-black text-center shadow-lg border-2 ${bandWarning ? 'bg-amber-500 text-white border-amber-400 shadow-amber-100' : 'bg-blue-600 text-white border-blue-400 shadow-blue-100'}`}>
        {suggestedLoading}
      </div>
    </div>
  </div>
);

export default BandCard;
