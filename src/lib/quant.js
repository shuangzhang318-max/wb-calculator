export const getBackgroundMean = ({ bands, bgBandId, fallback = 255 }) => {
  const backgroundBand = bands.find((band) => band.id === bgBandId);
  return backgroundBand && backgroundBand.area > 0
    ? backgroundBand.grayscale / backgroundBand.area
    : fallback;
};

export const getNetIntensity = ({ band, backgroundMean, signalPolarity }) => {
  if (!band) return 0;
  const backgroundSignal = band.area * backgroundMean;
  return signalPolarity === 'dark-on-light'
    ? backgroundSignal - band.grayscale
    : band.grayscale - backgroundSignal;
};

export const getSuggestedLoading = ({
  band,
  bands,
  bgBandId,
  refBandId,
  calculationMode,
  customTargetNetIntensity,
  backgroundMean,
  signalPolarity,
}) => {
  if (band.id === bgBandId) return '背景';
  if (!bgBandId) return '待设背景';

  const currentNetIntensity = getNetIntensity({ band, backgroundMean, signalPolarity });
  const referenceBand = bands.find((candidate) => candidate.id === refBandId);

  if (calculationMode === 'reference' && !referenceBand) return '待设基准';

  const targetNetIntensity = calculationMode === 'reference'
    ? (referenceBand
      ? getNetIntensity({ band: referenceBand, backgroundMean, signalPolarity })
      : 0)
    : customTargetNetIntensity;

  if (currentNetIntensity <= 0 || targetNetIntensity <= 0) return '检查极性';
  return (band.currentLoading * (targetNetIntensity / currentNetIntensity)).toFixed(2);
};
