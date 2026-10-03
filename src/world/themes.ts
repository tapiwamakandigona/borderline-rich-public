// Per-region art direction (pure data, no three.js import, so tests can check distinctness).
import type { RegionId } from '../core/types';

export type WindowStyle = 'shutter' | 'adobe' | 'curtain' | 'clapboard' | 'arched' | 'brick';
export type RoofStyle = 'terracotta' | 'adobe' | 'flat' | 'gable' | 'hip' | 'sawtooth';
export type Vegetation = 'cypress' | 'cactus' | 'street' | 'oak' | 'palm' | 'pine';
export type Outskirts = 'hills' | 'mesas' | 'skyline' | 'fields' | 'islands' | 'mountains';
export type Weather = 'none' | 'dust' | 'rain' | 'snow';

export interface SkyPair { zenith: number; horizon: number; }
export interface Theme {
  id: RegionId;
  sky: { day: SkyPair; dusk: SkyPair; night: SkyPair };
  sunColor: number;
  duskSun: number;
  sunIntensity: number;
  hemi: { sky: number; ground: number; intensity: number };
  fogNear: number;
  fogFar: number;
  ground: number;
  groundAlt: number;
  lotGround: number;
  plaza: number;
  asphalt: number;
  roadLine: number;
  sidewalk: number;
  walls: number[];
  roofs: number[];
  trims: number[];
  accents: number[];
  glass: number[];
  windowStyle: WindowStyle;
  roofStyle: RoofStyle;
  heightMult: number;
  vegetation: Vegetation[];
  treeColors: number[];
  treeDensity: number;
  water: { deep: number; shallow: number } | null;
  outskirts: Outskirts;
  weather: Weather;
  neon: boolean;
  lampColor: number;
  windowGlow: number;
  snowRoofs: boolean;
}

