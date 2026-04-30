import {
  FUEL_SECONDS_PER_UNIT,
  FUEL_SECONDS_PER_UNIT_SOLAR,
  FUEL_TANKS,
  FEE_BASE_RATE,
  FEE_EXPONENT_MODIFIER,
  INTEL_CENTER_FEE_DISCOUNT_BASE,
  INTEL_CENTER_FEE_DISCOUNT_PER_MGMT,
  INTEL_CENTER_FEE_DISCOUNT_MAX,
  HIDEOUT_MGMT_FUEL_REDUCTION_PER_LEVEL,
} from './constants.js';

/**
 * Get the cheapest buy price for an item (flea or trader), RUB only.
 * Returns { price, source } or null if unbuyable.
 */
export function getBestBuyPrice(item) {
  if (!item) return null;
  let best = null;

  // Check flea market price
  if (item.avg24hPrice && item.avg24hPrice > 0) {
    best = { price: item.avg24hPrice, source: 'Flea Market' };
  }

  // Check trader buy prices
  if (item.buyFor) {
    for (const offer of item.buyFor) {
      if (offer.currency !== 'RUB') continue;
      if (offer.price > 0 && (!best || offer.price < best.price)) {
        best = { price: offer.price, source: offer.vendor.name };
      }
    }
  }

  return best;
}

/**
 * Get the best sell price for an item (flea or trader), RUB only.
 * Returns { price, source } or null.
 */
export function getBestSellPrice(item) {
  if (!item) return null;
  let best = null;

  // Check flea market price
  if (item.avg24hPrice && item.avg24hPrice > 0) {
    best = { price: item.avg24hPrice, source: 'Flea Market' };
  }

  // Check trader sell prices
  if (item.sellFor) {
    for (const offer of item.sellFor) {
      if (offer.currency !== 'RUB') continue;
      if (offer.vendor.name === 'Flea Market') continue; // already handled above
      if (offer.price > 0 && (!best || offer.price > best.price)) {
        best = { price: offer.price, source: offer.vendor.name };
      }
    }
  }

  return best;
}

/**
 * Get the flea market sell price for an item.
 * If playerLevel is provided and below item's minLevelForFlea, falls back to trader price.
 */
export function getFleaPrice(item, playerLevel) {
  if (!item) return 0;

  const fleaLocked = playerLevel && item.minLevelForFlea && item.minLevelForFlea > playerLevel;

  if (!fleaLocked && item.avg24hPrice && item.avg24hPrice > 0) return item.avg24hPrice;
  // Fallback: best trader sell price
  const traderBest = getBestSellPrice(item);
  return traderBest ? traderBest.price : 0;
}

/**
 * Calculate fuel cost per hour.
 */
export function calculateFuelCostPerHour(settings, fuelItems) {
  const { hideoutMgmtLevel, solarPower, fuelType } = settings;
  const secondsPerUnit = solarPower ? FUEL_SECONDS_PER_UNIT_SOLAR : FUEL_SECONDS_PER_UNIT;
  const baseUnitsPerHour = 3600 / secondsPerUnit;
  const adjusted = baseUnitsPerHour * (1 - HIDEOUT_MGMT_FUEL_REDUCTION_PER_LEVEL * hideoutMgmtLevel);

  const tankConfig = FUEL_TANKS[fuelType];
  const fuelItem = fuelItems?.find(f => f.name === tankConfig.name);
  if (!fuelItem) return 0;

  const buyPrice = getBestBuyPrice(fuelItem);
  if (!buyPrice) return 0;

  const costPerUnit = buyPrice.price / tankConfig.capacity;
  return adjusted * costPerUnit;
}

/**
 * Calculate flea market listing fee for a single item sale.
 * Fee = VO * Ti * 4^PO * Q + VR * Tr * 4^PR * Q
 */
export function calculateFleaFee(basePrice, sellPrice, count, settings) {
  if (!basePrice || basePrice <= 0 || !sellPrice || sellPrice <= 0) return 0;

  const VO = basePrice;
  const VR = sellPrice;
  const Ti = FEE_BASE_RATE;
  const Tr = FEE_BASE_RATE;
  const Q = count;

  let PO = Math.log10(VO / VR);
  let PR = Math.log10(VR / VO);

  if (VR < VO) {
    PO = Math.pow(PO, FEE_EXPONENT_MODIFIER);
  }
  if (VR >= VO) {
    PR = Math.pow(PR, FEE_EXPONENT_MODIFIER);
  }

  let fee = VO * Ti * Math.pow(4, PO) * Q + VR * Tr * Math.pow(4, PR) * Q;

  // Intel Center lvl 3 discount
  if (settings.intelCenterLevel >= 3) {
    const discount = Math.min(
      INTEL_CENTER_FEE_DISCOUNT_BASE + INTEL_CENTER_FEE_DISCOUNT_PER_MGMT * settings.hideoutMgmtLevel,
      INTEL_CENTER_FEE_DISCOUNT_MAX
    );
    fee *= (1 - discount);
  }

  return Math.round(fee);
}

