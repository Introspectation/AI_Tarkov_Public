import { groupByHour, groupByDayOfWeek } from './priceAnalysis.js';
import { calculateFleaFee, getBestBuyPrice, calculateFuelCostPerHour } from './calculator.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Trimmed mean: sort prices, drop top and bottom ~20%, average the rest.
 * With 7 data points this keeps the middle 5 — exactly what reduces outlier influence.
 * Falls back to regular mean if too few data points to trim.
 */
function trimmedMean(values) {
  if (values.length === 0) return null;
  if (values.length < 5) return values.reduce((s, v) => s + v, 0) / values.length;

  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.max(1, Math.floor(sorted.length * 0.2));
  const middle = sorted.slice(trim, sorted.length - trim);
  return middle.reduce((s, v) => s + v, 0) / middle.length;
}

/**
 * Predict an item's price at a specific day + hour.
 * Uses trimmed hourly mean as base (drops top/bottom outliers),
 * then applies day-of-week adjustment factor.
 */
function predictPrice(historicalData, dayName, hour) {
  if (!historicalData || historicalData.length < 10) return null;

  const hourly = groupByHour(historicalData);
  const bucket = hourly[hour];
  if (!bucket || bucket.length === 0) return null;

  const hourAvg = trimmedMean(bucket);

  // Apply day-of-week adjustment if enough data
  const daily = groupByDayOfWeek(historicalData);
  const dayBucket = daily[dayName];
  if (dayBucket && dayBucket.length >= 3) {
    const allAvg = historicalData.reduce((s, p) => s + p.price, 0) / historicalData.length;
    if (allAvg > 0) {
      const dayAvg = dayBucket.reduce((s, v) => s + v, 0) / dayBucket.length;
      return Math.round(hourAvg * (dayAvg / allAvg));
    }
  }

  return Math.round(hourAvg);
}

/**
 * Optimize crafts for a specific play session.
 * Predicts input costs at buy time and output values at sell time,
 * then ranks by predicted profit per hour.
 */
export function optimizeCraftsForSession(crafts, settings, fuelItems, session, allHistoricalData) {
  const { day, startHour, endHour } = session;
  const sessionMinutes = startHour < endHour
    ? (endHour - startHour) * 60
    : (24 - startHour + endHour) * 60;

  const buyHour = Math.floor(startHour);
  const results = [];

  for (const craft of crafts) {
    const durationHours = craft.duration / 3600;
    const durationMinutes = craft.duration / 60;
    const completionDecimal = startHour + durationHours;
    const completionHour = Math.floor(completionDecimal) % 24;
    const completionMin = Math.round((completionDecimal % 1) * 60);
    const finishesInSession = durationMinutes <= sessionMinutes;

    // Determine sell day (may shift if craft crosses midnight)
    let sellDay = day;
    if (completionDecimal >= 24) {
      const dayIdx = DAY_NAMES.indexOf(day);
      const daysLater = Math.floor(completionDecimal / 24);
      sellDay = DAY_NAMES[(dayIdx + daysLater) % 7];
    }

    // Predict input costs at session start
    let predictedInputCost = 0;
    let hasAllPredictions = true;
    const inputDetails = [];

    for (const req of craft.requiredItems) {
      const isTool = req.attributes?.some(a => a.name === 'type' && a.value === 'tool');
      const currentBest = getBestBuyPrice(req.item);
      const currentPrice = currentBest ? currentBest.price : 0;

      if (isTool) {
        inputDetails.push({ item: req.item, count: req.count, predictedPrice: 0, currentPrice, isTool: true });
        continue;
      }

      const hist = allHistoricalData[req.item.id];
      const predicted = predictPrice(hist, day, buyHour);
      const buyPrice = predicted || currentPrice;
      if (!predicted) hasAllPredictions = false;

      inputDetails.push({
        item: req.item,
        count: req.count,
        predictedPrice: buyPrice,
        currentPrice,
        isTool: false,
        hasPrediction: !!predicted,
        source: currentBest?.source || 'N/A',
      });

      predictedInputCost += buyPrice * req.count;
    }

    // Predict output values at completion time
    let predictedOutputValue = 0;
    let predictedFees = 0;
    const outputDetails = [];

    for (const reward of craft.rewardItems) {
      const currentFlea = reward.item.avg24hPrice || 0;
      const hist = allHistoricalData[reward.item.id];
      const predicted = predictPrice(hist, sellDay, completionHour);
      const sellPrice = predicted || currentFlea;
      if (!predicted) hasAllPredictions = false;

      const totalValue = sellPrice * reward.count;
      const fee = calculateFleaFee(reward.item.basePrice, sellPrice, reward.count, settings);

      outputDetails.push({
        item: reward.item,
        count: reward.count,
        predictedPrice: sellPrice,
        currentPrice: currentFlea,
        totalValue,
        fleaFee: fee,
        hasPrediction: !!predicted,
      });

      predictedOutputValue += totalValue;
      predictedFees += fee;
    }

    // Fuel cost
    const fuelPerHour = settings.includeFuelCost ? calculateFuelCostPerHour(settings, fuelItems) : 0;
    const fuelCost = Math.round(fuelPerHour * durationHours);

    // Predicted profit
    const predictedProfit = predictedOutputValue - predictedInputCost - fuelCost - predictedFees;
    const profitPerHour = durationHours > 0 ? predictedProfit / durationHours : 0;

    const completionLabel = `${String(completionHour).padStart(2, '0')}:${String(completionMin).padStart(2, '0')}`;

    results.push({
      craft,
      inputDetails,
      outputDetails,
      predictedInputCost: Math.round(predictedInputCost),
      predictedOutputValue: Math.round(predictedOutputValue),
      predictedFees: Math.round(predictedFees),
      fuelCost,
      predictedProfit: Math.round(predictedProfit),
      profitPerHour: Math.round(profitPerHour),
      durationHours,
      finishesInSession,
      completionLabel,
      sellDay,
      hasAllPredictions,
      timingNote: finishesInSession
        ? `Done ${completionLabel} — sell during session`
        : durationHours > 24
          ? `${Math.round(durationHours)}h craft — sell ${sellDay} ${completionLabel}`
          : `Done ${completionLabel}${sellDay !== day ? ` (${sellDay})` : ''} — sell later`,
    });
  }

  results.sort((a, b) => b.profitPerHour - a.profitPerHour);
  return results;
}

/**
 * Build Ollama prompt for session game plan.
 */
export function buildSessionOllamaPrompt(topResults, session) {
  const { day, startHour, endHour } = session;
  const fmt = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

  const lines = topResults.slice(0, 5).map((r, i) => {
    const out = r.outputDetails.map(d => `${d.count}x ${d.item.shortName}`).join(' + ');
    return `${i + 1}. ${r.craft.station.name} L${r.craft.level} → ${out} | ${r.timingNote} | ${r.predictedProfit.toLocaleString()}₽ (${r.profitPerHour.toLocaleString()}₽/hr)`;
  }).join('\n');

  return `You are a Tarkov hideout planning assistant. A player will play on ${day} from ${fmt(startHour)} to ${fmt(endHour)} (GMT+3 Turkish time). Based on predicted prices for those hours, give a brief game plan (3-4 sentences). Which crafts to start first, when to buy materials, and any timing tips.\n\nTop crafts for this session:\n${lines}`;
}
