/**
 * Waveform visualiser — heavy canvas rendering component.
 *
 * memo() prevents re-renders when parent re-renders but bars/color haven't changed.
 * Without memo, every queue update (polling) would repaint all waveforms.
 */
import { memo, useEffect, useRef } from "react";

interface WaveformProps {
  /** Array of amplitude values 0–1 */
  bars: number[];
  color?: string;
  height?: number;
}

function WaveformInner({ bars, color = "#6366f1", height = 64 }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio ?? 1;
    const w = canvas.offsetWidth;
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, height);

    const barWidth = w / bars.length;
    const gap = 2;

    bars.forEach((amplitude, i) => {
      const barH = Math.max(2, amplitude * height);
      const x = i * barWidth + gap / 2;
      const y = (height - barH) / 2;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth - gap, barH, 2);
      ctx.fill();
    });
  }, [bars, color, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: `${height}px`, display: "block" }}
    />
  );
}

// memo with custom comparator — only re-render if bars content or color changed
export const Waveform = memo(WaveformInner, (prev, next) => {
  if (prev.color !== next.color || prev.height !== next.height) return false;
  if (prev.bars.length !== next.bars.length) return false;
  // Shallow compare array values — bars are 0–1 floats
  return prev.bars.every((v, i) => v === next.bars[i]);
});
