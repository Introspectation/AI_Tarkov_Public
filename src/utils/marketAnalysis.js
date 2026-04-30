import { groupByHour, groupByDayOfWeek, calculateTrend, calculateConfidence, getPlayWindowHours, getPlayWindowDays } from './priceAnalysis.js';
import { calculateFleaFee, getBestSellPrice } from './calculator.js';

const TZ = 'Europe/Istanbul';

function getCurrentHourTZ() {
  const str = new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false });
  return parseInt(str, 10);
}

function formatHourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00 (GMT+3)`;
}

/**
 * Analyze best time to buy an item based on 7-day price history.
 */
export function analyzeBuyTiming(historicalData, settings) {
  if (!historicalData || historicalData.length < 24) {
    return null;
  }

  const hourly = groupByHour(historicalData);
  const confidence = calculateConfidence(hourly);
  const playHours = getPlayWindowHours(settings);

  // Find hour with lowest average price
  let bestHour = -1;
  let avgAtBest = Infinity;
  let totalSum = 0;
  let totalCount = 0;

  for (let h = 0; h < 24; h++) {
    if (playHours && !playHours.includes(h)) continue;
    const bucket = hourly[h];
    if (bucket.length === 0) continue;
    const avg = bucket.reduce((s, v) => s + v, 0) / bucket.length;
    totalSum += bucket.reduce((s, v) => s + v, 0);
    totalCount += bucket.length;
    if (avg < avgAtBest) {
      avgAtBest = avg;
      bestHour = h;
    }
  }

  if (bestHour < 0 || totalCount === 0) return null;

  const overallAvg = totalSum / totalCount;
  const savings = overallAvg - avgAtBest;
  const savingsPercent = overallAvg > 0 ? (savings / overallAvg) * 100 : 0;

  // Day pattern
  const dayBuckets = groupByDayOfWeek(historicalData);
  const playDays = getPlayWindowDays(settings);
  let bestDay = null;
  let bestDayAvg = Infinity;
  for (const [day, prices] of Object.entries(dayBuckets)) {
    if (playDays && !playDays.includes(day)) continue;
    if (prices.length < 3) continue;
    const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
    if (avg < bestDayAvg) {
      bestDayAvg = avg;
      bestDay = day;
    }
  }

  return {
    bestHour,
    bestHourLabel: formatHourLabel(bestHour),
    avgAtBest: Math.round(avgAtBest),
    overallAvg: Math.round(overallAvg),
    savings: Math.round(savings),
    savingsPercent: Math.round(savingsPercent * 10) / 10,
    confidence,
    dayPattern: bestDay,
  };
}

/**
 * Analyze best time to sell an item on the flea market.
 * @param {number|null} afterHour - When set, only consider hours > afterHour (sell must come after buy)
 */
export function analyzeSellTiming(historicalData, basePrice, settings, afterHour) {
  if (!historicalData || historicalData.length < 24) {
    return null;
  }

  const hourly = groupByHour(historicalData);
  const confidence = calculateConfidence(hourly);
  const playHours = getPlayWindowHours(settings);

  // Build valid sell hours: must be in play window AND after buy hour (if specified)
  let sellHours = null;
  if (playHours && afterHour != null) {
    sellHours = playHours.filter(h => h > afterHour);
  } else if (playHours) {
    sellHours = playHours;
  }

  // Find hour with highest average price
  let bestHour = -1;
  let avgAtBest = -Infinity;
  let totalSum = 0;
  let totalCount = 0;

  for (let h = 0; h < 24; h++) {
    if (sellHours && !sellHours.includes(h)) continue;
    const bucket = hourly[h];
    if (bucket.length === 0) continue;
    const avg = bucket.reduce((s, v) => s + v, 0) / bucket.length;
    totalSum += bucket.reduce((s, v) => s + v, 0);
    totalCount += bucket.length;
    if (avg > avgAtBest) {
      avgAtBest = avg;
      bestHour = h;
    }
  }

  if (bestHour < 0 || totalCount === 0) return null;

  const overallAvg = totalSum / totalCount;
  const premium = avgAtBest - overallAvg;
  const premiumPercent = overallAvg > 0 ? (premium / overallAvg) * 100 : 0;
  const feeAtBest = calculateFleaFee(basePrice, Math.round(avgAtBest), 1, settings);
  const netAfterFee = Math.round(avgAtBest) - feeAtBest;

  // Day pattern
  const dayBuckets = groupByDayOfWeek(historicalData);
  const playDays = getPlayWindowDays(settings);
  let bestDay = null;
  let bestDayAvg = -Infinity;
  for (const [day, prices] of Object.entries(dayBuckets)) {
    if (playDays && !playDays.includes(day)) continue;
    if (prices.length < 3) continue;
    const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
    if (avg > bestDayAvg) {
      bestDayAvg = avg;
      bestDay = day;
    }
  }

  // If sell net is negative (loss) and we have a constrained afterHour, flag it
  const sellAfterBuyConstrained = afterHour != null && sellHours != null;
  const nextSession = sellAfterBuyConstrained && netAfterFee <= 0;

  return {
    bestHour,
    bestHourLabel: formatHourLabel(bestHour),
    avgAtBest: Math.round(avgAtBest),
    overallAvg: Math.round(overallAvg),
    premium: Math.round(premium),
    premiumPercent: Math.round(premiumPercent * 10) / 10,
    netAfterFee,
    feeAtBest,
    confidence,
    dayPattern: bestDay,
    nextSession,
  };
}

/**
 * Compare selling on flea market vs to a trader.
 */
export function compareFleaVsTrader(item, sellAnalysis, settings) {
  // Get best trader price (excluding Flea Market)
  let traderPrice = 0;
  let traderName = null;
  if (item.sellFor) {
    for (const offer of item.sellFor) {
      if (offer.currency !== 'RUB') continue;
      if (offer.vendor.name === 'Flea Market') continue;
      if (offer.price > traderPrice) {
        traderPrice = offer.price;
        traderName = offer.vendor.name;
      }
    }
  }

  if (!sellAnalysis && traderPrice === 0) {
    return { recommendation: 'none', fleaNet: 0, traderPrice: 0, difference: 0, traderName: null, reason: 'No sell options available' };
  }

  if (!sellAnalysis) {
    return { recommendation: 'trader', fleaNet: 0, traderPrice, difference: traderPrice, traderName, reason: 'Flea data unavailable — sell to trader' };
  }

  const fleaNet = sellAnalysis.netAfterFee;

  if (traderPrice === 0) {
    return { recommendation: 'flea_timed', fleaNet, traderPrice: 0, difference: fleaNet, traderName: null, reason: 'No trader buys this — sell on flea' };
  }

  const difference = fleaNet - traderPrice;
  const diffPercent = traderPrice > 0 ? (difference / traderPrice) * 100 : 0;

  if (traderPrice > fleaNet) {
    return { recommendation: 'trader', fleaNet, traderPrice, difference: traderPrice - fleaNet, traderName, reason: `${traderName} pays ${(traderPrice - fleaNet).toLocaleString()} more than flea net` };
  }

  if (diffPercent > 5) {
    return { recommendation: 'flea_timed', fleaNet, traderPrice, difference, traderName, reason: `Flea nets ${difference.toLocaleString()} more at peak hours` };
  }

  return { recommendation: 'flea', fleaNet, traderPrice, difference, traderName, reason: 'Flea slightly better — sell anytime' };
}

/**
 * Build a prompt for Ollama market insight.
 */
export function buildMarketPrompt(item, buyAnalysis, sellAnalysis, comparison, trend, settings) {
  const parts = [
    `Item: ${item.name}`,
    `Current avg price: ${(item.avg24hPrice || 0).toLocaleString()} roubles`,
    `Trend: ${trend.description}`,
  ];

  if (settings?.playWindowEnabled) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = (settings.playWindowDays || [0,1,2,3,4,5,6]).map(i => dayNames[i]).join(', ');
    parts.push(`Play window: ${days} ${settings.playWindowStart}–${settings.playWindowEnd} (GMT+3)`);
  }

  if (buyAnalysis) {
    parts.push(`Best buy window: ${buyAnalysis.bestHourLabel} (~${buyAnalysis.avgAtBest.toLocaleString()} roubles, ${buyAnalysis.savingsPercent}% cheaper than avg)`);
    if (buyAnalysis.dayPattern) parts.push(`Cheapest day: ${buyAnalysis.dayPattern}`);
    parts.push(`Buy confidence: ${buyAnalysis.confidence.label} (${buyAnalysis.confidence.score}/100)`);
  }

  if (sellAnalysis) {
    parts.push(`Best sell window: ${sellAnalysis.bestHourLabel} (~${sellAnalysis.avgAtBest.toLocaleString()} roubles, net ${sellAnalysis.netAfterFee.toLocaleString()} after fee)`);
    if (sellAnalysis.dayPattern) parts.push(`Best sell day: ${sellAnalysis.dayPattern}`);
    parts.push(`Sell confidence: ${sellAnalysis.confidence.label} (${sellAnalysis.confidence.score}/100)`);
  }

  if (comparison) {
    parts.push(`Flea vs Trader: ${comparison.reason}`);
  }

  return `You are a Tarkov flea market analyst. Based on 7-day price history analysis, give a brief (2-3 sentences) buy/sell timing recommendation for this item. Be specific about hours (GMT+3 Turkish time). Mention whether it's better to sell on flea or to a trader.\n\n${parts.join('\n')}`;
}

