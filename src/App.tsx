import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { GameHUD } from './components/GameHUD';
import { Overlays } from './components/Overlays';
import { soundEngine } from './game/audio';
import { RunwayGameEngine } from './game/engine';
import { Difficulty, GameState, HudSnapshot, PlowLiveryId } from './game/types';

export default function App() {
  const engineRef = useRef<RunwayGameEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new RunwayGameEngine();
  }
  const engine = engineRef.current;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(Difficulty.STANDARD);
  const [selectedLivery, setSelectedLivery] = useState<PlowLiveryId>(() => engine.livery);
  const [muted, setMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [hud, setHud] = useState<HudSnapshot>(() => engine.getHudSnapshot());

  // Full-bleed canvas dimensions synced to stage container
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 1280, h: 720 });

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const updateSize = () => {
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(420, Math.floor(rect.height));
      setCanvasSize({ w, h });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    if (stageRef.current) ro.observe(stageRef.current);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Main 60fps simulation & render loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let hudSyncAccum = 0;

    const frame = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const hudInsetRight = canvasSize.w >= 1024 ? 324 : 0;
      const { worldViewWidth, worldViewHeight } = engine.getViewportTransform(
        canvasSize.w,
        canvasSize.h,
        hudInsetRight
      );

      engine.update(dt, worldViewHeight, worldViewWidth);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const targetW = Math.round(canvasSize.w * dpr);
          const targetH = Math.round(canvasSize.h * dpr);
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          engine.render(ctx, canvasSize.w, canvasSize.h, hudInsetRight);
        }
      }

      hudSyncAccum += dt;
      if (hudSyncAccum >= 0.08) {
        hudSyncAccum = 0;
        setHud(engine.getHudSnapshot());
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [engine, canvasSize]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Gracefully ignore if browser/iframe blocks native fullscreen API
    }
  }, []);

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (
        ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key) &&
        engine.gameState === GameState.PLAYING
      ) {
        e.preventDefault();
      }

      if (key === 'w' || key === 'arrowup') engine.input.up = true;
      if (key === 's' || key === 'arrowdown') engine.input.down = true;
      if (key === 'a' || key === 'arrowleft') engine.input.left = true;
      if (key === 'd' || key === 'arrowright') engine.input.right = true;
      if (key === ' ') engine.input.dashPressed = true;

      if (key === 'e') {
        engine.expediteLanding();
        setHud(engine.getHudSnapshot());
      }

      if (key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        void toggleFullscreen();
      }

      if (key === 'p' || key === 'escape') {
        if (engine.gameState === GameState.PLAYING) {
          engine.setPaused(true);
          setHud(engine.getHudSnapshot());
        } else if (engine.gameState === GameState.PAUSED) {
          engine.setPaused(false);
          setHud(engine.getHudSnapshot());
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') engine.input.up = false;
      if (key === 's' || key === 'arrowdown') engine.input.down = false;
      if (key === 'a' || key === 'arrowleft') engine.input.left = false;
      if (key === 'd' || key === 'arrowright') engine.input.right = false;
    };

    const onBlur = () => {
      engine.input.up = false;
      engine.input.down = false;
      engine.input.left = false;
      engine.input.right = false;
      engine.input.pointerActive = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [engine, toggleFullscreen]);

  // Pointer / Touch drag steering on canvas
  const updatePointerTarget = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const hudInsetRight = rect.width >= 1024 ? 324 : 0;
      const { scale, offsetX } = engine.getViewportTransform(
        rect.width,
        rect.height,
        hudInsetRight
      );
      const wx = (clientX - rect.left) / scale - offsetX;
      const wy = (clientY - rect.top) / scale + engine.cameraY;
      engine.input.pointerWorldX = wx;
      engine.input.pointerWorldY = wy;
    },
    [engine]
  );

  const handleSelectLivery = useCallback(
    (livery: PlowLiveryId) => {
      setSelectedLivery(livery);
      engine.setLivery(livery);
      setHud(engine.getHudSnapshot());
    },
    [engine]
  );

  const handleStartGame = useCallback(() => {
    soundEngine.unlock();
    engine.startNewGame(selectedDifficulty, selectedLivery);
    setHud(engine.getHudSnapshot());
  }, [engine, selectedDifficulty, selectedLivery]);

  const handleTogglePause = useCallback(() => {
    if (engine.gameState === GameState.PLAYING) {
      engine.setPaused(true);
    } else if (engine.gameState === GameState.PAUSED) {
      engine.setPaused(false);
    }
    setHud(engine.getHudSnapshot());
  }, [engine]);

  const handleToggleMute = useCallback(() => {
    const next = !muted;
    soundEngine.setMuted(next);
    setMuted(next);
  }, [muted]);

  const handleExpedite = useCallback(() => {
    engine.expediteLanding();
    setHud(engine.getHudSnapshot());
  }, [engine]);

  const diffLabel =
    hud.difficulty === Difficulty.STANDARD
      ? 'Standard'
      : hud.difficulty === Difficulty.BLIZZARD
        ? 'Blizzard'
        : 'Gale Force';

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#0B121D] text-slate-100 lg:h-screen lg:overflow-hidden">
      {/* Clean 3-Zone Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-8 border-b border-white/8 bg-[#0F172A] px-5">
        <span
          className="text-2xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Runway Sweep
        </span>

        <div className="hidden items-center gap-3 text-xs text-slate-400 sm:flex whitespace-nowrap">
          <span className="font-mono text-slate-200 tabular-nums">Wave {hud.wave}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{hud.planesLanded} Landed</span>
          <span aria-hidden="true">·</span>
          <span>{diffLabel}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-3 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white cursor-pointer whitespace-nowrap"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-3 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white cursor-pointer whitespace-nowrap"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{muted ? 'Muted' : 'Audio'}</span>
          </button>

          {(hud.gameState === GameState.PLAYING || hud.gameState === GameState.PAUSED) && (
            <>
              <button
                type="button"
                onClick={handleTogglePause}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                {hud.gameState === GameState.PAUSED ? (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    Pause
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleStartGame}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restart
              </button>
            </>
          )}
        </div>
      </header>

      {/* Full-Screen Edge-to-Edge Play Stage + Floating HUD */}
      <main className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div
          ref={stageRef}
          className="relative flex min-h-[440px] flex-1 items-center justify-center overflow-hidden bg-[#09101A] lg:min-h-0"
        >
          <canvas
            ref={canvasRef}
            style={{ width: canvasSize.w, height: canvasSize.h }}
            className="block h-full w-full touch-none select-none"
            onPointerDown={(e) => {
              if (engine.gameState !== GameState.PLAYING) return;
              soundEngine.unlock();
              engine.input.pointerActive = true;
              updatePointerTarget(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (!engine.input.pointerActive) return;
              updatePointerTarget(e.clientX, e.clientY);
            }}
            onPointerUp={() => {
              engine.input.pointerActive = false;
            }}
            onPointerCancel={() => {
              engine.input.pointerActive = false;
            }}
          />

          {/* Non-blocking Top-Center Event Banner */}
          {hud.gameState === GameState.PLAYING && hud.lastEventBanner && (
            <div
              key={hud.lastEventBanner.key}
              className={`pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-lg border px-3.5 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-xs whitespace-nowrap lg:left-[calc(50%-162px)] ${
                hud.lastEventBanner.tone === 'emerald'
                  ? 'border-emerald-400/35 bg-emerald-950/85 text-emerald-200'
                  : hud.lastEventBanner.tone === 'rose'
                    ? 'border-rose-400/35 bg-rose-950/85 text-rose-200'
                    : 'border-amber-400/35 bg-amber-950/85 text-amber-200'
              }`}
            >
              {hud.lastEventBanner.text}
            </div>
          )}

          {/* Title / Pause / Game Over Overlays */}
          <Overlays
            hud={hud}
            selectedDifficulty={selectedDifficulty}
            onSelectDifficulty={setSelectedDifficulty}
            selectedLivery={selectedLivery}
            onSelectLivery={handleSelectLivery}
            onStartGame={handleStartGame}
            onResumeGame={handleTogglePause}
            onRestartGame={handleStartGame}
          />
        </div>

        {/* Floating Side HUD Panel on Desktop / Stacked Below on Mobile */}
        <GameHUD hud={hud} engine={engine} onExpediteLanding={handleExpedite} />
      </main>
    </div>
  );
}