/**
 * Get cheapest RUB trader buy price for an item, or null.
 */
function getTraderBuyPrice(item) {
  if (!item?.buyFor) return null;
  let best = null;
  for (const offer of item.buyFor) {
    if (offer.currency !== 'RUB') continue;
    if (offer.price > 0 && (!best || offer.price < best)) {
      best = offer.price;
    }
  }
  return best;
}

/**
 * Calculate volatility/stability for a craft based on 24h price ranges.
 */
export function calculateVolatility(craft, fuelCost, settings) {
  const durationHours = craft.duration / 3600;

  // Best case: buy inputs at low, sell outputs at high
  let bestInputCost = 0;
  for (const req of craft.requiredItems) {
    const tool = req.attributes?.some(a => a.name === 'type' && a.value === 'tool');
    if (tool) continue;
    const item = req.item;
    const traderPrice = getTraderBuyPrice(item);
    const fleaLow = (item.low24hPrice && item.low24hPrice > 0) ? item.low24hPrice : item.avg24hPrice || 0;
    const buyPrice = traderPrice && traderPrice < fleaLow ? traderPrice : fleaLow;
    bestInputCost += buyPrice * req.count;
  }

  let bestOutputValue = 0;
  let bestTotalFee = 0;
  for (const reward of craft.rewardItems) {
    const item = reward.item;
    const fleaHigh = (item.high24hPrice && item.high24hPrice > 0) ? item.high24hPrice : item.avg24hPrice || 0;
    bestOutputValue += fleaHigh * reward.count;
    bestTotalFee += calculateFleaFee(item.basePrice, fleaHigh, reward.count, settings);
  }
  const bestProfit = bestOutputValue - bestInputCost - fuelCost - bestTotalFee;

  // Worst case: buy inputs at high, sell outputs at low
  let worstInputCost = 0;
  for (const req of craft.requiredItems) {
    const tool = req.attributes?.some(a => a.name === 'type' && a.value === 'tool');
    if (tool) continue;
    const item = req.item;
    const traderPrice = getTraderBuyPrice(item);
    const fleaHigh = (item.high24hPrice && item.high24hPrice > 0) ? item.high24hPrice : item.avg24hPrice || 0;
    const buyPrice = traderPrice && traderPrice < fleaHigh ? traderPrice : fleaHigh;
    worstInputCost += buyPrice * req.count;
  }

  let worstOutputValue = 0;
  let worstTotalFee = 0;
  for (const reward of craft.rewardItems) {
    const item = reward.item;
    const fleaLow = (item.low24hPrice && item.low24hPrice > 0) ? item.low24hPrice : item.avg24hPrice || 0;
    worstOutputValue += fleaLow * reward.count;
    worstTotalFee += calculateFleaFee(item.basePrice, fleaLow, reward.count, settings);
  }
  const worstProfit = worstOutputValue - worstInputCost - fuelCost - worstTotalFee;

  const profitRange = bestProfit - worstProfit;
  const avgProfit = (bestProfit + worstProfit) / 2;
  const rangePercent = avgProfit !== 0 ? (profitRange / Math.abs(avgProfit)) * 100 : (profitRange > 0 ? 100 : 0);

  let stabilityRating, stabilityLabel;
  if (rangePercent <= 15) {
    stabilityRating = 'stable';
    stabilityLabel = 'Stable';
  } else if (rangePercent <= 40) {
    stabilityRating = 'moderate';
    stabilityLabel = 'Moderate';
  } else {
    stabilityRating = 'volatile';
    stabilityLabel = 'Volatile';
  }

  return {
    bestProfit: Math.round(bestProfit),
    worstProfit: Math.round(worstProfit),
    profitRange: Math.round(profitRange),
    rangePercent: Math.round(rangePercent),
    stabilityRating,
    stabilityLabel,
    bestProfitPerHour: durationHours > 0 ? Math.round(bestProfit / durationHours) : 0,
    worstProfitPerHour: durationHours > 0 ? Math.round(worstProfit / durationHours) : 0,
  };
}

/**
 * Check if an item requirement is a tool (not consumed).
 */
