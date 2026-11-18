import { soundEngine } from './audio';
import {
  ActivePowerUpState,
  Difficulty,
  FloatingCallout,
  GameState,
  HudSnapshot,
  IncomingPlane,
  POWER_UP_CONFIGS,
  PLOW_LIVERIES,
  Particle,
  PlowEntity,
  PlowLiveryId,
  PowerUpItem,
  PowerUpType,
  SnowBank,
  SnowFlake,
  TireTrack,
  WORLD,
} from './types';

interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  dashPressed: boolean;
  pointerActive: boolean;
  pointerWorldX: number;
  pointerWorldY: number;
}

const FLIGHTS = [
  { code: 'AC-402', aircraft: 'Regional Jet CRJ-900' },
  { code: 'N814X', aircraft: 'Twin Otter Utility' },
  { code: 'FX-910', aircraft: 'Heavy Cargo Freighter' },
  { code: 'DL-205', aircraft: 'Airliner A220-300' },
  { code: 'CG-04', aircraft: 'Arctic Rescue C-130' },
  { code: 'BA-772', aircraft: 'Widebody 787-9' },
  { code: 'WS-318', aircraft: 'Short-Haul 737 MAX' },
];

const BEST_SCORE_KEY = 'runway_sweep_best_score_v1';
const LIVERY_STORAGE_KEY = 'runway_sweep_livery_v1';

export class RunwayGameEngine {
  public gameState: GameState = GameState.TITLE_MENU;
  public difficulty: Difficulty = Difficulty.STANDARD;
  public livery: PlowLiveryId = PlowLiveryId.AIRFIELD_AMBER;

  public score: number = 0;
  public bestScore: number = 0;
  public wave: number = 1;
  public planesLanded: number = 0;
  public integrity: number = 3;
  public maxIntegrity: number = 3;
  public banksSmashed: number = 0;
  public snowClearedCellsTotal: number = 0;

  public snowGrid: Float32Array = new Float32Array(WORLD.cols * WORLD.rows);
  public banks: SnowBank[] = [];
  public powerUps: PowerUpItem[] = [];
  public particles: Particle[] = [];
  public snowflakes: SnowFlake[] = [];
  public tireTracks: TireTrack[] = [];
  public callouts: FloatingCallout[] = [];
  public activePowerUps: Map<PowerUpType, number> = new Map();

  public plow: PlowEntity;
  public plane: IncomingPlane;
  public cameraY: number = 0;
  public screenShake: number = 0;

  public totalClearancePct: number = 0;
  public flightPathClearancePct: number = 0;
  public targetClearancePct: number = 75;
  public lastEventBanner: HudSnapshot['lastEventBanner'] = null;

  private nextEntityId: number = 1;
  private powerUpSpawnTimer: number = 3.5;
  private snowRegrowthAccum: number = 0;
  private lastApproachBeepSec: number = -1;
  private bannerKeyCounter: number = 1;
  private bannerTimer: number = 0;
  private waveTransitionTimer: number = 0;

