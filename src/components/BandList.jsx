import React, { useMemo } from 'react';
import { Download, Eraser, Maximize2, Target } from 'lucide-react';
import { getBandWarning, getSaturationRisk } from '../lib/saturation';
import RoiDetailPanel from './RoiDetailPanel';

const roleBadgeClasses = {
  background: 'bg-amber-100 text-amber-700 border-amber-200',
  reference: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  sample: 'bg-slate-100 text-slate-600 border-slate-200',
};

const riskBadgeClasses = {
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
};

const actionButtonClass = 'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-black uppercase transition-all';

const BandList = ({
  bands,
  selectedBandId,
  bgBandId,
  refBandId,
  calculationMode,
  signalPolarity,
  getNetIntensity,
  getBandLabel,
  getDefaultBandLabel,
  getSuggestedLoading,
  onSelectBand,
  onSetReference,
  onToggleBackground,
  onRemoveBand,
  onNameChange,
  onLoadingChange,
  onSyncBandSize,
  onExport,
}) => {
  const selectedBandIndex = useMemo(
    () => bands.findIndex((band) => band.id === selectedBandId),
    [bands, selectedBandId],
  );
  const selectedBand = selectedBandIndex >= 0 ? bands[selectedBandIndex] : null;
  const selectedIsBackground = selectedBand?.id === bgBandId;
  const selectedIsReference = selectedBand?.id === refBandId;

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] bg-white">
      <div className="border-b border-slate-200 px-4 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">ROI 列表</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-slate-800">{bands.length} 个选区</span>
              {selectedBand && (
                <>
                  <button
                    onClick={() => onToggleBackground(selectedBand.id)}
                    className={`${actionButtonClass} ${selectedIsBackground ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:text-amber-700'}`}
                  >
                    <Eraser size={12} /> {selectedIsBackground ? '取消背景' : '设为背景'}
                  </button>
                  {!selectedIsBackground && (
                    <button
                      onClick={() => onSetReference(selectedBand.id)}
                      className={`${actionButtonClass} ${selectedIsReference ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700'}`}
                    >
                      <Target size={12} /> {selectedIsReference ? '取消基准' : '设为基准'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSyncBandSize}
              className="flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-black uppercase text-indigo-700 transition-all hover:bg-indigo-100"
            >
              <Maximize2 size={14} /> 同步面积
            </button>
            <button
              onClick={onExport}
              className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-3 py-2 text-[11px] font-black uppercase text-white transition-all hover:bg-indigo-700"
            >
              <Download size={14} /> 导出
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-2 bg-slate-50/50 px-3 pb-3 pt-2.5 xl:grid-cols-[minmax(0,1fr)_186px]">
        <div className="min-h-0 overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-2.5 custom-scrollbar">
          {bands.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-slate-200 bg-white px-5 py-12 text-center text-xs font-black uppercase tracking-[0.25em] text-slate-300">
              No Protein Detected
              <br />
              Select Bands to Start Quantification
            </div>
          ) : (
            <div className="space-y-2">
              {bands.map((band, index) => {
                const netIntensity = getNetIntensity(band);
                const suggestedLoading = getSuggestedLoading(band);
                const saturationRisk = getSaturationRisk(band);
                const isSelected = band.id === selectedBandId;
                const isBackground = band.id === bgBandId;
                const isReference = band.id === refBandId;
                const roleKey = isBackground ? 'background' : (isReference ? 'reference' : 'sample');
                const bandWarning = getBandWarning({
                  band,
                  bgBandId,
                  refBandId,
                  calculationMode,
                  signalPolarity,
                  netIntensity,
                });

                return (
                  <div
                    key={band.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectBand(band.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectBand(band.id);
                      }
                    }}
                    className={`rounded-[20px] border px-3 py-2.5 text-left transition-all ${isSelected ? 'border-indigo-300 bg-indigo-50/50 shadow-[0_6px_20px_rgba(79,70,229,0.08)]' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${roleBadgeClasses[roleKey]}`}>
                        {isBackground ? '背景' : (isReference ? '基准' : `样品 ${index + 1}`)}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${riskBadgeClasses[saturationRisk.tone]}`}>
                        {saturationRisk.level}
                      </span>
                      {bandWarning && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">需检查</span>}
                      <span className="ml-auto text-[10px] font-black text-slate-300">ROI {index + 1}</span>
                    </div>

                    <div className="mt-2.5 grid grid-cols-[minmax(118px,132px)_92px] gap-2 items-end">
                      <label className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">名称</div>
                        <input
                          type="text"
                          value={isBackground ? '背景' : (band.name || '')}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => onNameChange(band.id, event.target.value)}
                          placeholder={getDefaultBandLabel(band, index)}
                          disabled={isBackground}
                          className={`mt-1 w-full rounded-xl border px-2 py-1.5 text-sm font-black outline-none transition-colors ${isBackground ? 'border-amber-200 bg-amber-50 text-amber-700 cursor-not-allowed' : 'border-slate-200 bg-white focus:border-indigo-500'}`}
                        />
                      </label>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">强度</div>
                        <div className={`mt-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-sm font-mono font-black ${netIntensity <= 0 && !isBackground ? 'text-amber-600' : 'text-slate-900'}`}>
                          {netIntensity.toFixed(0)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-[84px_112px] gap-2 items-end justify-start">
                      <label>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">上样 uL</div>
                        <input
                          type="text"
                          value={isBackground ? '' : band.currentLoading}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => onLoadingChange(band.id, event.target.value)}
                          disabled={isBackground}
                          placeholder="--"
                          className={`mt-1 w-full rounded-xl border px-2 py-1.5 text-sm font-mono font-black outline-none transition-colors ${isBackground ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed' : 'border-slate-200 bg-white focus:border-indigo-500'}`}
                        />
                      </label>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">建议下次</div>
                        <div className={`mt-1 rounded-xl border px-2 py-1.5 text-center text-sm font-mono font-black ${bandWarning ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}>
                          {suggestedLoading}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="min-h-0 rounded-[20px] border border-slate-200 bg-white p-1.5 shadow-sm">
          {selectedBand ? (
            <RoiDetailPanel
              band={selectedBand}
              index={selectedBandIndex >= 0 ? selectedBandIndex : 0}
              bgBandId={bgBandId}
              refBandId={refBandId}
              calculationMode={calculationMode}
              signalPolarity={signalPolarity}
              getBandLabel={getBandLabel}
              getNetIntensity={getNetIntensity}
              onRemove={onRemoveBand}
            />
          ) : (
            <div className="flex h-full min-h-[180px] items-center justify-center rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-bold text-slate-400">
              点击左侧 ROI 查看详情。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BandList;