export const THEMES: Record<RegionId, Theme> = {
  solenne: {
    id: 'solenne',
    sky: { day: { zenith: 0x5fa9d8, horizon: 0xf6e3c2 }, dusk: { zenith: 0x34558c, horizon: 0xf2a65a }, night: { zenith: 0x0a1530, horizon: 0x25395f } },
    sunColor: 0xfff0d2, duskSun: 0xffa868, sunIntensity: 2.6,
    hemi: { sky: 0xcfe6f2, ground: 0xb79c74, intensity: 1.15 },
    fogNear: 220, fogFar: 900,
    ground: 0xcdb990, groundAlt: 0xb9a57c, lotGround: 0xe2d4b8, plaza: 0xe9dcc3,
    asphalt: 0x5d5a57, roadLine: 0xf3ead7, sidewalk: 0xd8cbb2,
    walls: [0xf4efe6, 0xefe2cc, 0xf7f1e7, 0xe8d6b8, 0xf1e3cf, 0xe6c7a0],
    roofs: [0xc8553d, 0xb84a33, 0xd26a4c, 0xbf5a3a],
    trims: [0xffffff, 0xe3d8c6],
    accents: [0x1f8a8a, 0x2a6fa8, 0xf2c14e, 0xc8553d, 0x3e7cb1],
    glass: [0x6f9fb8, 0x5d8aa3],
    windowStyle: 'shutter', roofStyle: 'terracotta', heightMult: 1,
    vegetation: ['cypress', 'palm'], treeColors: [0x3f5e3a, 0x4d6b3c, 0x5b7a43], treeDensity: 1,
    water: { deep: 0x0d5c7a, shallow: 0x37aab8 },
    outskirts: 'hills', weather: 'none', neon: false, lampColor: 0xffd59a, windowGlow: 0xffcf8a, snowRoofs: false,
  },
  redmesa: {
    id: 'redmesa',
    sky: { day: { zenith: 0x6cb6d6, horizon: 0xf6cf9c }, dusk: { zenith: 0x47468a, horizon: 0xf0844a }, night: { zenith: 0x110d22, horizon: 0x3a2840 } },
    sunColor: 0xffe2b5, duskSun: 0xff8a4a, sunIntensity: 2.9,
    hemi: { sky: 0xf0dcc0, ground: 0xb2774a, intensity: 1.1 },
    fogNear: 180, fogFar: 780,
    ground: 0xdcae74, groundAlt: 0xc9965c, lotGround: 0xd8a771, plaza: 0xe2bb88,
    asphalt: 0x6b5d52, roadLine: 0xf2d38a, sidewalk: 0xc99a6a,
    walls: [0xd49a6a, 0xc98a5a, 0xdba67a, 0xc27c4e, 0xe0b48a, 0xcf9466],
    roofs: [0xb77447, 0xa8653c, 0xc58556],
    trims: [0x7a4f34, 0x5f4030],
    accents: [0xb5562e, 0x2f7f8f, 0xe8c15a, 0x7a8f5b, 0xd1495b],
    glass: [0x5e8c96, 0x4d7680],
    windowStyle: 'adobe', roofStyle: 'adobe', heightMult: 0.75,
    vegetation: ['cactus'], treeColors: [0x6f8f4e, 0x7a9a55, 0x5f7f45], treeDensity: 0.55,
    water: null,
    outskirts: 'mesas', weather: 'dust', neon: false, lampColor: 0xffc27a, windowGlow: 0xffb866, snowRoofs: false,
  },
  neonvale: {
    id: 'neonvale',
    sky: { day: { zenith: 0x58739f, horizon: 0xc9d3e2 }, dusk: { zenith: 0x24285a, horizon: 0xe3869f }, night: { zenith: 0x04050d, horizon: 0x1c1d3c } },
    sunColor: 0xe9eefc, duskSun: 0xff9aa8, sunIntensity: 2.0,
    hemi: { sky: 0xaab8d6, ground: 0x343a4a, intensity: 1.05 },
    fogNear: 160, fogFar: 760,
    ground: 0x3a4150, groundAlt: 0x323846, lotGround: 0x4a5162, plaza: 0x596173,
    asphalt: 0x23262e, roadLine: 0xe8eefc, sidewalk: 0x6d7484,
    walls: [0x8a93a3, 0x6f7787, 0xa3abb9, 0x5c6474, 0x9aa0ad],
    roofs: [0x2b2f3a, 0x3a4150, 0x30343f],
    trims: [0xcfd5e0, 0x9aa3b3],
    accents: [0xff3e9a, 0x3df2ff, 0xa46bff, 0xffd23f, 0x2bff88],
    glass: [0x5fa8c8, 0x4f7fa8, 0x7fc4d8, 0x3d6a8c, 0x6a8fd0],
    windowStyle: 'curtain', roofStyle: 'flat', heightMult: 1.7,
    vegetation: ['street'], treeColors: [0x2f5d4a, 0x3a6b55], treeDensity: 0.45,
    water: { deep: 0x0d2033, shallow: 0x1d4a66 },
    outskirts: 'skyline', weather: 'rain', neon: true, lampColor: 0xcfe6ff, windowGlow: 0xcfe2ff, snowRoofs: false,
  },
  amberfield: {
    id: 'amberfield',
    sky: { day: { zenith: 0x72bbeb, horizon: 0xfbe6b2 }, dusk: { zenith: 0x4a6aa5, horizon: 0xffb06a }, night: { zenith: 0x0c182c, horizon: 0x2c3d58 } },
    sunColor: 0xfff0c8, duskSun: 0xffa45c, sunIntensity: 2.7,
    hemi: { sky: 0xd5ecf7, ground: 0x7d8f4a, intensity: 1.15 },
    fogNear: 230, fogFar: 950,
    ground: 0x8fb35a, groundAlt: 0x7aa04a, lotGround: 0x9cbd66, plaza: 0xd8cfb4,
    asphalt: 0x5b5d5f, roadLine: 0xf1d36a, sidewalk: 0xcfc6ae,
    walls: [0xf1e6cf, 0xe9dcc0, 0xf6f1e4, 0xd9c6a3, 0xc9d6c2, 0xe7d3b0],
    roofs: [0xa63a2b, 0x5f6b73, 0x7a4b3a, 0x3f4f5a, 0x8c3a2e],
    trims: [0xffffff, 0xf3ede0],
    accents: [0xe8c15a, 0xa63a2b, 0x2f6f8f, 0x606c38],
    glass: [0x7f9fb0, 0x6d8c9c],
    windowStyle: 'clapboard', roofStyle: 'gable', heightMult: 0.7,
    vegetation: ['oak'], treeColors: [0x5f8a3a, 0x7a9a3a, 0xc9a23a, 0x4f7a32], treeDensity: 1.2,
    water: null,
    outskirts: 'fields', weather: 'none', neon: false, lampColor: 0xffd28a, windowGlow: 0xffd08a, snowRoofs: false,
  },
  verano: {
    id: 'verano',
    sky: { day: { zenith: 0x36b6ec, horizon: 0xfff0d4 }, dusk: { zenith: 0x3a62a8, horizon: 0xffa883 }, night: { zenith: 0x081633, horizon: 0x223f68 } },
    sunColor: 0xfff6e0, duskSun: 0xff9c7a, sunIntensity: 2.9,
    hemi: { sky: 0xd2f1fb, ground: 0xe0cfa0, intensity: 1.2 },
    fogNear: 240, fogFar: 1000,
    ground: 0xf0e2bd, groundAlt: 0xe5d3a6, lotGround: 0xf3e8cc, plaza: 0xf6eedb,
    asphalt: 0x6a6763, roadLine: 0xffffff, sidewalk: 0xece0c6,
    walls: [0xa8e6cf, 0xffb3c1, 0xffe29a, 0xbde0fe, 0xffd6a5, 0xcdb4db, 0xfdfcdc],
    roofs: [0xe76f51, 0xf4a261, 0xfafafa, 0xd65a3a],
    trims: [0xffffff],
    accents: [0x2ec4c9, 0xff7f66, 0xffd23f, 0x0077b6, 0xe76f51],
    glass: [0x7fd0e0, 0x5fbcd0],
    windowStyle: 'arched', roofStyle: 'hip', heightMult: 0.8,
    vegetation: ['palm'], treeColors: [0x3f8f4a, 0x4fa055, 0x2f7f45], treeDensity: 1.4,
    water: { deep: 0x0a6a8a, shallow: 0x3fd8cf },
    outskirts: 'islands', weather: 'none', neon: false, lampColor: 0xffdca8, windowGlow: 0xffd59a, snowRoofs: false,
  },
  ironhold: {
    id: 'ironhold',
    sky: { day: { zenith: 0x8ea6c0, horizon: 0xe4eaf0 }, dusk: { zenith: 0x4a5878, horizon: 0xeead78 }, night: { zenith: 0x0a1120, horizon: 0x283246 } },
    sunColor: 0xf2f4ff, duskSun: 0xffb27a, sunIntensity: 2.2,
    hemi: { sky: 0xdfe7f0, ground: 0xb9c2cc, intensity: 1.2 },
    fogNear: 150, fogFar: 700,
    ground: 0xe6ecf1, groundAlt: 0xd3dbe3, lotGround: 0xdfe5ea, plaza: 0xc9c2b8,
    asphalt: 0x45484d, roadLine: 0xf2c46a, sidewalk: 0xb8bcc2,
    walls: [0x8e3b2e, 0x7a3328, 0x9c4a36, 0x6f6a66, 0x5c6770, 0x84402f],
    roofs: [0x4a525c, 0x3a4048, 0x55606b],
    trims: [0xc9c2b8, 0xa8a29a],
    accents: [0xffb347, 0x2f6f8f, 0xc8553d, 0x5c677d],
    glass: [0x6f8396, 0x5a6e80],
    windowStyle: 'brick', roofStyle: 'sawtooth', heightMult: 1,
    vegetation: ['pine'], treeColors: [0x2f4f3a, 0x3a5a44, 0x284634], treeDensity: 1,
    water: null,
    outskirts: 'mountains', weather: 'snow', neon: false, lampColor: 0xffb75e, windowGlow: 0xffc070, snowRoofs: true,
  },
};

/** Business-category signage colours (awnings, signs) shared across regions. */
export const CATEGORY_ACCENT: Record<string, number> = {
  food: 0xd9483b, retail: 0xc2408f, services: 0x2a9d8f, hospitality: 0x264f8f, industry: 0x6b7280,
  logistics: 0xe07a1f, tech: 0x2bb7d9, finance: 0xc9a227, agri: 0x5f9a3a, energy: 0xe8b02a,
};
