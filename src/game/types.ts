export enum GameState {
  TITLE_MENU = 'TITLE_MENU',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
}

export enum Difficulty {
  STANDARD = 'STANDARD',
  BLIZZARD = 'BLIZZARD',
  GALE_FORCE = 'GALE_FORCE',
}

export enum PlowLiveryId {
  AIRFIELD_AMBER = 'AIRFIELD_AMBER',
  ARCTIC_RESCUE = 'ARCTIC_RESCUE',
  POLAR_NIGHT = 'POLAR_NIGHT',
}

export interface PlowLiveryConfig {
  id: PlowLiveryId;
  name: string;
  subtitle: string;
  cabHex: string;
  hopperHex: string;
  stripeHex: string;
  bladeHex: string;
  beaconGlowRgb: string;
  beaconCoreHex: string;
}

export const PLOW_LIVERIES: Record<PlowLiveryId, PlowLiveryConfig> = {
  [PlowLiveryId.AIRFIELD_AMBER]: {
    id: PlowLiveryId.AIRFIELD_AMBER,
    name: 'Airfield Amber',
    subtitle: 'High-vis ops yellow & slate',
    cabHex: '#F59E0B',
    hopperHex: '#334155',
    stripeHex: '#FBBF24',
    bladeHex: '#E2E8F0',
    beaconGlowRgb: '251, 191, 36',
    beaconCoreHex: '#FEF3C7',
  },
  [PlowLiveryId.ARCTIC_RESCUE]: {
    id: PlowLiveryId.ARCTIC_RESCUE,
    name: 'Arctic Rescue',
    subtitle: 'Emergency crimson & glacier white',
    cabHex: '#DC2626',
    hopperHex: '#E2E8F0',
    stripeHex: '#F97316',
    bladeHex: '#F1F5F9',
    beaconGlowRgb: '248, 113, 113',
    beaconCoreHex: '#FEE2E2',
  },
  [PlowLiveryId.POLAR_NIGHT]: {
    id: PlowLiveryId.POLAR_NIGHT,
    name: 'Polar Night',
    subtitle: 'Cobalt blue & ice cyan trim',
    cabHex: '#0284C7',
    hopperHex: '#1E293B',
    stripeHex: '#38BDF8',
    bladeHex: '#BAE6FD',
    beaconGlowRgb: '56, 189, 248',
    beaconCoreHex: '#E0F2FE',
  },
};

export enum PowerUpType {
  TURBO = 'TURBO',
  WIDE_BLADE = 'WIDE_BLADE',
  DE_ICER = 'DE_ICER',
  ICEBREAKER = 'ICEBREAKER',
}

export interface PowerUpConfig {
  type: PowerUpType;
  label: string;
  shortDesc: string;
  duration: number; // seconds
  color: string;
  accentHex: string;
}

export const POWER_UP_CONFIGS: Record<PowerUpType, PowerUpConfig> = {
  [PowerUpType.TURBO]: {
    type: PowerUpType.TURBO,
    label: 'Turbo Turbine',
    shortDesc: '+65% plow speed',
    duration: 7,
    color: 'amber',
    accentHex: '#F59E0B',
  },
  [PowerUpType.WIDE_BLADE]: {
    type: PowerUpType.WIDE_BLADE,
    label: 'Wide Wing Blade',
    shortDesc: '2.3x clearing width',
    duration: 8,
    color: 'sky',
    accentHex: '#38BDF8',
  },
  [PowerUpType.DE_ICER]: {
    type: PowerUpType.DE_ICER,
    label: 'Thermal De-Icer',
    shortDesc: 'Melts nearby snow & banks',
    duration: 7,
    color: 'emerald',
    accentHex: '#10B981',
  },
  [PowerUpType.ICEBREAKER]: {
    type: PowerUpType.ICEBREAKER,
    label: 'Icebreaker Ram',
    shortDesc: 'Smash snow banks safely',
    duration: 6,
    color: 'violet',
    accentHex: '#A78BFA',
  },
};

export interface WorldConfig {
  width: number;
  height: number;
  shoulderWidth: number;
  runwayWidth: number;
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
}

export const WORLD: WorldConfig = {
  width: 760,
  height: 1760,
  shoulderWidth: 90,
  runwayWidth: 580,
  cols: 15,
  rows: 44,
  cellWidth: 580 / 15,
  cellHeight: 1760 / 44,
};

export interface PlowEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // radians, -PI/2 = facing UP (North)
  width: number;
  height: number;
  bladeWidth: number;
  stunTimer: number;
  invulnTimer: number;
  dashCooldown: number;
  dashActiveTimer: number;
  beaconPhase: number;
}

export interface SnowBank {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  shakeTimer: number;
  melting: boolean;
}

export interface PowerUpItem {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  radius: number;
  pulsePhase: number;
  lifeTimer: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface SnowFlake {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

export interface TireTrack {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
}

export interface IncomingPlane {
  flightCode: string;
  aircraftName: string;
  totalTime: number;
  timeRemaining: number;
  phase: 'APPROACHING' | 'FINAL_APPROACH' | 'TOUCHDOWN_PASS' | 'GO_AROUND';
  passY: number; // animated Y coordinate during flyover/rollout
  passAlpha: number;
  landingSuccess: boolean;
  expedited: boolean;
}

export interface ActivePowerUpState {
  type: PowerUpType;
  remaining: number;
  duration: number;
}

export interface FloatingCallout {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface HudSnapshot {
  gameState: GameState;
  difficulty: Difficulty;
  livery: PlowLiveryId;
  score: number;
  bestScore: number;
  wave: number;
  planesLanded: number;
  integrity: number;
  maxIntegrity: number;
  totalClearancePct: number;
  flightPathClearancePct: number;
  targetClearancePct: number;
  isReadyToLand: boolean;
  plowInDangerCorridor: boolean;
  flightCode: string;
  aircraftName: string;
  timeRemaining: number;
  totalWaveTime: number;
  planePhase: IncomingPlane['phase'];
  activePowerUps: ActivePowerUpState[];
  dashCooldownRatio: number; // 0 = ready, 1 = full cooldown
  snowClearedCellsTotal: number;
  banksSmashed: number;
  lastEventBanner: {
    text: string;
    tone: 'emerald' | 'amber' | 'rose';
    key: number;
  } | null;
}
