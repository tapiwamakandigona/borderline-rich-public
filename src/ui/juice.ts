// Every "game feel" tunable lives here (ART_BIBLE juice rules). Reduced motion turns off shake
// and particles but keeps sound and count-ups.
export const JUICE = {
  /** fraction of the gap the money counter closes per second (exponential ease-out) */
  countUpRate: 9,
  /** floating "+$" numbers */
  popMs: 900,
  pitchVariation: 0.08,
  /** camera trauma added per moment (decays in < 0.4 s) */
  shake: { buy: 0.35, upgradeMilestone: 0.45, rankUp: 0.6, bad: 0.4, collect: 0.12 },
  coins: { collect: 10, buy: 18, hustle: 3 },
  /** hustle combo: pitch rises per consecutive tap, capped */
  comboPitchStep: 0.025,
  comboPitchMax: 1.5,
  /** auto-collect radius when walking past your own business (metres) */
  autoCollectRadius: 7,
  /** deal radius without a broker (metres from the lot edge) */
  dealRadius: 26,
  longPressMs: 550,
  reducedMotion: false,
};

export function setReducedMotion(on: boolean): void { JUICE.reducedMotion = on; }
