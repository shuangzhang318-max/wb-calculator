import React from 'react';

const cardClass = 'rounded-[18px] border border-slate-200 bg-white p-3 shadow-inner';
const labelClass = 'text-[10px] font-black uppercase tracking-widest text-slate-400';

const QuantPanel = ({
  calculationMode,
  onCalculationModeChange,
  signalPolarity,
  onSignalPolarityChange,
  hasNonPositiveSignal,
  imageQuantData,
  customTargetNetIntensity,
  onCustomTargetNetIntensityChange,
  isFixedSize,
  onFixedSizeChange,
  fixedWidthStr,
  fixedHeightStr,
  onFixedWidthChange,
  onFixedHeightChange,
  bgBandId,
  refBandId,
}) => (
  <>
    <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
      <h2 className="text-base font-black uppercase tracking-tight text-slate-800">定量控制</h2>
      <p className="mt-0.5 text-[10px] font-bold text-slate-400">全局参数</p>
    </div>

    <div className="space-y-2.5 border-b border-slate-200 bg-slate-50/40 px-5 py-3">
      <div className="grid gap-2.5 xl:grid-cols-[1.05fr_1fr_0.92fr]">
        <div className={cardClass}>
          <div className={labelClass}>计算模式</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => onCalculationModeChange('reference')}
              className={`rounded-xl py-2 text-[10px] font-black uppercase transition-all ${calculationMode === 'reference' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-500'}`}
            >
              基准
            </button>
            <button
              onClick={() => onCalculationModeChange('custom')}
              className={`rounded-xl py-2 text-[10px] font-black uppercase transition-all ${calculationMode === 'custom' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-500'}`}
            >
              定值
            </button>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <span className={labelClass}>信号极性</span>
            <span className="text-[10px] font-black text-indigo-600">{signalPolarity === 'dark-on-light' ? '暗带' : '亮带'}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => onSignalPolarityChange('dark-on-light')}
              className={`rounded-xl py-2 text-[10px] font-black uppercase transition-all ${signalPolarity === 'dark-on-light' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-500'}`}
            >
              暗带
            </button>
            <button
              onClick={() => onSignalPolarityChange('light-on-dark')}
              className={`rounded-xl py-2 text-[10px] font-black uppercase transition-all ${signalPolarity === 'light-on-dark' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-500'}`}
            >
              亮带
            </button>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <label className="flex min-w-0 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={isFixedSize}
                onChange={(e) => onFixedSizeChange(e.target.checked)}
                className="h-4 w-4 rounded text-indigo-600 focus:ring-0 shadow-inner"
              />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">固定尺寸</span>
            </label>
            <span className="text-[10px] font-black text-slate-400">px</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="text"
              value={fixedWidthStr}
              onChange={(e) => onFixedWidthChange(e.target.value)}
              disabled={!isFixedSize}
              placeholder="宽"
              className={`w-full rounded-xl border p-2 text-center text-[11px] font-black shadow-inner outline-none ${isFixedSize ? 'border-slate-200 bg-white focus:border-indigo-500' : 'border-slate-200 bg-slate-100 text-slate-400'}`}
            />
            <input
              type="text"
              value={fixedHeightStr}
              onChange={(e) => onFixedHeightChange(e.target.value)}
              disabled={!isFixedSize}
              placeholder="高"
              className={`w-full rounded-xl border p-2 text-center text-[11px] font-black shadow-inner outline-none ${isFixedSize ? 'border-slate-200 bg-white focus:border-indigo-500' : 'border-slate-200 bg-slate-100 text-slate-400'}`}
            />
          </div>
        </div>
      </div>

      {calculationMode === 'custom' && (
        <div className={`${cardClass} px-3 py-2.5`}>
          <div className="flex items-center justify-between gap-3 px-0.5">
            <span className={labelClass}>Target IntDen</span>
            <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-[11px] font-mono font-black text-indigo-600">{customTargetNetIntensity}</span>
          </div>
          <input
            type="range"
            min="1000"
            max="1000000"
            step="1000"
            value={customTargetNetIntensity}
            onChange={(e) => onCustomTargetNetIntensityChange(parseInt(e.target.value, 10))}
            className="wb-slider mt-1.5 w-full"
          />
        </div>
      )}

      {(hasNonPositiveSignal || imageQuantData?.kind === 'tiff-raw' || !bgBandId || (calculationMode === 'reference' && !refBandId)) && (
        <div className="space-y-1.5">
          {hasNonPositiveSignal && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
              部分 ROI 净强度 ≤ 0，请检查背景或极性。
            </div>
          )}
          {imageQuantData?.kind === 'tiff-raw' && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
              TIFF 原始定量已启用（{imageQuantData.bitDepth}-bit）。
            </div>
          )}
          {(!bgBandId || (calculationMode === 'reference' && !refBandId)) && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-500">
              {!bgBandId ? '请先指定背景区域；' : ''}
              {calculationMode === 'reference' && !refBandId ? '参考模式下还需要指定基准样品。' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  </>
);

export default QuantPanel;