  public input: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    dashPressed: false,
    pointerActive: false,
    pointerWorldX: WORLD.width / 2,
    pointerWorldY: WORLD.height / 2,
  };

  constructor() {
    try {
      const saved = localStorage.getItem(BEST_SCORE_KEY);
      if (saved) this.bestScore = parseInt(saved, 10) || 0;
      const savedLivery = localStorage.getItem(LIVERY_STORAGE_KEY) as PlowLiveryId | null;
      if (savedLivery && PLOW_LIVERIES[savedLivery]) {
        this.livery = savedLivery;
      }
    } catch {
      this.bestScore = 0;
    }

    this.plow = this.createInitialPlow();
    this.plane = this.createWavePlane(1);
    this.initSnowflakes();
    this.setupWave(1, true);
  }

  public setLivery(livery: PlowLiveryId): void {
    this.livery = livery;
    try {
      localStorage.setItem(LIVERY_STORAGE_KEY, livery);
    } catch {
      // ignore storage restrictions
    }
  }

  private createInitialPlow(): PlowEntity {
    return {
      x: WORLD.width / 2,
      y: WORLD.height - 160,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      width: 44,
      height: 68,
      bladeWidth: 64,
      stunTimer: 0,
      invulnTimer: 0,
      dashCooldown: 0,
      dashActiveTimer: 0,
      beaconPhase: 0,
    };
  }

  private createWavePlane(waveNum: number): IncomingPlane {
    const flight = FLIGHTS[(waveNum - 1) % FLIGHTS.length];
    const baseTime =
      this.difficulty === Difficulty.STANDARD
        ? 44
        : this.difficulty === Difficulty.BLIZZARD
          ? 39
          : 34;
    const totalTime = Math.max(26, baseTime - Math.min(12, (waveNum - 1) * 1.5));
    return {
      flightCode: flight.code,
      aircraftName: flight.aircraft,
      totalTime,
      timeRemaining: totalTime,
      phase: 'APPROACHING',
      passY: WORLD.height + 320,
      passAlpha: 0,
      landingSuccess: false,
      expedited: false,
    };
  }

  private initSnowflakes(): void {
    this.snowflakes = [];
    for (let i = 0; i < 160; i++) {
      this.snowflakes.push({
        x: Math.random() * 2200,
        y: Math.random() * 1200,
        vx: -18 - Math.random() * 26,
        vy: 55 + Math.random() * 85,
        size: 1.5 + Math.random() * 2.5,
        alpha: 0.3 + Math.random() * 0.55,
      });
    }
  }

  public startNewGame(difficulty: Difficulty, livery?: PlowLiveryId): void {
    this.difficulty = difficulty;
    if (livery) {
      this.setLivery(livery);
    }
    this.score = 0;
    this.wave = 1;
    this.planesLanded = 0;
    this.integrity = 3;
    this.banksSmashed = 0;
    this.snowClearedCellsTotal = 0;
    this.activePowerUps.clear();
    this.particles = [];
    this.tireTracks = [];
    this.callouts = [];
    this.lastEventBanner = null;
    this.plow = this.createInitialPlow();
    this.cameraY = WORLD.height - 760;
    this.setupWave(1, false);
    this.gameState = GameState.PLAYING;
    this.pushBanner('Wave 1 · Clear runway for incoming flight', 'amber');
  }

  public setPaused(paused: boolean): void {
    if (this.gameState === GameState.PLAYING && paused) {
      this.gameState = GameState.PAUSED;
    } else if (this.gameState === GameState.PAUSED && !paused) {
      this.gameState = GameState.PLAYING;
    }
  }

  public expediteLanding(): void {
    if (this.gameState !== GameState.PLAYING) return;
    if (this.plane.phase !== 'APPROACHING') return;
    if (!this.isReadyToLand()) return;

    const secondsSaved = Math.max(0, Math.floor(this.plane.timeRemaining));
    const speedBonus = secondsSaved * 35;
    if (speedBonus > 0) {
      this.addScore(speedBonus);
      this.spawnCallout(this.plow.x, this.plow.y - 40, `EXPEDITED +${speedBonus}`, '#10B981');
    }
    this.plane.expedited = true;
    this.plane.timeRemaining = 4.2;
    this.plane.phase = 'FINAL_APPROACH';
    this.pushBanner(`${this.plane.flightCode} cleared for immediate landing — vacate center!`, 'emerald');
    soundEngine.playApproachBeep(false);
  }

  private setupWave(waveNum: number, isTitlePreview: boolean): void {
    this.wave = waveNum;
    this.plane = this.createWavePlane(waveNum);
    this.lastApproachBeepSec = -1;
    this.waveTransitionTimer = 0;
    this.powerUpSpawnTimer = 2.5;

    const diffTargetBump =
      this.difficulty === Difficulty.STANDARD
        ? 0
        : this.difficulty === Difficulty.BLIZZARD
          ? 4
          : 7;
    this.targetClearancePct = Math.min(90, 74 + (waveNum - 1) * 2 + diffTargetBump);

    // Fill runway with fresh drifted snow
    for (let r = 0; r < WORLD.rows; r++) {
      for (let c = 0; c < WORLD.cols; c++) {
        const edgeBoost = c <= 1 || c >= WORLD.cols - 2 ? 0.15 : 0;
        const drift = 0.72 + Math.random() * 0.28 + edgeBoost;
        this.snowGrid[r * WORLD.cols + c] = Math.min(1, drift);
      }
    }

    // Clear small safe pad under plow start
    if (!isTitlePreview) {
      this.plow.vx = 0;
      this.plow.vy = 0;
      this.plow.stunTimer = 0;
      this.clearSnowAt(this.plow.x, this.plow.y, 72);
    }

    // Generate staggered Snow Banks (always leave navigable lanes!)
    this.generateSnowBanks(waveNum);

    // Spawn initial power-ups along runway
    this.powerUps = [];
    this.spawnPowerUp();
    this.spawnPowerUp();

    this.recalculateClearance();
  }

  private generateSnowBanks(waveNum: number): void {
    this.banks = [];
    const diffExtra =
      this.difficulty === Difficulty.STANDARD
        ? 0
        : this.difficulty === Difficulty.BLIZZARD
          ? 3
          : 5;
    const bankCount = Math.min(20, 7 + waveNum * 2 + diffExtra);

    const minY = 170;
    const maxY = WORLD.height - 260;
    const bandStep = (maxY - minY) / bankCount;

    let lastBandCol = -1;
    for (let i = 0; i < bankCount; i++) {
      const y = minY + i * bandStep + (Math.random() * 0.5 - 0.25) * bandStep * 0.6;

      // Pick a column group that isn't stacked right on the previous band's lane
      let startCol = Math.floor(Math.random() * (WORLD.cols - 2));
      if (Math.abs(startCol - lastBandCol) <= 2) {
        startCol = (startCol + 5 + Math.floor(Math.random() * 4)) % (WORLD.cols - 2);
      }
      lastBandCol = startCol;

      const spanCols = Math.random() < 0.45 ? 2 : 1;
      const bankWidth = spanCols * WORLD.cellWidth + 14;
      const bankHeight = 36 + Math.random() * 14;
      const bankX =
        WORLD.shoulderWidth + startCol * WORLD.cellWidth + (spanCols * WORLD.cellWidth) / 2;

      // Ensure not spawning directly on plow
      if (Math.hypot(bankX - this.plow.x, y - this.plow.y) < 150) {
        continue;
      }

      this.banks.push({
        id: this.nextEntityId++,
        x: bankX,
        y,
        width: bankWidth,
        height: bankHeight,
        hp: 1,
        shakeTimer: 0,
        melting: false,
      });
    }
  }

  private spawnPowerUp(): void {
    if (this.powerUps.length >= 4) return;
    const types = [
      PowerUpType.TURBO,
      PowerUpType.WIDE_BLADE,
      PowerUpType.DE_ICER,
      PowerUpType.ICEBREAKER,
    ];
    const type = types[Math.floor(Math.random() * types.length)];

    for (let attempt = 0; attempt < 15; attempt++) {
      const x = WORLD.shoulderWidth + 55 + Math.random() * (WORLD.runwayWidth - 110);
      const y = 160 + Math.random() * (WORLD.height - 320);

      const hitsBank = this.banks.some(
        (b) => Math.abs(b.x - x) < b.width * 0.7 + 28 && Math.abs(b.y - y) < b.height * 0.7 + 28
      );
      const nearOther = this.powerUps.some((p) => Math.hypot(p.x - x, p.y - y) < 120);
      const nearPlow = Math.hypot(this.plow.x - x, this.plow.y - y) < 140;

      if (!hitsBank && !nearOther && !nearPlow) {
        this.powerUps.push({
          id: this.nextEntityId++,
          type,
          x,
          y,
          radius: 20,
          pulsePhase: Math.random() * Math.PI * 2,
          lifeTimer: 26,
        });
        return;
      }
    }
  }

  public isReadyToLand(): boolean {
    return (
      this.totalClearancePct >= this.targetClearancePct &&
      this.flightPathClearancePct >= this.targetClearancePct
    );
  }

  public isPlowInDangerCorridor(): boolean {
    const center = WORLD.width / 2;
    return Math.abs(this.plow.x - center) < 105;
  }

  private pushBanner(text: string, tone: 'emerald' | 'amber' | 'rose'): void {
    this.lastEventBanner = {
      text,
      tone,
      key: this.bannerKeyCounter++,
    };
    this.bannerTimer = 4.2;
  }

  private addScore(points: number): void {
    this.score += Math.round(points);
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      try {
        localStorage.setItem(BEST_SCORE_KEY, String(this.bestScore));
      } catch {
        // ignore storage restrictions
      }
    }
  }

  private spawnCallout(x: number, y: number, text: string, color: string): void {
    this.callouts.push({
      id: this.nextEntityId++,
      x,
      y,
      text,
      color,
      life: 1.15,
      maxLife: 1.15,
    });
  }

  public getViewportTransform(
    viewWidth: number,
    viewHeight: number,
    hudInsetRight: number = 0
  ): { scale: number; offsetX: number; worldViewWidth: number; worldViewHeight: number } {
    const playWidth = Math.max(300, viewWidth - hudInsetRight);
    const scale = Math.min(playWidth / WORLD.width, Math.max(0.75, viewHeight / 660), 1.38);
    const worldViewWidth = viewWidth / scale;
    const worldViewHeight = viewHeight / scale;
    const playWorldWidth = playWidth / scale;
    const offsetX = Math.max(0, (playWorldWidth - WORLD.width) * 0.5);
    return { scale, offsetX, worldViewWidth, worldViewHeight };
  }

  public update(dt: number, viewportHeight: number, viewportWidth: number = WORLD.width): void {
    const clampedDt = Math.min(dt, 0.05);

    // Always animate snow particles smoothly even on Title Menu
    this.updateSnowflakes(clampedDt, viewportWidth, viewportHeight);

    if (this.gameState === GameState.TITLE_MENU) {
      // Gentle cinematic camera pan on title menu
      const t = performance.now() * 0.00025;
      const maxCam = Math.max(0, WORLD.height - viewportHeight);
      this.cameraY = (Math.sin(t) * 0.5 + 0.5) * maxCam;
      this.plow.beaconPhase += clampedDt * 5;
      return;
    }

    if (this.gameState !== GameState.PLAYING) {
      return;
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= clampedDt;
      if (this.bannerTimer <= 0) {
        this.lastEventBanner = null;
      }
    }

    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - clampedDt * 24);
    }

    // Update active power-up durations
    for (const [type, remaining] of this.activePowerUps.entries()) {
      const next = remaining - clampedDt;
      if (next <= 0) {
        this.activePowerUps.delete(type);
      } else {
        this.activePowerUps.set(type, next);
      }
    }

    // Spawn power-ups periodically
    this.powerUpSpawnTimer -= clampedDt;
    if (this.powerUpSpawnTimer <= 0) {
      this.spawnPowerUp();
      this.powerUpSpawnTimer = 6.2;
    }

    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pu = this.powerUps[i];
      pu.pulsePhase += clampedDt * 4;
      pu.lifeTimer -= clampedDt;
      if (pu.lifeTimer <= 0) {
        this.powerUps.splice(i, 1);
      }
    }

    // Update snow regrowth (gentle drift back onto runway on higher waves/difficulty)
    this.updateSnowRegrowth(clampedDt);

    // Update plow movement & blade clearing
    this.updatePlow(clampedDt, viewportHeight);

    // Check power-up pickups
    this.checkPowerUpPickups();

    // Check bank collisions & De-icer melting
    this.updateSnowBanks(clampedDt);

    // Update particles, tire tracks, callouts
    this.updateEffects(clampedDt);

    // Recalculate runway clearance
    this.recalculateClearance();

    // Update incoming plane & approach sequence
    this.updateIncomingPlane(clampedDt);
  }

  private updateSnowflakes(dt: number, viewportWidth: number, viewportHeight: number): void {
    const wrapW = Math.max(WORLD.width, viewportWidth);
    const wrapH = Math.max(760, viewportHeight);
    const speedMult =
      this.difficulty === Difficulty.STANDARD
        ? 1
        : this.difficulty === Difficulty.BLIZZARD
          ? 1.45
          : 1.85;
    for (const flake of this.snowflakes) {
      flake.x += flake.vx * speedMult * dt;
      flake.y += flake.vy * speedMult * dt;
      if (flake.x < -10) flake.x = wrapW + 10;
      if (flake.x > wrapW + 20) flake.x = Math.random() * wrapW;
      if (flake.y > wrapH + 10) {
        flake.y = -10;
        flake.x = Math.random() * wrapW;
      }
    }
  }

  private updateSnowRegrowth(dt: number): void {
    const diffRate =
      this.difficulty === Difficulty.STANDARD
        ? 0.004
        : this.difficulty === Difficulty.BLIZZARD
          ? 0.0085
          : 0.013;
    const waveMult = 1 + (this.wave - 1) * 0.22;
    this.snowRegrowthAccum += dt * diffRate * waveMult;
    if (this.snowRegrowthAccum < 0.03) return;

    const addAmount = this.snowRegrowthAccum;
    this.snowRegrowthAccum = 0;

    // Sprinkle subtle snow on ~12% of cells per tick so regrowth looks natural
    for (let i = 0; i < this.snowGrid.length; i++) {
      if (Math.random() < 0.14) {
        this.snowGrid[i] = Math.min(1, this.snowGrid[i] + addAmount * (1.2 + Math.random()));
      }
    }
  }

  private updatePlow(dt: number, viewportHeight: number): void {
    const p = this.plow;
    p.beaconPhase += dt * 7.5;
    if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    if (p.dashActiveTimer > 0) p.dashActiveTimer = Math.max(0, p.dashActiveTimer - dt);

    const hasTurbo = this.activePowerUps.has(PowerUpType.TURBO);
    const hasWide = this.activePowerUps.has(PowerUpType.WIDE_BLADE);
    const hasDeIcer = this.activePowerUps.has(PowerUpType.DE_ICER);

    p.bladeWidth = hasWide ? 148 : 66;

    // Handle Dash trigger
    if (this.input.dashPressed && p.dashCooldown <= 0 && p.stunTimer <= 0) {
      p.dashActiveTimer = 0.28;
      p.dashCooldown = 3.0;
      soundEngine.playDash();
      this.spawnExhaustBurst(p.x, p.y, 12, '#F59E0B');
    }
    this.input.dashPressed = false;

    if (p.stunTimer > 0) {
      p.stunTimer = Math.max(0, p.stunTimer - dt);
      p.vx *= Math.pow(0.05, dt);
      p.vy *= Math.pow(0.05, dt);
    } else {
      let ix = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
      let iy = (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0);

      if (ix === 0 && iy === 0 && this.input.pointerActive) {
        const dx = this.input.pointerWorldX - p.x;
        const dy = this.input.pointerWorldY - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 16) {
          ix = dx / dist;
          iy = dy / dist;
        }
      }

      const len = Math.hypot(ix, iy);
      if (len > 0) {
        ix /= len;
        iy /= len;
      }

      const baseSpeed = 325;
      const turboMult = hasTurbo ? 1.65 : 1.0;
      const dashMult = p.dashActiveTimer > 0 ? 1.85 : 1.0;
      const targetSpeed = baseSpeed * turboMult * dashMult;

      const accel = 1850 * turboMult;
      const targetVx = ix * targetSpeed;
      const targetVy = iy * targetSpeed;

      // Smooth acceleration & crisp deceleration
      const blend = 1 - Math.exp(-12 * dt);
      p.vx += (targetVx - p.vx) * blend;
      p.vy += (targetVy - p.vy) * blend;
      if (len === 0 && Math.hypot(p.vx, p.vy) < 8) {
        p.vx = 0;
        p.vy = 0;
      }

      // Smoothly orient plow toward velocity vector
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 25) {
        const targetAngle = Math.atan2(p.vy, p.vx);
        let diff = targetAngle - p.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        p.angle += diff * Math.min(1, dt * 13);
      }

      void accel;
    }

    const prevX = p.x;
    const prevY = p.y;

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Clamp to airfield boundaries (shoulders allowed!)
    const marginX = 34;
    const marginY = 48;
    p.x = Math.max(marginX, Math.min(WORLD.width - marginX, p.x));
    p.y = Math.max(marginY, Math.min(WORLD.height - marginY, p.y));

    const speed = Math.hypot(p.vx, p.vy);

    // Leave subtle tire tracks when moving
    if (speed > 35 && Math.random() < 0.65) {
      const perpX = -Math.sin(p.angle) * 14;
      const perpY = Math.cos(p.angle) * 14;
      this.tireTracks.push(
        { x1: prevX + perpX, y1: prevY + perpY, x2: p.x + perpX, y2: p.y + perpY, alpha: 0.25 },
        { x1: prevX - perpX, y1: prevY - perpY, x2: p.x - perpX, y2: p.y - perpY, alpha: 0.25 }
      );
      if (this.tireTracks.length > 260) {
        this.tireTracks.splice(0, this.tireTracks.length - 260);
      }
    }

    // Turbo exhaust trail
    if ((hasTurbo || p.dashActiveTimer > 0) && speed > 40 && Math.random() < 0.8) {
      const backX = p.x - Math.cos(p.angle) * 34;
      const backY = p.y - Math.sin(p.angle) * 34;
      this.particles.push({
        x: backX + (Math.random() - 0.5) * 10,
        y: backY + (Math.random() - 0.5) * 10,
        vx: -Math.cos(p.angle) * 70 + (Math.random() - 0.5) * 40,
        vy: -Math.sin(p.angle) * 70 + (Math.random() - 0.5) * 40,
        size: 3 + Math.random() * 4,
        alpha: 0.85,
        life: 0.28,
        maxLife: 0.28,
        color: p.dashActiveTimer > 0 ? '#FBBF24' : '#F97316',
      });
    }

    // Plow snow ahead & around blade
    const bladeCenterX = p.x + Math.cos(p.angle) * 32;
    const bladeCenterY = p.y + Math.sin(p.angle) * 32;
    const clearRadius = p.bladeWidth * 0.56;
    const clearedVolume =
      this.clearSnowAt(bladeCenterX, bladeCenterY, clearRadius) +
      this.clearSnowAt(p.x, p.y, clearRadius * 0.72);

    if (hasDeIcer) {
      const meltRadius = 118;
      this.clearSnowAt(p.x, p.y, meltRadius);
      if (Math.random() < 0.45) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * meltRadius * 0.7;
        this.particles.push({
          x: p.x + Math.cos(ang) * r,
          y: p.y + Math.sin(ang) * r,
          vx: (Math.random() - 0.5) * 20,
          vy: -20 - Math.random() * 25,
          size: 2.5 + Math.random() * 3,
          alpha: 0.65,
          life: 0.45,
          maxLife: 0.45,
          color: '#34D399',
        });
      }
    }

    if (clearedVolume > 0.05) {
      this.addScore(clearedVolume * 14);
      soundEngine.playSnowScrape(Math.min(1, clearedVolume));

      // Throw snow spray particles sideways off blade edges
      const sprayCount = Math.min(6, Math.ceil(clearedVolume * 4));
      const perpX = -Math.sin(p.angle);
      const perpY = Math.cos(p.angle);
      for (let i = 0; i < sprayCount; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        this.particles.push({
          x: bladeCenterX + perpX * side * (p.bladeWidth * 0.42),
          y: bladeCenterY + perpY * side * (p.bladeWidth * 0.42),
          vx: perpX * side * (65 + Math.random() * 80) + p.vx * 0.15,
          vy: perpY * side * (65 + Math.random() * 80) + p.vy * 0.15,
          size: 2.5 + Math.random() * 3.5,
          alpha: 0.9,
          life: 0.35 + Math.random() * 0.25,
          maxLife: 0.55,
          color: '#F1F5F9',
        });
      }
    }

    // Smooth camera tracking with slight directional look-ahead
    const lookAheadY = Math.sin(p.angle) * 70;
    const targetCamY = p.y + lookAheadY - viewportHeight * 0.52;
    const maxCam = Math.max(0, WORLD.height - viewportHeight);
    const clampedTargetCam = Math.max(0, Math.min(maxCam, targetCamY));
    this.cameraY += (clampedTargetCam - this.cameraY) * Math.min(1, dt * 7);
  }

  private clearSnowAt(worldX: number, worldY: number, radius: number): number {
    const minCol = Math.max(
      0,
      Math.floor((worldX - radius - WORLD.shoulderWidth) / WORLD.cellWidth)
    );
    const maxCol = Math.min(
      WORLD.cols - 1,
      Math.floor((worldX + radius - WORLD.shoulderWidth) / WORLD.cellWidth)
    );
    const minRow = Math.max(0, Math.floor((worldY - radius) / WORLD.cellHeight));
    const maxRow = Math.min(WORLD.rows - 1, Math.floor((worldY + radius) / WORLD.cellHeight));

    let totalRemoved = 0;
    for (let r = minRow; r <= maxRow; r++) {
      const cy = r * WORLD.cellHeight + WORLD.cellHeight * 0.5;
      for (let c = minCol; c <= maxCol; c++) {
        const cx = WORLD.shoulderWidth + c * WORLD.cellWidth + WORLD.cellWidth * 0.5;
        const dist = Math.hypot(cx - worldX, cy - worldY);
        if (dist <= radius) {
          const idx = r * WORLD.cols + c;
          const prev = this.snowGrid[idx];
          if (prev > 0.02) {
            const strength = dist < radius * 0.72 ? 1.0 : 0.6;
            const next = Math.max(0, prev - strength);
            totalRemoved += prev - next;
            if (prev >= 0.35 && next < 0.35) {
              this.snowClearedCellsTotal++;
            }
            this.snowGrid[idx] = next;
          }
        }
      }
    }
    return totalRemoved;
  }

  private checkPowerUpPickups(): void {
    const p = this.plow;
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pu = this.powerUps[i];
      if (Math.hypot(p.x - pu.x, p.y - pu.y) < pu.radius + 30) {
        const cfg = POWER_UP_CONFIGS[pu.type];
        this.activePowerUps.set(pu.type, cfg.duration);
        this.addScore(150);
        soundEngine.playPowerUp();
        this.spawnCallout(pu.x, pu.y - 16, cfg.label.toUpperCase(), cfg.accentHex);
        this.spawnExhaustBurst(pu.x, pu.y, 16, cfg.accentHex);
        this.powerUps.splice(i, 1);
      }
    }
  }

  private updateSnowBanks(dt: number): void {
    const p = this.plow;
    const hasIcebreaker = this.activePowerUps.has(PowerUpType.ICEBREAKER);
    const hasDeIcer = this.activePowerUps.has(PowerUpType.DE_ICER);

    for (let i = this.banks.length - 1; i >= 0; i--) {
      const b = this.banks[i];
      if (b.shakeTimer > 0) b.shakeTimer = Math.max(0, b.shakeTimer - dt);

      // De-Icer thermal radius dissolves snow banks smoothly
      if (hasDeIcer && Math.hypot(p.x - b.x, p.y - b.y) < 110) {
        b.melting = true;
        b.hp -= dt * 1.4;
        if (b.hp <= 0) {
          this.addScore(150);
          this.banksSmashed++;
          this.spawnExhaustBurst(b.x, b.y, 14, '#34D399');
          this.spawnCallout(b.x, b.y - 14, 'MELTED +150', '#34D399');
          this.banks.splice(i, 1);
          continue;
        }
      } else {
        b.melting = false;
      }

      // Check physical collision box with plow
      const halfW = b.width * 0.5 + 18;
      const halfH = b.height * 0.5 + 22;
      const dx = p.x - b.x;
      const dy = p.y - b.y;

      if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) {
        if (hasIcebreaker) {
          // Smash straight through!
          this.addScore(250);
          this.banksSmashed++;
          this.screenShake = Math.max(this.screenShake, 5);
          soundEngine.playBankImpact(true);
          this.spawnExhaustBurst(b.x, b.y, 22, '#E2E8F0');
          this.spawnCallout(b.x, b.y - 16, 'SMASHED +250', '#A78BFA');
          this.banks.splice(i, 1);
          continue;
        }

        // Push plow safely outside bank overlap
        const overlapX = halfW - Math.abs(dx);
        const overlapY = halfH - Math.abs(dy);
        if (overlapX < overlapY) {
          p.x += dx >= 0 ? overlapX + 2 : -(overlapX + 2);
          p.vx = (dx >= 0 ? 1 : -1) * 180;
        } else {
          p.y += dy >= 0 ? overlapY + 2 : -(overlapY + 2);
          p.vy = (dy >= 0 ? 1 : -1) * 180;
        }

        if (p.invulnTimer <= 0) {
          p.stunTimer = 0.34;
          p.invulnTimer = 1.45;
          b.shakeTimer = 0.3;
          this.screenShake = 10;
          this.integrity = Math.max(0, this.integrity - 1);
          soundEngine.playBankImpact(false);
          this.spawnExhaustBurst(p.x, p.y, 16, '#F87171');
          this.spawnCallout(p.x, p.y - 24, 'SNOW BANK HIT!', '#F87171');
          this.pushBanner('Hit snow bank — shift left or right to avoid!', 'rose');

          if (this.integrity <= 0) {
            this.triggerGameOver();
            return;
          }
        }
      }
    }
  }

  private updateEffects(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.pow(0.2, dt);
      pt.vy *= Math.pow(0.2, dt);
      pt.life -= dt;
      pt.alpha = Math.max(0, pt.life / pt.maxLife);
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.tireTracks.length - 1; i >= 0; i--) {
      const tr = this.tireTracks[i];
      tr.alpha -= dt * 0.035;
      if (tr.alpha <= 0) this.tireTracks.splice(i, 1);
    }

    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      c.y -= dt * 34;
      c.life -= dt;
      if (c.life <= 0) this.callouts.splice(i, 1);
    }
  }

  private spawnExhaustBurst(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const spd = 70 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 3 + Math.random() * 4,
        alpha: 1,
        life: 0.42 + Math.random() * 0.25,
        maxLife: 0.65,
        color,
      });
    }
  }

  private recalculateClearance(): void {
    let totalCleared = 0;
    let centerCleared = 0;
    let centerCount = 0;

    for (let r = 0; r < WORLD.rows; r++) {
      for (let c = 0; c < WORLD.cols; c++) {
        const cleared = 1 - this.snowGrid[r * WORLD.cols + c];
        totalCleared += cleared;
        if (c >= 3 && c <= 11) {
          centerCleared += cleared;
          centerCount++;
        }
      }
    }

    this.totalClearancePct = Math.round((totalCleared / this.snowGrid.length) * 100);
    this.flightPathClearancePct = Math.round((centerCleared / centerCount) * 100);
  }

  private updateIncomingPlane(dt: number): void {
    const pl = this.plane;

    if (pl.phase === 'APPROACHING' || pl.phase === 'FINAL_APPROACH') {
      pl.timeRemaining = Math.max(0, pl.timeRemaining - dt);

      if (pl.timeRemaining <= 4.5 && pl.phase === 'APPROACHING') {
        pl.phase = 'FINAL_APPROACH';
        this.pushBanner(`${pl.flightCode} on Final Approach — shift clear of center!`, 'amber');
      }

      if (pl.phase === 'FINAL_APPROACH') {
        const sec = Math.ceil(pl.timeRemaining);
        if (sec !== this.lastApproachBeepSec && sec >= 1 && sec <= 4) {
          this.lastApproachBeepSec = sec;
          soundEngine.playApproachBeep(sec <= 2);
        }
      }

      if (pl.timeRemaining <= 0) {
        const runwaySafe = this.isReadyToLand();
        const plowInPath = this.isPlowInDangerCorridor();

        if (runwaySafe && !plowInPath) {
          pl.phase = 'TOUCHDOWN_PASS';
          pl.landingSuccess = true;
          pl.passY = WORLD.height + 260;
          pl.passAlpha = 1;
          this.waveTransitionTimer = 2.5;
          this.planesLanded++;
          const waveBonus = 900 + this.wave * 250 + Math.round(this.totalClearancePct * 6);
          this.addScore(waveBonus);
          soundEngine.playPlaneLanding(true);
          this.spawnCallout(
            WORLD.width / 2,
            this.cameraY + 260,
            `SAFE LANDING +${waveBonus}`,
            '#10B981'
          );
          this.pushBanner(
            `${pl.flightCode} landed safely! Preparing Wave ${this.wave + 1}...`,
            'emerald'
          );
        } else {
          pl.phase = 'GO_AROUND';
          pl.landingSuccess = false;
          pl.passY = WORLD.height + 260;
          pl.passAlpha = 1;
          this.waveTransitionTimer = 2.0;
          this.integrity = Math.max(0, this.integrity - 1);
          this.screenShake = 12;
          soundEngine.playPlaneLanding(false);

          const reason = !runwaySafe
            ? `${pl.flightCode} aborted! Runway below ${this.targetClearancePct}% cleared`
            : `${pl.flightCode} near-miss! Plow stayed in center path`;
          this.pushBanner(reason, 'rose');

          if (this.integrity <= 0) {
            this.triggerGameOver();
            return;
          }
        }
      }
    } else if (pl.phase === 'TOUCHDOWN_PASS' || pl.phase === 'GO_AROUND') {
      // Animate plane sweeping South -> North across the runway
      pl.passY -= dt * 1150;
      if (pl.landingSuccess && pl.passY < WORLD.height - 200 && pl.passY > 200) {
        if (Math.random() < 0.7) {
          // Tire touchdown smoke puffs
          this.particles.push(
            {
              x: WORLD.width / 2 - 26,
              y: pl.passY + 28,
              vx: -25 + (Math.random() - 0.5) * 20,
              vy: 40 + Math.random() * 30,
              size: 5 + Math.random() * 5,
              alpha: 0.75,
              life: 0.55,
              maxLife: 0.55,
              color: '#CBD5E1',
            },
            {
              x: WORLD.width / 2 + 26,
              y: pl.passY + 28,
              vx: 25 + (Math.random() - 0.5) * 20,
              vy: 40 + Math.random() * 30,
              size: 5 + Math.random() * 5,
              alpha: 0.75,
              life: 0.55,
              maxLife: 0.55,
              color: '#CBD5E1',
            }
          );
        }
      }

      this.waveTransitionTimer -= dt;
      if (this.waveTransitionTimer <= 0) {
        if (pl.landingSuccess) {
          this.setupWave(this.wave + 1, false);
          this.pushBanner(
            `Wave ${this.wave} · Target ${this.targetClearancePct}% for ${this.plane.flightCode}`,
            'amber'
          );
        } else {
          // Go-around gives 20s emergency second pass without wiping already-cleared snow!
          this.plane.phase = 'APPROACHING';
          this.plane.totalTime = 22;
          this.plane.timeRemaining = 22;
          this.lastApproachBeepSec = -1;
          this.pushBanner(
            `${this.plane.flightCode} circling back — 22s to finish clearing!`,
            'amber'
          );
        }
      }
    }
  }

  private triggerGameOver(): void {
    this.gameState = GameState.GAME_OVER;
    soundEngine.playGameOver();
  }

  public getHudSnapshot(): HudSnapshot {
    const activeList: ActivePowerUpState[] = [];
    for (const [type, remaining] of this.activePowerUps.entries()) {
      activeList.push({
        type,
        remaining,
        duration: POWER_UP_CONFIGS[type].duration,
      });
    }

    return {
      gameState: this.gameState,
      difficulty: this.difficulty,
      livery: this.livery,
      score: this.score,
      bestScore: this.bestScore,
      wave: this.wave,
      planesLanded: this.planesLanded,
      integrity: this.integrity,
      maxIntegrity: this.maxIntegrity,
      totalClearancePct: this.totalClearancePct,
      flightPathClearancePct: this.flightPathClearancePct,
      targetClearancePct: this.targetClearancePct,
      isReadyToLand: this.isReadyToLand(),
      plowInDangerCorridor: this.isPlowInDangerCorridor(),
      flightCode: this.plane.flightCode,
      aircraftName: this.plane.aircraftName,
      timeRemaining: this.plane.timeRemaining,
      totalWaveTime: this.plane.totalTime,
      planePhase: this.plane.phase,
      activePowerUps: activeList,
      dashCooldownRatio: Math.min(1, this.plow.dashCooldown / 3.0),
      snowClearedCellsTotal: this.snowClearedCellsTotal,
      banksSmashed: this.banksSmashed,
      lastEventBanner: this.lastEventBanner,
    };
  }

  // =========================================================================
  // MAIN CANVAS RENDERER
  // =========================================================================
  public render(
    ctx: CanvasRenderingContext2D,
    viewWidth: number,
    viewHeight: number,
    hudInsetRight: number = 0
  ): void {
    // Full-bleed winter airfield background across entire screen
    ctx.fillStyle = '#0B121D';
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    ctx.save();

    const { scale, offsetX, worldViewWidth, worldViewHeight: scaledViewHeight } =
      this.getViewportTransform(viewWidth, viewHeight, hudInsetRight);
    ctx.scale(scale, scale);

    // Screen shake offset
    const shakeX = this.screenShake > 0 ? (Math.random() - 0.5) * this.screenShake : 0;
    const shakeY = this.screenShake > 0 ? (Math.random() - 0.5) * this.screenShake : 0;

    ctx.translate(offsetX + shakeX, -this.cameraY + shakeY);

    // Extended snowy airfield outer apron spanning full viewport width
    ctx.fillStyle = '#0D1523';
    ctx.fillRect(-offsetX - 80, -80, worldViewWidth + 160, WORLD.height + 160);

    // Subtle taxiway cross-stubs on outer snow fields so wide screens feel alive
    ctx.fillStyle = '#141F30';
    for (let ty = 280; ty < WORLD.height - 200; ty += 560) {
      ctx.fillRect(-offsetX - 40, ty, offsetX + 40, 96);
      ctx.fillRect(WORLD.width, ty, worldViewWidth - offsetX - WORLD.width + 40, 96);
    }

    // 1. Snow-covered airfield shoulders (left & right apron)
    ctx.fillStyle = '#0F1826';
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    // Subtle snow-dusted grass/apron texture on shoulders
    ctx.fillStyle = '#182436';
    ctx.fillRect(8, 0, WORLD.shoulderWidth - 14, WORLD.height);
    ctx.fillRect(WORLD.width - WORLD.shoulderWidth + 6, 0, WORLD.shoulderWidth - 14, WORLD.height);

    // Safe pull-off shoulder markings during final approach
    const showSafeShoulder =
      this.plane.phase === 'FINAL_APPROACH' && this.gameState === GameState.PLAYING;
    if (showSafeShoulder) {
      const pulse = 0.16 + 0.12 * Math.sin(performance.now() * 0.012);
      ctx.fillStyle = `rgba(16, 185, 129, ${pulse})`;
      ctx.fillRect(10, 0, WORLD.shoulderWidth - 16, WORLD.height);
      ctx.fillRect(
        WORLD.width - WORLD.shoulderWidth + 6,
        0,
        WORLD.shoulderWidth - 16,
        WORLD.height
      );
    }

    // 2. Main Asphalt Runway Tarmac
    ctx.fillStyle = '#1C2532';
    ctx.fillRect(WORLD.shoulderWidth, 0, WORLD.runwayWidth, WORLD.height);

    // Subtle longitudinal asphalt seam lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    for (let lane = 1; lane < 5; lane++) {
      const lx = WORLD.shoulderWidth + (WORLD.runwayWidth / 5) * lane;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, WORLD.height);
      ctx.stroke();
    }

    // Runway Edge Solid Stripes
    ctx.fillStyle = 'rgba(241, 245, 249, 0.72)';
    ctx.fillRect(WORLD.shoulderWidth + 4, 24, 5, WORLD.height - 48);
    ctx.fillRect(WORLD.width - WORLD.shoulderWidth - 9, 24, 5, WORLD.height - 48);

    // Center Flight Path Corridor subtle guide lines (lanes 2-4)
    const flightLeftX = WORLD.shoulderWidth + 3 * WORLD.cellWidth;
    const flightRightX = WORLD.shoulderWidth + 12 * WORLD.cellWidth;
    ctx.save();
    ctx.setLineDash([18, 22]);
    ctx.strokeStyle = this.isReadyToLand()
      ? 'rgba(16, 185, 129, 0.35)'
      : 'rgba(245, 158, 11, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(flightLeftX, 110);
    ctx.lineTo(flightLeftX, WORLD.height - 110);
    ctx.moveTo(flightRightX, 110);
    ctx.lineTo(flightRightX, WORLD.height - 110);
    ctx.stroke();
    ctx.restore();

    // Threshold Piano Keys (North & South ends)
    ctx.fillStyle = 'rgba(248, 250, 252, 0.78)';
    for (let k = 0; k < 10; k++) {
      const kx = WORLD.shoulderWidth + 24 + k * 54;
      ctx.fillRect(kx, 26, 26, 66);
      ctx.fillRect(kx, WORLD.height - 92, 26, 66);
    }

    // Runway Designator Numbers ("23R" North, "05L" South)
    ctx.save();
    ctx.fillStyle = 'rgba(248, 250, 252, 0.52)';
    ctx.font = '700 54px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('05L', WORLD.width / 2, WORLD.height - 118);
    ctx.translate(WORLD.width / 2, 144);
    ctx.rotate(Math.PI);
    ctx.fillText('23R', 0, 0);
    ctx.restore();

    // Runway Centerline Dashed Markings
    ctx.fillStyle = 'rgba(248, 250, 252, 0.72)';
    for (let cy = 200; cy < WORLD.height - 200; cy += 96) {
      ctx.fillRect(WORLD.width / 2 - 4, cy, 8, 48);
    }

    // 3. Tire Tracks on cleared asphalt
    for (const tr of this.tireTracks) {
      ctx.strokeStyle = `rgba(12, 18, 28, ${tr.alpha})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(tr.x1, tr.y1);
      ctx.lineTo(tr.x2, tr.y2);
      ctx.stroke();
    }

    // 4. Snow Coverage Grid (only render visible rows for high FPS!)
    const startRow = Math.max(0, Math.floor(this.cameraY / WORLD.cellHeight) - 1);
    const endRow = Math.min(
      WORLD.rows - 1,
      Math.ceil((this.cameraY + scaledViewHeight) / WORLD.cellHeight) + 1
    );

    for (let r = startRow; r <= endRow; r++) {
      const y = r * WORLD.cellHeight;
      for (let c = 0; c < WORLD.cols; c++) {
        const depth = this.snowGrid[r * WORLD.cols + c];
        if (depth <= 0.04) continue;
        const x = WORLD.shoulderWidth + c * WORLD.cellWidth;

        // Crisp snowy tint with icy underside shading
        const alpha = Math.min(0.95, 0.22 + depth * 0.73);
        ctx.fillStyle = `rgba(226, 238, 249, ${alpha})`;
        ctx.fillRect(x - 0.5, y - 0.5, WORLD.cellWidth + 1, WORLD.cellHeight + 1);

        if (depth > 0.55) {
          ctx.fillStyle = `rgba(255, 255, 255, ${(depth - 0.5) * 0.45})`;
          ctx.fillRect(x + 3, y + 3, WORLD.cellWidth - 6, WORLD.cellHeight * 0.42);
        }
      }
    }

    // 5. Recessed Centerline & Edge Runway Lights (sit visibly above thin snow!)
    const ready = this.isReadyToLand();
    const nowSec = performance.now() * 0.001;
    for (let ly = 80; ly <= WORLD.height - 80; ly += 80) {
      if (ly < this.cameraY - 40 || ly > this.cameraY + scaledViewHeight + 40) continue;

      // Edge lights
      const edgeColor =
        ly < 300 || ly > WORLD.height - 300 ? '#F59E0B' : '#E2E8F0';
      ctx.fillStyle = edgeColor;
      ctx.beginPath();
      ctx.arc(WORLD.shoulderWidth - 10, ly, 4.5, 0, Math.PI * 2);
      ctx.arc(WORLD.width - WORLD.shoulderWidth + 10, ly, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Centerline approach lights (Emerald when safe, pulsing Amber during final approach)
      const seqWave = Math.sin(nowSec * 7 - ly * 0.025) > 0.35;
      if (ready) {
        ctx.fillStyle = seqWave ? '#34D399' : '#059669';
      } else if (this.plane.phase === 'FINAL_APPROACH') {
        ctx.fillStyle = seqWave ? '#FBBF24' : '#B45309';
      } else {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
      }
      ctx.beginPath();
      ctx.arc(WORLD.width / 2, ly, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Final Approach Center Warning Overlay on tarmac (only when plow is in danger path!)
    if (
      this.plane.phase === 'FINAL_APPROACH' &&
      this.isPlowInDangerCorridor() &&
      this.gameState === GameState.PLAYING
    ) {
      const flash = 0.22 + 0.16 * Math.sin(nowSec * 14);
      ctx.fillStyle = `rgba(239, 68, 68, ${flash})`;
      ctx.fillRect(flightLeftX, this.cameraY, flightRightX - flightLeftX, scaledViewHeight);

      ctx.fillStyle = '#FEF2F2';
      ctx.font = '700 22px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        '◄ SHIFT LEFT OR RIGHT — CLEAR FLIGHT PATH ►',
        WORLD.width / 2,
        this.plow.y - 68
      );
    }

    // 7. Snow Banks (Obstacles)
    for (const b of this.banks) {
      if (b.y < this.cameraY - 80 || b.y > this.cameraY + scaledViewHeight + 80) continue;
      this.renderSnowBank(ctx, b);
    }

    // 8. Power-Up Supply Crates
    for (const pu of this.powerUps) {
      if (pu.y < this.cameraY - 60 || pu.y > this.cameraY + scaledViewHeight + 60) continue;
      this.renderPowerUp(ctx, pu);
    }

    // 9. Snow Plow Truck
    if (this.gameState !== GameState.TITLE_MENU) {
      this.renderPlow(ctx, this.plow);
    }

    // 10. Particles & Floating Score Callouts
    for (const pt of this.particles) {
      ctx.globalAlpha = pt.alpha;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const c of this.callouts) {
      ctx.globalAlpha = Math.max(0, c.life / c.maxLife);
      ctx.font = '700 18px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#090D16';
      ctx.fillText(c.text, c.x + 1, c.y + 1);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, c.x, c.y);
    }
    ctx.globalAlpha = 1;

    // 11. Incoming Plane Flyover / Touchdown Pass
    if (
      this.plane.phase === 'TOUCHDOWN_PASS' ||
      this.plane.phase === 'GO_AROUND'
    ) {
      this.renderIncomingPlane(ctx, this.plane);
    }

    ctx.restore();

    // 12. Screen-space Falling Snowflakes
    ctx.save();
    ctx.scale(scale, scale);
    for (const f of this.snowflakes) {
      ctx.fillStyle = `rgba(241, 245, 249, ${f.alpha})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderSnowBank(ctx: CanvasRenderingContext2D, b: SnowBank): void {
    const sx = b.shakeTimer > 0 ? (Math.random() - 0.5) * 6 : 0;
    const x = b.x + sx;
    const y = b.y;
    const hw = b.width * 0.5;
    const hh = b.height * 0.5;

    ctx.save();
    // Drop shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.beginPath();
    ctx.roundRect(x - hw + 4, y - hh + 6, b.width, b.height, 14);
    ctx.fill();

    // Compacted icy blue-white drift mound
    const grad = ctx.createLinearGradient(x, y - hh, x, y + hh);
    grad.addColorStop(0, b.melting ? '#A7F3D0' : '#F8FAFC');
    grad.addColorStop(0.55, b.melting ? '#6EE7B7' : '#CBD5E1');
    grad.addColorStop(1, b.melting ? '#34D399' : '#94A3B8');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x - hw, y - hh, b.width, b.height, 14);
    ctx.fill();

    // Crisp icy ridge highlight
    ctx.strokeStyle = b.melting ? '#10B981' : '#60A5FA';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - hw + 10, y - 4);
    ctx.quadraticCurveTo(x, y - hh + 8, x + hw - 10, y - 3);
    ctx.stroke();

    // Orange airfield snow-stake markers at corners
    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.arc(x - hw + 7, y - hh + 7, 3.5, 0, Math.PI * 2);
    ctx.arc(x + hw - 7, y - hh + 7, 3.5, 0, Math.PI * 2);
    ctx.arc(x - hw + 7, y + hh - 7, 3.5, 0, Math.PI * 2);
    ctx.arc(x + hw - 7, y + hh - 7, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private renderPowerUp(ctx: CanvasRenderingContext2D, pu: PowerUpItem): void {
    const cfg = POWER_UP_CONFIGS[pu.type];
    const bob = Math.sin(pu.pulsePhase) * 3;
    const pulseR = pu.radius + 7 + Math.sin(pu.pulsePhase * 1.3) * 3;

    ctx.save();
    // Outer soft halo ring
    ctx.strokeStyle = cfg.accentHex;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y + bob, pulseR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1;
    // Supply pad circle
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(pu.x, pu.y + bob, pu.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = cfg.accentHex;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Crisp interior symbol
    ctx.fillStyle = cfg.accentHex;
    ctx.strokeStyle = cfg.accentHex;
    ctx.lineWidth = 2.2;
    const py = pu.y + bob;

    if (pu.type === PowerUpType.TURBO) {
      // Lightning bolt
      ctx.beginPath();
      ctx.moveTo(pu.x + 2, py - 10);
      ctx.lineTo(pu.x - 6, py + 1);
      ctx.lineTo(pu.x, py + 1);
      ctx.lineTo(pu.x - 3, py + 10);
      ctx.lineTo(pu.x + 7, py - 2);
      ctx.lineTo(pu.x + 1, py - 2);
      ctx.closePath();
      ctx.fill();
    } else if (pu.type === PowerUpType.WIDE_BLADE) {
      // Wide double arrow bar
      ctx.beginPath();
      ctx.moveTo(pu.x - 11, py);
      ctx.lineTo(pu.x + 11, py);
      ctx.moveTo(pu.x - 6, py - 5);
      ctx.lineTo(pu.x - 11, py);
      ctx.lineTo(pu.x - 6, py + 5);
      ctx.moveTo(pu.x + 6, py - 5);
      ctx.lineTo(pu.x + 11, py);
      ctx.lineTo(pu.x + 6, py + 5);
      ctx.stroke();
    } else if (pu.type === PowerUpType.DE_ICER) {
      // Thermal flame / heat ring
      ctx.beginPath();
      ctx.arc(pu.x, py + 2, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pu.x, py + 2, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Shield wedge
      ctx.beginPath();
      ctx.moveTo(pu.x, py - 9);
      ctx.lineTo(pu.x + 8, py - 4);
      ctx.lineTo(pu.x + 6, py + 5);
      ctx.lineTo(pu.x, py + 10);
      ctx.lineTo(pu.x - 6, py + 5);
      ctx.lineTo(pu.x - 8, py - 4);
      ctx.closePath();
      ctx.stroke();
    }

    // Short readable tag below
    const tag =
      pu.type === PowerUpType.TURBO
        ? 'TURBO'
        : pu.type === PowerUpType.WIDE_BLADE
          ? 'WIDE'
          : pu.type === PowerUpType.DE_ICER
            ? 'DE-ICE'
            : 'RAM';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(tag, pu.x, py + pu.radius + 14);

    ctx.restore();
  }

  private renderPlow(ctx: CanvasRenderingContext2D, p: PlowEntity): void {
    const hasWide = this.activePowerUps.has(PowerUpType.WIDE_BLADE);
    const hasIcebreaker = this.activePowerUps.has(PowerUpType.ICEBREAKER);
    const hasDeIcer = this.activePowerUps.has(PowerUpType.DE_ICER);
    const liveryCfg = PLOW_LIVERIES[this.livery];

    // Blink briefly during post-hit invulnerability
    if (p.invulnTimer > 0 && Math.floor(p.invulnTimer * 14) % 2 === 0) {
      ctx.save();
      ctx.globalAlpha = 0.45;
    } else {
      ctx.save();
    }

    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + Math.PI / 2);

    // De-Icer thermal aura ring
    if (hasDeIcer) {
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 108, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Dual LED headlight beams cutting forward
    const beamGrad = ctx.createLinearGradient(0, -30, 0, -165);
    beamGrad.addColorStop(0, 'rgba(254, 249, 195, 0.32)');
    beamGrad.addColorStop(1, 'rgba(254, 249, 195, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(-14, -28);
    ctx.lineTo(-42, -165);
    ctx.lineTo(42, -165);
    ctx.lineTo(14, -28);
    ctx.closePath();
    ctx.fill();

    // Tires (4 corners)
    ctx.fillStyle = '#090D16';
    ctx.fillRect(-23, -18, 6, 15);
    ctx.fillRect(17, -18, 6, 15);
    ctx.fillRect(-23, 10, 6, 17);
    ctx.fillRect(17, 10, 6, 17);

    // Truck rear hopper / salt bed
    ctx.fillStyle = liveryCfg.hopperHex;
    ctx.beginPath();
    ctx.roundRect(-18, -2, 36, 30, 5);
    ctx.fill();

    // Accent trim stripe on rear bed & cab hood
    ctx.fillStyle = liveryCfg.stripeHex;
    ctx.fillRect(-15, 22, 30, 4);
    ctx.fillRect(-4, -25, 8, 22);

    // Cab chassis
    ctx.fillStyle = liveryCfg.cabHex;
    ctx.beginPath();
    ctx.roundRect(-18, -26, 36, 26, 6);
    ctx.fill();

    // Center livery racing/fleet stripe over cab roof
    ctx.fillStyle = liveryCfg.stripeHex;
    ctx.fillRect(-4, -14, 8, 12);

    // Windshield
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(-14, -23, 28, 10, 3);
    ctx.fill();

    // Rotating roof strobe beacon
    const beaconGlow = 0.55 + 0.45 * Math.sin(p.beaconPhase);
    ctx.fillStyle = `rgba(${liveryCfg.beaconGlowRgb}, ${beaconGlow * 0.38})`;
    ctx.beginPath();
    ctx.arc(0, -10, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = liveryCfg.beaconCoreHex;
    ctx.beginPath();
    ctx.arc(0, -10, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Front Steel Plow Blade
    const halfBlade = p.bladeWidth * 0.5;
    // Hydraulic push arms
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-10, -24);
    ctx.lineTo(-14, -36);
    ctx.moveTo(10, -24);
    ctx.lineTo(14, -36);
    ctx.stroke();

    // Curved plow moldboard
    ctx.fillStyle = hasIcebreaker ? '#A78BFA' : hasWide ? '#38BDF8' : liveryCfg.bladeHex;
    ctx.beginPath();
    ctx.moveTo(-halfBlade, -32);
    ctx.quadraticCurveTo(0, -44, halfBlade, -32);
    ctx.lineTo(halfBlade - 4, -40);
    ctx.quadraticCurveTo(0, -52, -halfBlade + 4, -40);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Icebreaker front ram shield aura
    if (hasIcebreaker) {
      ctx.strokeStyle = '#C4B5FD';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, -6, halfBlade + 10, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderIncomingPlane(ctx: CanvasRenderingContext2D, pl: IncomingPlane): void {
    const cx = WORLD.width / 2;
    const cy = pl.passY;

    ctx.save();
    // Ground shadow offset slightly to bottom-right
    ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
    this.drawAircraftShape(ctx, cx + 26, cy + 28, 1.04);

    // Aircraft fuselage & swept wings
    ctx.fillStyle = pl.landingSuccess ? '#F8FAFC' : '#FECACA';
    this.drawAircraftShape(ctx, cx, cy, 1.0);

    // Twin engine nacelles
    ctx.fillStyle = '#475569';
    ctx.fillRect(cx - 56, cy - 12, 14, 28);
    ctx.fillRect(cx + 42, cy - 12, 14, 28);

    // Cockpit glass
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(cx, cy - 82, 9, Math.PI, 0);
    ctx.fill();

    // Wingtip Navigation Lights (Red port, Green starboard)
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(cx - 148, cy + 32, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(cx + 148, cy + 32, 5, 0, Math.PI * 2);
    ctx.fill();

    // Bright Landing Headlights sweeping ahead
    const lightGrad = ctx.createLinearGradient(cx, cy - 95, cx, cy - 290);
    lightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
    lightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = lightGrad;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 92);
    ctx.lineTo(cx - 80, cy - 290);
    ctx.lineTo(cx + 80, cy - 290);
    ctx.lineTo(cx + 12, cy - 92);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private drawAircraftShape(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scale: number
  ): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // Main swept wings
    ctx.beginPath();
    ctx.moveTo(-16, -24);
    ctx.lineTo(-150, 26);
    ctx.lineTo(-150, 40);
    ctx.lineTo(-16, 16);
    ctx.lineTo(16, 16);
    ctx.lineTo(150, 40);
    ctx.lineTo(150, 26);
    ctx.lineTo(16, -24);
    ctx.closePath();
    ctx.fill();

    // Tail stabilizers
    ctx.beginPath();
    ctx.moveTo(-8, 72);
    ctx.lineTo(-56, 98);
    ctx.lineTo(-56, 108);
    ctx.lineTo(0, 96);
    ctx.lineTo(56, 108);
    ctx.lineTo(56, 98);
    ctx.lineTo(8, 72);
    ctx.closePath();
    ctx.fill();

    // Fuselage tube
    ctx.beginPath();
    ctx.roundRect(-17, -104, 34, 210, 17);
    ctx.fill();

    ctx.restore();
  }

  // =========================================================================
  // FULL-RUNWAY TACTICAL RADAR RENDERER
  // =========================================================================
  public renderRadar(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.clearRect(0, 0, w, h);

    // Background apron
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, w, h);

    const padX = 12;
    const rw = w - padX * 2;
    const cellW = rw / WORLD.cols;
    const cellH = h / WORLD.rows;

    // Runway base
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(padX, 0, rw, h);

    // Snow grid cells
    for (let r = 0; r < WORLD.rows; r++) {
      for (let c = 0; c < WORLD.cols; c++) {
        const depth = this.snowGrid[r * WORLD.cols + c];
        if (depth > 0.15) {
          ctx.fillStyle = `rgba(226, 238, 249, ${0.18 + depth * 0.65})`;
          ctx.fillRect(padX + c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
    }

    // Center flight path guide
    ctx.strokeStyle = this.isReadyToLand()
      ? 'rgba(16, 185, 129, 0.5)'
      : 'rgba(245, 158, 11, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(padX + 3 * cellW, 2, 9 * cellW, h - 4);

    // Snow banks
    ctx.fillStyle = '#F97316';
    for (const b of this.banks) {
      const rx = ((b.x - WORLD.shoulderWidth) / WORLD.runwayWidth) * rw + padX;
      const ry = (b.y / WORLD.height) * h;
      const bw = Math.max(4, (b.width / WORLD.runwayWidth) * rw);
      ctx.fillRect(rx - bw / 2, ry - 2, bw, 4);
    }

    // Power-ups
    for (const pu of this.powerUps) {
      const rx = ((pu.x - WORLD.shoulderWidth) / WORLD.runwayWidth) * rw + padX;
      const ry = (pu.y / WORLD.height) * h;
      ctx.fillStyle = POWER_UP_CONFIGS[pu.type].accentHex;
      ctx.beginPath();
      ctx.arc(rx, ry, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Viewport frame indicator
    const viewY = (this.cameraY / WORLD.height) * h;
    const viewH = (760 / WORLD.height) * h;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(padX - 2, viewY, rw + 4, Math.min(h - viewY, viewH));

    // Plow marker
    const px = ((this.plow.x - WORLD.shoulderWidth) / WORLD.runwayWidth) * rw + padX;
    const py = (this.plow.y / WORLD.height) * h;
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(Math.max(4, Math.min(w - 4, px)), py, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
