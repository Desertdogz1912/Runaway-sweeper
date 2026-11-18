import { Flame, Maximize2, Play, RotateCcw, Shield, Zap } from 'lucide-react';
import {
  Difficulty,
  GameState,
  HudSnapshot,
  PLOW_LIVERIES,
  POWER_UP_CONFIGS,
  PlowLiveryConfig,
  PlowLiveryId,
  PowerUpType,
} from '../game/types';

interface OverlaysProps {
  hud: HudSnapshot;
  selectedDifficulty: Difficulty;
  onSelectDifficulty: (diff: Difficulty) => void;
  selectedLivery: PlowLiveryId;
  onSelectLivery: (livery: PlowLiveryId) => void;
  onStartGame: () => void;
  onResumeGame: () => void;
  onRestartGame: () => void;
}

const DIFFICULTIES: { id: Difficulty; label: string; desc: string }[] = [
  { id: Difficulty.STANDARD, label: 'Standard', desc: 'Steady snowfall · 44s approach' },
  { id: Difficulty.BLIZZARD, label: 'Blizzard', desc: 'Heavier drift · More banks' },
  { id: Difficulty.GALE_FORCE, label: 'Gale Force', desc: 'Fast approaches · Dense hazards' },
];

const LIVERY_LIST: PlowLiveryConfig[] = [
  PLOW_LIVERIES[PlowLiveryId.AIRFIELD_AMBER],
  PLOW_LIVERIES[PlowLiveryId.ARCTIC_RESCUE],
  PLOW_LIVERIES[PlowLiveryId.POLAR_NIGHT],
];

