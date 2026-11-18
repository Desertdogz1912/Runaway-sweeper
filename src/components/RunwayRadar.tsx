import { useEffect, useRef } from 'react';
import { RunwayGameEngine } from '../game/engine';

interface RunwayRadarProps {
  engine: RunwayGameEngine;
}

export function RunwayRadar({ engine }: RunwayRadarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let rafId = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          engine.renderRadar(ctx, canvas.width, canvas.height);
        }
      }
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [engine]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex w-full items-center justify-between text-xs text-slate-400">
        <span className="font-medium text-slate-300">Runway Map</span>
        <span className="font-mono tabular-nums">23R — 05L</span>
      </div>
      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-[#0F172A] p-1">
        <canvas
          ref={canvasRef}
          width={96}
          height={230}
          className="block rounded"
          aria-label="Full runway snow and hazard overview map"
        />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-xs bg-amber-400" />
          Plow
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-xs bg-orange-500" />
          Bank
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-xs bg-slate-200" />
          Snow
        </span>
      </div>
    </div>
  );
}
