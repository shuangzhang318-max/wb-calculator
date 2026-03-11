export const clampBandToBounds = (band, imageWidth, imageHeight) => {
  const maxX = Math.max(0, imageWidth - band.width);
  const maxY = Math.max(0, imageHeight - band.height);
  return {
    ...band,
    x: Math.min(Math.max(0, band.x), maxX),
    y: Math.min(Math.max(0, band.y), maxY),
  };
};
