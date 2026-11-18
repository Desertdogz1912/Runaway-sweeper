import { Shield, ShieldAlert, PlaneLanding, Zap, Maximize2, Flame, Snowflake } from 'lucide-react';
import { RunwayGameEngine } from '../game/engine';
import { HudSnapshot, POWER_UP_CONFIGS, PowerUpType } from '../game/types';
import { RunwayRadar } from './RunwayRadar';

interface GameHUDProps {
  hud: HudSnapshot;
  engine: RunwayGameEngine;
  onExpediteLanding: () => void;
}

function PowerUpIcon({ type }: { type: PowerUpType }) {
  switch (type) {
    case PowerUpType.TURBO:
      return <Zap className="h-3.5 w-3.5 text-amber-400" />;
    case PowerUpType.WIDE_BLADE:
      return <Maximize2 className="h-3.5 w-3.5 text-sky-400" />;
    case PowerUpType.DE_ICER:
      return <Flame className="h-3.5 w-3.5 text-emerald-400" />;
    case PowerUpType.ICEBREAKER:
      return <Shield className="h-3.5 w-3.5 text-violet-400" />;
  }
}

export function GameHUD({ hud, engine, onExpediteLanding }: GameHUDProps) {
  const timeSec = Math.ceil(hud.timeRemaining);
  const mins = Math.floor(timeSec / 60);
  const secs = timeSec % 60;
  const formattedTime = `${mins}:${secs.toString().padStart(2, '0')}`;

  const canExpedite =
    hud.isReadyToLand &&
    hud.planePhase === 'APPROACHING' &&
    hud.timeRemaining > 5;

  const flightStatusText =
    hud.planePhase === 'TOUCHDOWN_PASS'
      ? 'Landing Now'
      : hud.planePhase === 'GO_AROUND'
        ? 'Aborted · Go-Around'
        : hud.planePhase === 'FINAL_APPROACH'
          ? hud.plowInDangerCorridor
            ? 'Final · Vacate Center'
            : 'Final · Path Clear'
          : hud.isReadyToLand
            ? 'Runway Ready'
            : 'Clearing Needed';

  const flightStatusColor =
    hud.planePhase === 'GO_AROUND' ||
    (hud.planePhase === 'FINAL_APPROACH' && hud.plowInDangerCorridor)
      ? 'text-rose-400'
      : hud.isReadyToLand || hud.planePhase === 'TOUCHDOWN_PASS'
        ? 'text-emerald-400'
        : 'text-amber-400';

  return (
    <aside className="z-10 flex w-full flex-col justify-between gap-4 border-t border-white/10 bg-[#131C2B]/92 p-4 backdrop-blur-md lg:absolute lg:top-3 lg:right-3 lg:bottom-3 lg:w-[308px] lg:overflow-y-auto lg:rounded-xl lg:border lg:shadow-2xl">
      <div className="flex flex-col gap-4">
        {/* Score & Integrity Row */}
        <div className="flex items-baseline justify-between border-b border-white/8 pb-3">
          <div>
            <div className="text-xs font-medium text-slate-400">Score</div>
            <div className="font-mono text-2xl font-bold tracking-tight text-white tabular-nums">
              {hud.score.toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-medium text-slate-400">Best · Wave {hud.wave}</div>
            <div className="font-mono text-sm font-semibold text-slate-300 tabular-nums">
              {hud.bestScore.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Safety Integrity */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">Safety Integrity</span>
          <div className="flex items-center gap-1.5" aria-label={`Safety integrity ${hud.integrity} of ${hud.maxIntegrity}`}>
            {Array.from({ length: hud.maxIntegrity }).map((_, idx) => {
              const active = idx < hud.integrity;
              return active ? (
                <Shield key={idx} className="h-4 w-4 fill-emerald-400/20 text-emerald-400" />
              ) : (
                <ShieldAlert key={idx} className="h-4 w-4 text-slate-600" />
              );
            })}
            <span className="ml-1 font-mono text-xs text-slate-300 tabular-nums">
              {hud.integrity}/{hud.maxIntegrity}
            </span>
          </div>
        </div>

        {/* Incoming Plane Approach */}
        <div className="flex flex-col gap-2 border-t border-white/8 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <PlaneLanding className="h-4 w-4 text-amber-400" />
              <span>{hud.flightCode}</span>
            </div>
            <span className={`font-mono text-xl font-bold tabular-nums ${
              timeSec <= 5 && hud.planePhase !== 'TOUCHDOWN_PASS' ? 'text-rose-400' : 'text-white'
            }`}>
              {formattedTime}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 truncate max-w-[165px]">{hud.aircraftName}</span>
            <span className={`font-medium whitespace-nowrap ${flightStatusColor}`}>
              {flightStatusText}
            </span>
          </div>

          {canExpedite && (
            <button
              type="button"
              onClick={onExpediteLanding}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 cursor-pointer whitespace-nowrap"
            >
              <PlaneLanding className="h-3.5 w-3.5" />
              Clear Plane to Land [E]
            </button>
          )}
        </div>

        {/* Runway Clearance & Radar Split */}
        <div className="grid grid-cols-[1fr_auto] gap-3 border-t border-white/8 pt-3">
          <div className="flex flex-col gap-3">
            {/* Overall Runway Bar */}
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-slate-300 font-medium">Runway Clear</span>
                <span className="font-mono font-semibold text-white tabular-nums">
                  {hud.totalClearancePct}% / {hud.targetClearancePct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-sm bg-slate-800">
                <div
                  className={`h-full transition-all duration-150 ${
                    hud.totalClearancePct >= hud.targetClearancePct
                      ? 'bg-emerald-400'
                      : 'bg-amber-400'
                  }`}
                  style={{ width: `${Math.min(100, hud.totalClearancePct)}%` }}
                />
              </div>
            </div>

            {/* Center Flight Path Bar */}
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-slate-300 font-medium">Flight Path</span>
                <span className="font-mono font-semibold text-white tabular-nums">
                  {hud.flightPathClearancePct}% / {hud.targetClearancePct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-sm bg-slate-800">
                <div
                  className={`h-full transition-all duration-150 ${
                    hud.flightPathClearancePct >= hud.targetClearancePct
                      ? 'bg-emerald-400'
                      : 'bg-sky-400'
                  }`}
                  style={{ width: `${Math.min(100, hud.flightPathClearancePct)}%` }}
                />
              </div>
            </div>

            {/* Dash Readiness */}
            <div className="flex flex-col gap-1 pt-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-slate-400">Boost Dash [Space]</span>
                <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                  {hud.dashCooldownRatio <= 0.01 ? 'Ready' : 'Recharging'}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-800">
                <div
                  className="h-full bg-amber-400 transition-all duration-75"
                  style={{ width: `${Math.round((1 - hud.dashCooldownRatio) * 100)}%` }}
                />
              </div>
            </div>

            {/* Active Power-Ups */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="text-xs font-medium text-slate-400">Active Power-Ups</div>
              {hud.activePowerUps.length === 0 ? (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Snowflake className="h-3.5 w-3.5" />
                  <span>None active</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {hud.activePowerUps.map((pu) => {
                    const cfg = POWER_UP_CONFIGS[pu.type];
                    const pct = Math.max(0, Math.min(100, (pu.remaining / pu.duration) * 100));
                    return (
                      <div key={pu.type} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-medium text-slate-200">
                            <PowerUpIcon type={pu.type} />
                            {cfg.label}
                          </span>
                          <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                            {pu.remaining.toFixed(1)}s
                          </span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-sm bg-slate-800">
                          <div
                            className="h-full"
                            style={{ width: `${pct}%`, backgroundColor: cfg.accentHex }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <RunwayRadar engine={engine} />
        </div>
      </div>

      {/* Compact Controls Footer */}
      <div className="border-t border-white/8 pt-3 text-xs text-slate-400">
        <div className="flex items-center justify-between">
          <span>Drive Up / Down</span>
          <span className="font-mono text-slate-200">W S · ↑ ↓</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span>Shift Left / Right</span>
          <span className="font-mono text-slate-200">A D · ← →</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span>Boost · Land · Pause</span>
          <span className="font-mono text-slate-200">Space · E · P</span>
        </div>
      </div>
    </aside>
  );
}