/**
 * Quick badge for CraftRow per-item timing hints.
 * Compares current hour to best buy/sell windows.
 */
export function getItemTimingBadge(historicalData, settings) {
  if (!historicalData || historicalData.length < 24) return null;

  const hourly = groupByHour(historicalData);
  const confidence = calculateConfidence(hourly);
  if (confidence.score < 25) return null;

  const currentHour = getCurrentHourTZ();
  const playHours = getPlayWindowHours(settings);

  // Find cheapest and most expensive hours
  let cheapestHour = -1, cheapestAvg = Infinity;
  let peakHour = -1, peakAvg = -Infinity;

  for (let h = 0; h < 24; h++) {
    if (playHours && !playHours.includes(h)) continue;
    const bucket = hourly[h];
    if (bucket.length === 0) continue;
    const avg = bucket.reduce((s, v) => s + v, 0) / bucket.length;
    if (avg < cheapestAvg) { cheapestAvg = avg; cheapestHour = h; }
    if (avg > peakAvg) { peakAvg = avg; peakHour = h; }
  }

  if (cheapestHour < 0) return null;

  const distToCheap = Math.min(
    Math.abs(currentHour - cheapestHour),
    24 - Math.abs(currentHour - cheapestHour)
  );
  const distToPeak = Math.min(
    Math.abs(currentHour - peakHour),
    24 - Math.abs(currentHour - peakHour)
  );

  // Check trend
  const trend = calculateTrend(historicalData);

  if (distToCheap <= 2) return { label: 'Buy', color: 'buy' };
  if (distToPeak <= 2) return { label: 'Sell', color: 'sell' };
  if (trend.direction === 'down') return { label: 'Hold', color: 'hold' };

  return null;
}