function PlowMiniPreview({ livery }: { livery: PlowLiveryConfig }) {
  return (
    <svg
      width="34"
      height="42"
      viewBox="-28 -46 56 76"
      className="shrink-0"
      aria-hidden="true"
    >
      {/* Tires */}
      <rect x="-22" y="-16" width="5" height="13" rx="1" fill="#090D16" />
      <rect x="17" y="-16" width="5" height="13" rx="1" fill="#090D16" />
      <rect x="-22" y="8" width="5" height="14" rx="1" fill="#090D16" />
      <rect x="17" y="8" width="5" height="14" rx="1" fill="#090D16" />
      {/* Rear hopper */}
      <rect x="-16" y="-2" width="32" height="26" rx="4" fill={livery.hopperHex} />
      <rect x="-13" y="19" width="26" height="3.5" fill={livery.stripeHex} />
      {/* Cab */}
      <rect x="-16" y="-24" width="32" height="23" rx="5" fill={livery.cabHex} />
      {/* Windshield & stripe */}
      <rect x="-12" y="-21" width="24" height="8" rx="2" fill="#0F172A" />
      <rect x="-3.5" y="-12" width="7" height="10" fill={livery.stripeHex} />
      {/* Roof beacon */}
      <circle cx="0" cy="-9" r="3.8" fill={livery.beaconCoreHex} />
      {/* Hydraulic arms & Front blade */}
      <path d="M-9 -22 L-12 -32 M9 -22 L12 -32" stroke="#94A3B8" strokeWidth="3" />
      <path
        d="M-24 -30 Q0 -40 24 -30 L21 -37 Q0 -47 -21 -37 Z"
        fill={livery.bladeHex}
        stroke="#1E293B"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function Overlays({
  hud,
  selectedDifficulty,
  onSelectDifficulty,
  selectedLivery,
  onSelectLivery,
  onStartGame,
  onResumeGame,
  onRestartGame,
}: OverlaysProps) {
  if (hud.gameState === GameState.PLAYING) return null;

  if (hud.gameState === GameState.TITLE_MENU) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#09101A]/75 p-4 backdrop-blur-xs sm:p-6">
        <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/12 bg-[#131C2B] p-6 shadow-2xl sm:p-7">
          <div className="flex flex-col gap-2 border-b border-white/8 pb-5">
            <div className="text-xs font-medium text-amber-400">
              Winter Airfield Operations · Runway 05L / 23R
            </div>
            <h1
              className="text-4xl font-bold tracking-tight text-white sm:text-5xl"
              style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
            >
              Runway Sweep
            </h1>
            <p className="text-sm leading-relaxed text-slate-300">
              Drive up and down the active runway to plow accumulating snow, dodge compacted snow
              banks by shifting left and right, and clear the flight path before incoming planes
              touch down.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 py-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-slate-400">
                Flight Safety Rules
              </h2>
              <ul className="flex flex-col gap-2 text-xs leading-relaxed text-slate-200">
                <li>
                  <span className="font-semibold text-white">1. Plow Up &amp; Down:</span> Clear
                  snow across the runway and center corridor before the countdown hits zero.
                </li>
                <li>
                  <span className="font-semibold text-white">2. Shift Left &amp; Right:</span>{' '}
                  Weave around orange-staked snow banks, and pull to the outer lanes on final
                  approach.
                </li>
                <li>
                  <span className="font-semibold text-white">3. Expedite Landings:</span> Once
                  runway clearance hits target, press <span className="font-mono text-emerald-400">E</span>{' '}
                  to land early for bonus points.
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-slate-400">
                Runway Power-Ups
              </h2>
              <div className="grid grid-cols-1 gap-2 text-xs">
                <div className="flex items-center gap-2.5 text-slate-200">
                  <Zap className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>
                    <strong className="text-white">{POWER_UP_CONFIGS[PowerUpType.TURBO].label}</strong>{' '}
                    · {POWER_UP_CONFIGS[PowerUpType.TURBO].shortDesc}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-slate-200">
                  <Maximize2 className="h-4 w-4 shrink-0 text-sky-400" />
                  <span>
                    <strong className="text-white">{POWER_UP_CONFIGS[PowerUpType.WIDE_BLADE].label}</strong>{' '}
                    · {POWER_UP_CONFIGS[PowerUpType.WIDE_BLADE].shortDesc}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-slate-200">
                  <Flame className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>
                    <strong className="text-white">{POWER_UP_CONFIGS[PowerUpType.DE_ICER].label}</strong>{' '}
                    · {POWER_UP_CONFIGS[PowerUpType.DE_ICER].shortDesc}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-slate-200">
                  <Shield className="h-4 w-4 shrink-0 text-violet-400" />
                  <span>
                    <strong className="text-white">{POWER_UP_CONFIGS[PowerUpType.ICEBREAKER].label}</strong>{' '}
                    · {POWER_UP_CONFIGS[PowerUpType.ICEBREAKER].shortDesc}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/8 pt-4">
            {/* Plow Livery Customization */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">Snow Plow Livery</span>
                <span className="text-xs text-slate-400">
                  {PLOW_LIVERIES[selectedLivery].name}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 rounded-lg bg-[#0B121D] p-1.5 sm:grid-cols-3">
                {LIVERY_LIST.map((liv) => {
                  const active = selectedLivery === liv.id;
                  return (
                    <button
                      key={liv.id}
                      type="button"
                      onClick={() => onSelectLivery(liv.id)}
                      aria-pressed={active}
                      className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-800 text-white ring-1 ring-white/20'
                          : 'text-slate-400 hover:bg-slate-900/80 hover:text-slate-200'
                      }`}
                    >
                      <PlowMiniPreview livery={liv} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold">{liv.name}</div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-400">
                          {liv.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-medium text-slate-300">Weather Conditions</span>
              {hud.bestScore > 0 && (
                <span className="font-mono text-xs text-slate-400 tabular-nums">
                  Best Score: {hud.bestScore.toLocaleString()}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg bg-[#0B121D] p-1">
              {DIFFICULTIES.map((d) => {
                const active = selectedDifficulty === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onSelectDifficulty(d.id)}
                    aria-pressed={active}
                    className={`rounded-md px-3 py-2 text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-semibold whitespace-nowrap">{d.label}</div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-400">{d.desc}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between gap-4">
              <div className="text-xs text-slate-400">
                Move: <span className="font-mono text-slate-200">WASD / Arrows</span> · Dash:{' '}
                <span className="font-mono text-slate-200">Space</span>
              </div>
              <button
                type="button"
                onClick={onStartGame}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Play className="h-4 w-4 fill-slate-950" />
                Start Game
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (hud.gameState === GameState.PAUSED) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#09101A]/75 p-6 backdrop-blur-xs">
        <div className="w-full max-w-sm rounded-xl border border-white/12 bg-[#131C2B] p-6 shadow-2xl">
          <h2
            className="text-3xl font-bold text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Shift Paused
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Wave {hud.wave} · {hud.flightCode} · {hud.totalClearancePct}% runway cleared
          </p>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={onResumeGame}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 cursor-pointer whitespace-nowrap"
            >
              <Play className="h-4 w-4 fill-slate-950" />
              Resume
            </button>
            <button
              type="button"
              onClick={onRestartGame}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-slate-800/70 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="h-4 w-4" />
              Restart
            </button>
          </div>
        </div>
      </div>
    );
  }

  // GAME OVER
  const isNewBest = hud.score > 0 && hud.score >= hud.bestScore;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#09101A]/80 p-6 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-xl border border-white/12 bg-[#131C2B] p-7 shadow-2xl">
        <div className="text-xs font-medium text-rose-400">
          Airfield Closed · Safety Integrity Depleted
        </div>
        <h2
          className="mt-1 text-4xl font-bold text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Shift Ended
        </h2>

        <div className="mt-5 grid grid-cols-2 gap-4 border-y border-white/8 py-4">
          <div>
            <div className="text-xs text-slate-400">Final Score</div>
            <div className="font-mono text-2xl font-bold text-white tabular-nums">
              {hud.score.toLocaleString()}
            </div>
            {isNewBest && (
              <div className="mt-0.5 text-xs font-medium text-amber-400">New High Score</div>
            )}
          </div>
          <div>
            <div className="text-xs text-slate-400">Best Score</div>
            <div className="font-mono text-2xl font-bold text-slate-300 tabular-nums">
              {hud.bestScore.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Planes Safely Landed</div>
            <div className="font-mono text-lg font-semibold text-emerald-400 tabular-nums">
              {hud.planesLanded}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Banks Smashed · Wave</div>
            <div className="font-mono text-lg font-semibold text-slate-200 tabular-nums">
              {hud.banksSmashed} · Wave {hud.wave}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onStartGame}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="h-4 w-4" />
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
