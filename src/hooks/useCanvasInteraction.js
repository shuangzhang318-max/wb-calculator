import { useCallback, useEffect, useRef, useState } from 'react';
import { clampInt } from '../lib/input';

const useCanvasInteraction = ({
  image,
  bands,
  setBands,
  selectedBandId,
  setSelectedBandId,
  bgBandId,
  refBandId,
  setBgBandId,
  setRefBandId,
  isFixedSize,
  fixedWidthStr,
  fixedHeightStr,
  totalScale,
  brightness,
  contrast,
  canvasRef,
  canvasShellRef,
  imgRef,
  magnifierRef,
  calculateIntDen,
  clampBandToImage,
  removeBand,
}) => {
  const [interactionMode, setInteractionMode] = useState(null);
  const [isKeyboardMoving, setIsKeyboardMoving] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, bandX: 0, bandY: 0, bandW: 0, bandH: 0, handle: null });
  const [currentRect, setCurrentRect] = useState(null);
  const [isMagnifierVisible, setIsMagnifierVisible] = useState(false);
  const keyboardTimer = useRef(null);
  const activePointerIdRef = useRef(null);

  const getCanvasPoint = useCallback((event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / totalScale,
      y: (event.clientY - rect.top) / totalScale,
    };
  }, [canvasRef, totalScale]);

  const resetInteraction = useCallback(() => {
    setInteractionMode(null);
    setIsKeyboardMoving(false);
    setCurrentRect(null);
    setIsMagnifierVisible(false);
    setDragStart({ x: 0, y: 0, bandX: 0, bandY: 0, bandW: 0, bandH: 0, handle: null });
    activePointerIdRef.current = null;
    if (keyboardTimer.current) {
      clearTimeout(keyboardTimer.current);
      keyboardTimer.current = null;
    }
  }, []);

  const finalizeInteraction = useCallback(() => {
    if (!interactionMode) return;

    if (interactionMode === 'drawing' && currentRect && (isFixedSize || currentRect.width > 2)) {
      const { sum, area, saturatedPixels } = calculateIntDen(currentRect, imgRef.current);
      const newBand = {
        ...currentRect,
        id: Date.now(),
        name: `样品-${bands.length + 1}`,
        grayscale: sum,
        area,
        saturatedPixels,
        currentLoading: 20,
      };
      setBands((prevBands) => [...prevBands, newBand]);
      setSelectedBandId(newBand.id);
      if (bands.length === 0 && !bgBandId) {
        setBgBandId(newBand.id);
      } else if (bands.length === 1 && !refBandId) {
        setRefBandId(newBand.id);
      }
    } else if (interactionMode === 'moving' || interactionMode === 'resizing') {
      setBands((prevBands) => prevBands.map((band) => {
        if (band.id !== selectedBandId) return band;
        const { sum, area, saturatedPixels } = calculateIntDen(band, imgRef.current);
        return { ...band, grayscale: sum, area, saturatedPixels };
      }));
    }

    setInteractionMode(null);
    setCurrentRect(null);
    activePointerIdRef.current = null;
  }, [bands.length, bgBandId, calculateIntDen, currentRect, imgRef, interactionMode, isFixedSize, refBandId, selectedBandId, setBands, setBgBandId, setRefBandId, setSelectedBandId]);

  const renderMagnifier = useCallback((x, y, activeBand) => {
    if (!magnifierRef.current || !imgRef.current) return;

    const magnifierCanvas = magnifierRef.current;
    const magnifierContext = magnifierCanvas.getContext('2d');
    const magnifierSize = 240;
    const baseSourceSize = 110;

    magnifierCanvas.width = magnifierSize;
    magnifierCanvas.height = magnifierSize;

    const srcW = activeBand ? Math.max(baseSourceSize, activeBand.width + 40) : baseSourceSize;
    const srcH = activeBand ? Math.max(baseSourceSize, activeBand.height + 40) : baseSourceSize;
    const sx = Math.max(0, Math.min(x - srcW / 2, imgRef.current.width - srcW));
    const sy = Math.max(0, Math.min(y - srcH / 2, imgRef.current.height - srcH));
    const scale = Math.min(magnifierSize / srcW, magnifierSize / srcH);

    magnifierContext.save();
    magnifierContext.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    magnifierContext.imageSmoothingEnabled = false;
    magnifierContext.drawImage(
      imgRef.current,
      sx,
      sy,
      srcW,
      srcH,
      (magnifierSize - srcW * scale) / 2,
      (magnifierSize - srcH * scale) / 2,
      srcW * scale,
      srcH * scale,
    );
    magnifierContext.restore();

    if (activeBand) {
      magnifierContext.strokeStyle = '#3b82f6';
      magnifierContext.lineWidth = 2;
      magnifierContext.strokeRect(
        (magnifierSize - srcW * scale) / 2 + (activeBand.x - sx) * scale,
        (magnifierSize - srcH * scale) / 2 + (activeBand.y - sy) * scale,
        activeBand.width * scale,
        activeBand.height * scale,
      );
    }
  }, [brightness, contrast, imgRef, magnifierRef]);

  const startNewDrawing = useCallback((x, y) => {
    setInteractionMode('drawing');
    setIsMagnifierVisible(true);
    setDragStart({ x, y });
    const fixedWidth = clampInt(fixedWidthStr, 5, 80);
    const fixedHeight = clampInt(fixedHeightStr, 5, 30);
    setCurrentRect(
      isFixedSize
        ? { x: x - fixedWidth / 2, y: y - fixedHeight / 2, width: fixedWidth, height: fixedHeight }
        : { x, y, width: 0, height: 0 },
    );
  }, [fixedHeightStr, fixedWidthStr, isFixedSize]);

  const handlePointerDown = useCallback((event) => {
    if (!image || !imgRef.current || (event.button !== undefined && event.button !== 0)) return;
    const { x, y } = getCanvasPoint(event);

    activePointerIdRef.current = event.pointerId;
    if (canvasRef.current?.setPointerCapture) {
      canvasRef.current.setPointerCapture(event.pointerId);
    }

    if (bands.length === 0) {
      startNewDrawing(x, y);
      return;
    }

    if (selectedBandId && !isFixedSize) {
      const selectedBand = bands.find((band) => band.id === selectedBandId);
      if (selectedBand) {
        const handleSize = 15 / totalScale;
        const points = [
          { n: 'tl', x: selectedBand.x, y: selectedBand.y },
          { n: 'br', x: selectedBand.x + selectedBand.width, y: selectedBand.y + selectedBand.height },
        ];
        const hitHandle = points.find((point) => Math.abs(x - point.x) < handleSize && Math.abs(y - point.y) < handleSize);
        if (hitHandle) {
          setInteractionMode('resizing');
          setDragStart({
            x,
            y,
            bandX: selectedBand.x,
            bandY: selectedBand.y,
            bandW: selectedBand.width,
            bandH: selectedBand.height,
            handle: hitHandle.n,
          });
          return;
        }
      }
    }

    const clickedBand = [...bands].reverse().find((band) => x > band.x && x < band.x + band.width && y > band.y && y < band.y + band.height);
    if (clickedBand) {
      setSelectedBandId(clickedBand.id);
      setIsMagnifierVisible(true);
      setInteractionMode('moving');
      setDragStart({ x, y, bandX: clickedBand.x, bandY: clickedBand.y });
    } else {
      setSelectedBandId(null);
      setIsMagnifierVisible(true);
      startNewDrawing(x, y);
    }
  }, [bands, canvasRef, getCanvasPoint, image, imgRef, isFixedSize, selectedBandId, setSelectedBandId, startNewDrawing, totalScale]);

  const handlePointerMove = useCallback((event) => {
    if (!interactionMode || !image || !imgRef.current) return;
    if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return;
    const { x, y } = getCanvasPoint(event);

    if (interactionMode === 'drawing') {
      const nextRect = isFixedSize
        ? { ...currentRect, x: x - currentRect.width / 2, y: y - currentRect.height / 2 }
        : {
          x: Math.min(x, dragStart.x),
          y: Math.min(y, dragStart.y),
          width: Math.max(1, Math.abs(x - dragStart.x)),
          height: Math.max(1, Math.abs(y - dragStart.y)),
        };
      setCurrentRect(nextRect);
      renderMagnifier(x, y, nextRect);
    } else if (interactionMode === 'moving') {
      const activeBand = bands.find((band) => band.id === selectedBandId);
      if (activeBand) {
        const nextBand = clampBandToImage({
          ...activeBand,
          x: dragStart.bandX + (x - dragStart.x),
          y: dragStart.bandY + (y - dragStart.y),
        });
        setBands((prevBands) => prevBands.map((band) => (band.id === selectedBandId ? nextBand : band)));
        renderMagnifier(x, y, nextBand);
      }
    } else if (interactionMode === 'resizing') {
      let activeBand = bands.find((band) => band.id === selectedBandId);
      const { bandX, bandY, bandW, bandH, handle } = dragStart;
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;

      if (handle === 'tl') {
        activeBand = clampBandToImage({
          ...activeBand,
          x: bandX + dx,
          y: bandY + dy,
          width: Math.max(5, bandW - dx),
          height: Math.max(5, bandH - dy),
        });
      } else if (handle === 'br') {
        activeBand = clampBandToImage({
          ...activeBand,
          width: Math.max(5, bandW + dx),
          height: Math.max(5, bandH + dy),
        });
      }

      setBands((prevBands) => prevBands.map((band) => (band.id === selectedBandId ? activeBand : band)));
      renderMagnifier(x, y, activeBand);
    }
  }, [bands, clampBandToImage, currentRect, dragStart, getCanvasPoint, image, imgRef, interactionMode, isFixedSize, renderMagnifier, selectedBandId, setBands]);

  const releasePointerCapture = useCallback((pointerId) => {
    if (pointerId == null || !canvasRef.current?.hasPointerCapture?.(pointerId)) return;
    canvasRef.current.releasePointerCapture(pointerId);
  }, [canvasRef]);

  const handlePointerUp = useCallback((event) => {
    if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return;
    releasePointerCapture(event.pointerId);
    finalizeInteraction();
  }, [finalizeInteraction, releasePointerCapture]);

  const handlePointerCancel = useCallback((event) => {
    if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return;
    releasePointerCapture(event.pointerId);
    finalizeInteraction();
  }, [finalizeInteraction, releasePointerCapture]);

  useEffect(() => {
    if ((!isMagnifierVisible && !interactionMode && !isKeyboardMoving) || !imgRef.current) return;

    const activeBand = interactionMode === 'drawing'
      ? currentRect
      : bands.find((band) => band.id === selectedBandId);

    if (!activeBand) return;

    const frameId = window.requestAnimationFrame(() => {
      renderMagnifier(
        activeBand.x + activeBand.width / 2,
        activeBand.y + activeBand.height / 2,
        activeBand,
      );
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [bands, currentRect, imgRef, interactionMode, isKeyboardMoving, isMagnifierVisible, renderMagnifier, selectedBandId]);

  useEffect(() => {
    if (selectedBandId) {
      setIsMagnifierVisible(true);
      return;
    }

    if (!interactionMode && !isKeyboardMoving) {
      setIsMagnifierVisible(false);
    }
  }, [interactionMode, isKeyboardMoving, selectedBandId]);

  useEffect(() => {
    const handleWindowPointerDown = (event) => {
      if (!canvasShellRef.current) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (canvasShellRef.current.contains(target)) return;
      setIsMagnifierVisible(false);
    };

    window.addEventListener('pointerdown', handleWindowPointerDown, true);
    return () => window.removeEventListener('pointerdown', handleWindowPointerDown, true);
  }, [canvasShellRef]);

  useEffect(() => {
    if (!isKeyboardMoving || !selectedBandId || !imgRef.current) return;

    const activeBand = bands.find((band) => band.id === selectedBandId);
    if (!activeBand) return;

    const frameId = window.requestAnimationFrame(() => {
      renderMagnifier(
        activeBand.x + activeBand.width / 2,
        activeBand.y + activeBand.height / 2,
        activeBand,
      );
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [bands, imgRef, isKeyboardMoving, renderMagnifier, selectedBandId]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!selectedBandId || !imgRef.current || interactionMode) return;
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      if (target?.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select') return;

      if (event.key === 'Backspace') {
        event.preventDefault();
        removeBand(selectedBandId);
        setIsKeyboardMoving(false);
        if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
        return;
      }

      const step = event.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;

      if (event.key === 'ArrowLeft') dx = -step;
      else if (event.key === 'ArrowRight') dx = step;
      else if (event.key === 'ArrowUp') dy = -step;
      else if (event.key === 'ArrowDown') dy = step;
      else return;

      event.preventDefault();
      setIsKeyboardMoving(true);

      let nextBand = null;
      setBands((prevBands) => prevBands.map((band) => {
        if (band.id !== selectedBandId) return band;
        const movedBand = clampBandToImage({ ...band, x: band.x + dx, y: band.y + dy });
        const { sum, area, saturatedPixels } = calculateIntDen(movedBand, imgRef.current);
        nextBand = { ...movedBand, grayscale: sum, area, saturatedPixels };
        return nextBand;
      }));

      if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
      keyboardTimer.current = window.setTimeout(() => setIsKeyboardMoving(false), 220);

      if (nextBand) {
        window.requestAnimationFrame(() => {
          renderMagnifier(nextBand.x + nextBand.width / 2, nextBand.y + nextBand.height / 2, nextBand);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
    };
  }, [calculateIntDen, clampBandToImage, imgRef, interactionMode, removeBand, renderMagnifier, selectedBandId, setBands]);

  useEffect(() => {
    if (!image || !canvasRef.current || !imgRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    canvas.width = imgRef.current.width * totalScale;
    canvas.height = imgRef.current.height * totalScale;

    context.save();
    context.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    context.scale(totalScale, totalScale);
    context.drawImage(imgRef.current, 0, 0);
    context.restore();

    context.save();
    context.scale(totalScale, totalScale);
    bands.forEach((band) => {
      const isSelected = band.id === selectedBandId;
      context.setLineDash(band.id === bgBandId ? [4, 4] : []);
      context.strokeStyle = isSelected ? '#3b82f6' : (band.id === bgBandId ? '#f59e0b' : (band.id === refBandId ? '#10b981' : 'rgba(148,163,184,0.5)'));
      context.lineWidth = (isSelected ? 3 : 1.5) / totalScale;
      context.strokeRect(band.x, band.y, band.width, band.height);
    });
    if (currentRect) {
      context.strokeStyle = '#3b82f6';
      context.setLineDash([5, 5]);
      context.strokeRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height);
    }
    context.restore();
  }, [bands, bgBandId, brightness, canvasRef, contrast, currentRect, image, imgRef, refBandId, selectedBandId, totalScale]);

  useEffect(() => {
    if (!interactionMode) return;

    const handleWindowPointerUp = () => {
      if (activePointerIdRef.current == null) return;
      releasePointerCapture(activePointerIdRef.current);
      finalizeInteraction();
    };

    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [finalizeInteraction, interactionMode, releasePointerCapture]);

  return {
    interactionMode,
    isKeyboardMoving,
    isMagnifierVisible,
    currentRect,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    resetInteraction,
    showMagnifier: interactionMode || isKeyboardMoving || isMagnifierVisible,
  };
};

export default useCanvasInteraction;