function isTool(requiredItem) {
  if (!requiredItem.attributes) return false;
  return requiredItem.attributes.some(
    attr => attr.name === 'type' && attr.value === 'tool'
  );
}

/**
 * Calculate full profit breakdown for a single craft.
 */
export function calculateCraftProfit(craft, settings, fuelItems) {
  const durationHours = craft.duration / 3600;

  // Calculate input cost (exclude tools)
  const inputs = craft.requiredItems.map(req => {
    const tool = isTool(req);
    const buyInfo = getBestBuyPrice(req.item);
    const unitPrice = buyInfo ? buyInfo.price : 0;
    const totalPrice = tool ? 0 : unitPrice * req.count;
    return {
      item: req.item,
      count: req.count,
      unitPrice,
      totalPrice,
      source: buyInfo ? buyInfo.source : 'N/A',
      isTool: tool,
    };
  });
  const inputCost = inputs.reduce((sum, i) => sum + i.totalPrice, 0);

  // Calculate output value and flea fees
  const outputs = craft.rewardItems.map(reward => {
    const fleaLocked = settings.playerLevel && reward.item.minLevelForFlea && reward.item.minLevelForFlea > settings.playerLevel;
    const fleaPrice = getFleaPrice(reward.item, settings.playerLevel);
    const totalValue = fleaPrice * reward.count;
    const fee = fleaLocked ? 0 : calculateFleaFee(reward.item.basePrice, fleaPrice, reward.count, settings);
    return {
      item: reward.item,
      count: reward.count,
      unitPrice: fleaPrice,
      totalValue,
      fleaFee: fee,
      fleaLocked,
    };
  });
  const outputValue = outputs.reduce((sum, o) => sum + o.totalValue, 0);
  const totalFleaFee = outputs.reduce((sum, o) => sum + o.fleaFee, 0);

  // Fuel cost
  const fuelCostPerHour = settings.includeFuelCost
    ? calculateFuelCostPerHour(settings, fuelItems)
    : 0;
  const fuelCost = Math.round(fuelCostPerHour * durationHours);

  // Net profit
  const netProfit = outputValue - inputCost - fuelCost - totalFleaFee;
  const profitPerHour = durationHours > 0 ? netProfit / durationHours : 0;

  // Volatility
  const volatility = calculateVolatility(craft, fuelCost, settings);

  return {
    craft,
    inputs,
    outputs,
    inputCost,
    outputValue,
    fuelCost,
    fuelCostPerHour,
    totalFleaFee,
    netProfit,
    profitPerHour: Math.round(profitPerHour),
    durationHours,
    volatility,
  };
}

/**
 * Filter crafts by station/level and rank by profit.
 */
export function rankCrafts(crafts, settings, fuelItems, stationFilter, levelFilter, searchQuery) {
  let filtered = crafts;

  // Filter by station
  if (stationFilter && stationFilter !== 'all') {
    filtered = filtered.filter(c =>
      c.station.normalizedName === stationFilter ||
      c.station.id === stationFilter
    );
  }

  // Filter by level (show crafts at or below selected level)
  if (levelFilter && levelFilter > 0) {
    filtered = filtered.filter(c => c.level <= levelFilter);
  }

  // Calculate profits
  let results = filtered.map(craft => calculateCraftProfit(craft, settings, fuelItems));

  // Hide crafts with flea-locked outputs
  if (settings.hideFleaLocked && settings.playerLevel) {
    results = results.filter(r =>
      !r.outputs.some(o => o.fleaLocked)
    );
  }

  // Filter by search query
  if (searchQuery && searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    results = results.filter(r =>
      r.outputs.some(o => o.item.name.toLowerCase().includes(query) ||
        o.item.shortName.toLowerCase().includes(query)) ||
      r.inputs.some(i => i.item.name.toLowerCase().includes(query) ||
        i.item.shortName.toLowerCase().includes(query))
    );
  }

  // Sort
  if (settings.sortBy === 'totalProfit') {
    results.sort((a, b) => b.netProfit - a.netProfit);
  } else {
    results.sort((a, b) => b.profitPerHour - a.profitPerHour);
  }

  return results;
}

/**
 * Format roubles with commas and sign.
 */
export function formatRoubles(value) {
  const rounded = Math.round(value);
  const formatted = Math.abs(rounded).toLocaleString('en-US');
  if (rounded >= 0) return `+${formatted} \u20BD`;
  return `-${formatted} \u20BD`;
}

/**
 * Format roubles without sign.
 */
export function formatRoublesUnsigned(value) {
  return `${Math.round(value).toLocaleString('en-US')} \u20BD`;
}

/**
 * Format duration in hours and minutes.
 */
export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
