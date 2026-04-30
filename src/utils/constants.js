export const API_URL = 'https://api.tarkov.dev/graphql';

// Fuel consumption: 1 point every 758 seconds without solar, 1516 with solar
export const FUEL_SECONDS_PER_UNIT = 758;
export const FUEL_SECONDS_PER_UNIT_SOLAR = 1516;

// Fuel tank capacities
export const FUEL_TANKS = {
  expeditionary: { name: 'Expeditionary fuel tank', capacity: 60 },
  metal: { name: 'Metal fuel tank', capacity: 100 },
};

// Flea market fee coefficients
export const FEE_BASE_RATE = 0.03; // Ti = Tr = 0.03
export const FEE_EXPONENT_MODIFIER = 1.08; // applied when condition is met

// Intel Center lvl 3 discount: 30% base + 0.3% per hideout mgmt level, max 45% total
export const INTEL_CENTER_FEE_DISCOUNT_BASE = 0.30;
export const INTEL_CENTER_FEE_DISCOUNT_PER_MGMT = 0.003;
export const INTEL_CENTER_FEE_DISCOUNT_MAX = 0.45;

// Hideout management skill: 0.5% fuel savings per level
export const HIDEOUT_MGMT_FUEL_REDUCTION_PER_LEVEL = 0.005;

// Station display names / ordering
export const STATIONS = [
  { id: 'all', name: 'All Stations' },
  { id: 'booze-generator', name: 'Booze Generator' },
  { id: 'intelligence-center', name: 'Intelligence Center' },
  { id: 'lavatory', name: 'Lavatory' },
  { id: 'medstation', name: 'Medstation' },
  { id: 'nutrition-unit', name: 'Nutrition Unit' },
  { id: 'water-collector', name: 'Water Collector' },
  { id: 'workbench', name: 'Workbench' },
];

// Max station levels
export const MAX_STATION_LEVEL = 3;

// Fuel item IDs (tarkov.dev)
export const FUEL_ITEM_NAMES = [
  'Expeditionary fuel tank',
  'Metal fuel tank',
];

export const DEFAULT_SETTINGS = {
  playerLevel: 15,
  hideFleaLocked: true,
  hideoutMgmtLevel: 0,
  intelCenterLevel: 0,
  solarPower: false,
  fuelType: 'expeditionary',
  includeFuelCost: true,
  sortBy: 'profitPerHour', // 'profitPerHour' or 'totalProfit'
  playWindowEnabled: false,
  playWindowStart: '21:00',
  playWindowEnd: '23:30',
  playWindowDays: [0, 1, 2, 3, 4, 5, 6], // 0=Sun, 1=Mon, ... 6=Sat
};
