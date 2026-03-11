export const getSaturationMetrics = (band) => {
  const saturatedPixels = band?.saturatedPixels || 0;
  const area = Math.max(1, band?.area || 0);
  const ratio = saturatedPixels / area;
  return {
    saturatedPixels,
    ratio,
    percentage: ratio * 100,
  };
};

export const getSaturationRisk = (band) => {
  const { ratio } = getSaturationMetrics(band);
  if (ratio >= 0.05) return { level: '不建议严格定量', tone: 'rose' };
  if (ratio >= 0.01) return { level: '需谨慎', tone: 'amber' };
  if (ratio > 0) return { level: '可接受', tone: 'emerald' };
  return { level: '无风险', tone: 'slate' };
};

export const getBandWarning = ({ band, bgBandId, refBandId, calculationMode, signalPolarity, netIntensity }) => {
  if (!band || band.id === bgBandId) return null;
  if (!bgBandId) return '请先设置背景区域';
  if (netIntensity <= 0) {
    return signalPolarity === 'dark-on-light'
      ? '净强度≤0，请检查背景或切换到亮带模式'
      : '净强度≤0，请检查背景或切换到暗带模式';
  }
  const saturationRisk = getSaturationRisk(band);
  if (saturationRisk.level === '不建议严格定量') return '信号端饱和比例过高，当前 ROI 不建议做严格定量';
  if (saturationRisk.level === '需谨慎') return '信号端存在明显饱和，结果需要谨慎解读';
  if (calculationMode === 'reference' && !refBandId) return '参考模式下请先指定基准样品';
  return null;
};
