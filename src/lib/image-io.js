export const getFileEndian = (buffer) => {
  const header = new Uint8Array(buffer, 0, 2);
  return header[0] === 0x49 && header[1] === 0x49;
};

export const inferPreviewAlignedInvert = ({ data, rgba, width, height, bitDepth, samplesPerPixel, photometric, littleEndian }) => {
  if (!data || !rgba || !width || !height) return false;

  const bytesPerSample = bitDepth / 8;
  const maxValue = (2 ** bitDepth) - 1;
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const readSample = (sampleIndex) => {
    if (bitDepth === 8) return data[sampleIndex];
    if (bitDepth === 16) return dataView.getUint16(sampleIndex * bytesPerSample, littleEndian);
    return null;
  };

  let directError = 0;
  let invertedError = 0;
  let samples = 0;
  const sampleCols = Math.min(8, width);
  const sampleRows = Math.min(8, height);

  for (let row = 0; row < sampleRows; row += 1) {
    for (let col = 0; col < sampleCols; col += 1) {
      const x = Math.min(width - 1, Math.floor(((col + 0.5) / sampleCols) * width));
      const y = Math.min(height - 1, Math.floor(((row + 0.5) / sampleRows) * height));
      const pixelIndex = y * width + x;
      let rawBrightness = null;

      if (samplesPerPixel === 1) {
        const rawValue = readSample(pixelIndex);
        if (rawValue == null) continue;
        rawBrightness = photometric === 0 ? maxValue - rawValue : rawValue;
      } else if (samplesPerPixel >= 3) {
        const baseIndex = pixelIndex * samplesPerPixel;
        const r = readSample(baseIndex);
        const g = readSample(baseIndex + 1);
        const b = readSample(baseIndex + 2);
        if (r == null || g == null || b == null) continue;
        rawBrightness = (0.299 * r + 0.587 * g + 0.114 * b);
      }

      if (rawBrightness == null) continue;
      const rgbaIndex = pixelIndex * 4;
      const previewBrightness = (0.299 * rgba[rgbaIndex] + 0.587 * rgba[rgbaIndex + 1] + 0.114 * rgba[rgbaIndex + 2]) / 255;
      const normalizedRaw = rawBrightness / maxValue;
      directError += Math.abs(normalizedRaw - previewBrightness);
      invertedError += Math.abs((1 - normalizedRaw) - previewBrightness);
      samples += 1;
    }
  }

  if (samples === 0) return false;
  return invertedError < directError;
};
