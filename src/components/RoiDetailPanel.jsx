import React from 'react';
import { Info, Trash2 } from 'lucide-react';
import { getBandWarning, getSaturationMetrics, getSaturationRisk } from '../lib/saturation';

const toneClasses = {
  slate: 'border-slate-200 bg-slate-100 text-slate-600',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
};

const itemClass = 'rounded-xl border border-slate-200 bg-white px-2.5 py-2';

const RoiDetailPanel = ({
  band,
  index,
  bgBandId,
  refBandId,
  calculationMode,
  signalPolarity,
  getBandLabel,
  getNetIntensity,
  onRemove,
  t,
}) => {
  if (!band) return null;

  const netIntensity = getNetIntensity(band);
  const saturationMetrics = getSaturationMetrics(band);
  const saturationRisk = getSaturationRisk(band);
  const bandWarning = getBandWarning({
    band,
    bgBandId,
    refBandId,
    calculationMode,
    signalPolarity,
    netIntensity,
  });
  const isBackground = band.id === bgBandId;
  const isReference = band.id === refBandId;
  const roleLabel = isBackground ? t.background : (isReference ? t.referenceRole : t.sample(index + 1));

  return (
    <div className="flex h-full flex-col rounded-[18px] border border-slate-200 bg-slate-50/70 p-2.5">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t.roiDetails}</div>
        <div className="mt-1.5 truncate text-sm font-black text-slate-900">{getBandLabel(band, index)}</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{roleLabel}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${toneClasses[saturationRisk.tone]}`}>{t.risk(saturationRisk.level)}</span>
        </div>
      </div>

      <div className="mt-2.5 space-y-1.5">
        <div className={itemClass}>
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t.intensity}</div>
          <div className={`mt-0.5 text-[13px] font-mono font-black ${netIntensity <= 0 && !isBackground ? 'text-amber-600' : 'text-slate-900'}`}>{netIntensity.toFixed(0)}</div>
        </div>
        <div className={itemClass}>
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t.saturationRatio}</div>
          <div className="mt-0.5 text-[13px] font-mono font-black text-slate-900">{saturationMetrics.percentage.toFixed(2)}%</div>
        </div>
        <div className={itemClass}>
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t.saturatedPixels}</div>
          <div className="mt-0.5 text-[13px] font-mono font-black text-slate-900">{saturationMetrics.saturatedPixels}</div>
        </div>
        <div className={itemClass}>
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t.status}</div>
          <div className="mt-0.5 text-[12px] font-black text-slate-900 break-words">{t.risk(saturationRisk.level)}</div>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        {bandWarning && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] font-bold text-amber-700">
            {t.warning(bandWarning)}
          </div>
        )}
        {saturationMetrics.percentage > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[10px] leading-4 text-slate-500">
            <Info size={12} className="mt-0.5 shrink-0 text-indigo-500" />
            <span>{t.saturationNote}</span>
          </div>
        )}
      </div>

      <div className="mt-auto pt-2">
        <button
          onClick={() => onRemove(band.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase text-rose-600 transition-all hover:bg-rose-50"
        >
          <Trash2 size={13} /> {t.delete}
        </button>
      </div>
    </div>
  );
};

export default RoiDetailPanel;
