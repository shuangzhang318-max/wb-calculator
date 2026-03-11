import { getSaturationMetrics, getSaturationRisk } from './saturation';

export const getReportFileName = (imageFileName) => {
  const fallbackName = 'WB_Quant_Report';
  const baseName = String(imageFileName || '').trim().replace(/\.[^.]+$/, '');
  return `${baseName || fallbackName}_WB_Quant_Report.csv`;
};

export const buildReportCsv = ({
  bands,
  bgBandId,
  refBandId,
  signalPolarity,
  imageQuantData,
  getBandLabel,
  getNetIntensity,
  getSuggestedLoading
}) => {
  const csvRows = bands.map((band, index) => {
    const role = band.id === bgBandId ? '背景' : (band.id === refBandId ? '基准' : '样品');
    const label = getBandLabel(band, index);
    const saturationMetrics = getSaturationMetrics(band);
    const saturationRisk = getSaturationRisk(band);
    return `${index + 1},${label},${role},${getNetIntensity(band).toFixed(0)},${band.currentLoading},${getSuggestedLoading(band)},${signalPolarity},${saturationMetrics.saturatedPixels},${saturationMetrics.percentage.toFixed(2)}%,${saturationRisk.level},${imageQuantData?.bitDepth || 8}`;
  });

  return '序号,编号,角色,净强度(IntDen),上样量(uL),建议下回(uL),极性模式,饱和像素数,饱和比例,风险等级,位深\n' + csvRows.join('\n');
};
