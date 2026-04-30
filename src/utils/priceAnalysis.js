const TZ = 'Europe/Istanbul';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Check if an hour falls within a play window (supports overnight wrap).
 */
export function isHourInWindow(hour, startTime, endTime) {
  const start = parseInt(startTime.split(':')[0], 10);
  const end = parseInt(endTime.split(':')[0], 10);
  if (start <= end) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end;
}

/**
 * Get array of valid hours from settings, or null if no filter.
 */
export function getPlayWindowHours(settings) {
  if (!settings?.playWindowEnabled) return null;
  const hours = [];
  for (let h = 0; h < 24; h++) {
    if (isHourInWindow(h, settings.playWindowStart, settings.playWindowEnd)) {
      hours.push(h);
    }
  }
  return hours.length > 0 ? hours : null;
}

/**
 * Get array of valid day names from settings, or null if no filter.
 */
export function getPlayWindowDays(settings) {
  if (!settings?.playWindowEnabled) return null;
  const days = settings.playWindowDays;
  if (!days || days.length === 0 || days.length === 7) return null;
  return days.map(i => DAY_NAMES[i]);
}

function getHour(timestamp) {
  const d = new Date(Number(timestamp));
  const str = d.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false });
  return parseInt(str, 10);
}

function getDayOfWeek(timestamp) {
  const d = new Date(Number(timestamp));
  const str = d.toLocaleString('en-US', { timeZone: TZ, weekday: 'long' });
  return str;
}

export function groupByHour(data) {
  const buckets = {};
  for (let h = 0; h < 24; h++) buckets[h] = [];
  for (const point of data) {
    const h = getHour(point.timestamp);
    if (buckets[h]) buckets[h].push(point.price);
  }
  return buckets;
}

export function groupByDayOfWeek(data) {
  const buckets = {};
  for (const name of DAY_NAMES) buckets[name] = [];
  for (const point of data) {
    const day = getDayOfWeek(point.timestamp);
    if (buckets[day]) buckets[day].push(point.price);
  }
  return buckets;
}

export function calculateTrend(data) {
  if (!data || data.length < 2) return { direction: 'flat', changePercent: 0, description: 'Not enough data' };

  const sorted = [...data].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const now = Number(sorted[sorted.length - 1].timestamp);
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const recent = sorted.filter(d => Number(d.timestamp) >= oneDayAgo);
  const older = sorted.filter(d => Number(d.timestamp) < oneDayAgo);

  if (recent.length === 0 || older.length === 0) {
    return { direction: 'flat', changePercent: 0, description: 'Not enough data for trend' };
  }

  const recentAvg = recent.reduce((s, d) => s + d.price, 0) / recent.length;
  const olderAvg = older.reduce((s, d) => s + d.price, 0) / older.length;

  if (olderAvg === 0) return { direction: 'flat', changePercent: 0, description: 'Stable' };

  const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;
  let direction, description;

  if (changePercent > 3) {
    direction = 'up';
    description = `Up ${changePercent.toFixed(1)}% in last 24h`;
  } else if (changePercent < -3) {
    direction = 'down';
    description = `Down ${Math.abs(changePercent).toFixed(1)}% in last 24h`;
  } else {
    direction = 'flat';
    description = `Stable (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}%)`;
  }

  return { direction, changePercent, description };
}

export function calculateConfidence(hourlyBuckets) {
  const means = [];
  const allValues = [];

  for (let h = 0; h < 24; h++) {
    const bucket = hourlyBuckets[h];
    if (bucket.length > 0) {
      const mean = bucket.reduce((s, v) => s + v, 0) / bucket.length;
      means.push(mean);
      allValues.push(...bucket);
    }
  }

  if (means.length < 4 || allValues.length < 24) {
    return { score: 20, label: 'Low' };
  }

  const grandMean = allValues.reduce((s, v) => s + v, 0) / allValues.length;

  // Between-bucket variance (how much hourly means differ)
  const betweenVar = means.reduce((s, m) => s + (m - grandMean) ** 2, 0) / means.length;

  // Within-bucket variance (noise within each hour)
  let withinVar = 0;
  let withinCount = 0;
  for (let h = 0; h < 24; h++) {
    const bucket = hourlyBuckets[h];
    if (bucket.length > 1) {
      const mean = bucket.reduce((s, v) => s + v, 0) / bucket.length;
      for (const v of bucket) {
        withinVar += (v - mean) ** 2;
        withinCount++;
      }
    }
  }
  withinVar = withinCount > 0 ? withinVar / withinCount : 1;

  // Signal-to-noise ratio → confidence score
  const ratio = withinVar > 0 ? betweenVar / withinVar : 0;
  const score = Math.min(100, Math.round(ratio * 200));

  let label;
  if (score >= 60) label = 'High';
  else if (score >= 30) label = 'Medium';
  else label = 'Low';

  return { score, label };
}

export function findOptimalWindow(inputHourly, outputHourly, playHours) {
  let bestHour = -1;
  let bestMargin = -Infinity;

  for (let h = 0; h < 24; h++) {
    if (playHours && !playHours.includes(h)) continue;
    const outPrices = outputHourly[h];
    const inPrices = inputHourly[h];

    const outAvg = outPrices.length > 0
      ? outPrices.reduce((s, v) => s + v, 0) / outPrices.length
      : null;
    const inAvg = inPrices.length > 0
      ? inPrices.reduce((s, v) => s + v, 0) / inPrices.length
      : null;

    if (outAvg === null) continue;

    // If input is trader-priced (no flea data), only optimize output
    const margin = inAvg !== null ? outAvg - inAvg : outAvg;

    if (margin > bestMargin) {
      bestMargin = margin;
      bestHour = h;
    }
  }

  if (bestHour < 0) return null;

  const label = `${String(bestHour).padStart(2, '0')}:00 - ${String((bestHour + 1) % 24).padStart(2, '0')}:00 (GMT+3)`;
  return { hour: bestHour, label, margin: bestMargin };
}

function getCurrentHourTZ() {
  const str = new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false });
  return parseInt(str, 10);
}

function weightedHourlyBuckets(items, historicalData) {
  const totalValue = items.reduce((s, item) => s + (item.totalPrice || item.totalValue || 0), 0);
  const combined = {};
  for (let h = 0; h < 24; h++) combined[h] = [];

  for (const item of items) {
    const data = historicalData[item.item.id];
    if (!data || data.length < 2) continue;

    const weight = totalValue > 0 ? (item.totalPrice || item.totalValue || 0) / totalValue : 1 / items.length;
    const hourly = groupByHour(data);

    for (let h = 0; h < 24; h++) {
      for (const price of hourly[h]) {
        combined[h].push(price * weight);
      }
    }
  }

  return combined;
}

export function analyzePricePatterns(historicalData, inputs, outputs, settings) {
  if (!historicalData || Object.keys(historicalData).length === 0) return null;

  // Check if we have enough data for any item
  const allData = Object.values(historicalData).flat();
  if (allData.length < 24) {
    return {
      recommendation: 'insufficient_data',
      recommendationText: 'Not enough data',
      waitHours: 0,
      confidence: { score: 10, label: 'Low' },
      confidenceLabel: 'Low',
      trend: { direction: 'flat', changePercent: 0, description: 'Not enough price history' },
      bestCraftTime: null,
      dayOfWeekPattern: null,
      currentWindow: null,
    };
  }

  // Check if all inputs are trader-priced (no flea data)
  const fleaInputs = inputs.filter(i => !i.isTool && i.source === 'Flea Market');
  const allTraderInputs = fleaInputs.length === 0;

  // Weighted hourly buckets for inputs and outputs
  const nonToolInputs = inputs.filter(i => !i.isTool);
  const inputHourly = weightedHourlyBuckets(nonToolInputs, historicalData);
  const outputHourly = weightedHourlyBuckets(outputs, historicalData);

  // Trend from primary output
  const primaryOutputData = historicalData[outputs[0]?.item.id];
  const trend = primaryOutputData ? calculateTrend(primaryOutputData) : { direction: 'flat', changePercent: 0, description: 'No output data' };

  // Confidence from output hourly patterns
  const confidence = calculateConfidence(outputHourly);

  // Optimal window
  const playHours = getPlayWindowHours(settings);
  const bestWindow = findOptimalWindow(inputHourly, outputHourly, playHours);

  // Day of week pattern from primary output
  const playDays = getPlayWindowDays(settings);
  let dayOfWeekPattern = null;
  if (primaryOutputData && primaryOutputData.length >= 48) {
    const dayBuckets = groupByDayOfWeek(primaryOutputData);
    let bestDay = null, bestAvg = -Infinity;
    let worstDay = null, worstAvg = Infinity;

    for (const [day, prices] of Object.entries(dayBuckets)) {
      if (playDays && !playDays.includes(day)) continue;
      if (prices.length < 3) continue;
      const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
      if (avg > bestAvg) { bestAvg = avg; bestDay = day; }
      if (avg < worstAvg) { worstAvg = avg; worstDay = day; }
    }

    if (bestDay && worstDay && bestDay !== worstDay) {
      const diff = ((bestAvg - worstAvg) / worstAvg * 100).toFixed(1);
      dayOfWeekPattern = {
        bestDay,
        worstDay,
        description: `${bestDay} avg ${diff}% higher than ${worstDay}`,
      };
    }
  }

  // Current hour and distance to optimal
  const currentHour = getCurrentHourTZ();
  const currentWindow = { hour: currentHour, label: `${String(currentHour).padStart(2, '0')}:00 (GMT+3)` };

  let hoursToOptimal = 0;
  if (bestWindow) {
    hoursToOptimal = (bestWindow.hour - currentHour + 24) % 24;
  }

  // Recommendation logic
  let recommendation, recommendationText, waitHours = 0;
  const nearOptimal = hoursToOptimal <= 2 || hoursToOptimal >= 22;

  if (nearOptimal && trend.direction !== 'down') {
    recommendation = 'craft_now';
    recommendationText = allTraderInputs
      ? 'Craft now — input prices fixed, output near peak'
      : 'Craft now — near optimal pricing window';
  } else if (trend.direction === 'down' && confidence.score >= 30) {
    recommendation = 'trending_down';
    recommendationText = `Output prices trending down (${Math.abs(trend.changePercent).toFixed(1)}%)`;
    waitHours = 0;
  } else if (hoursToOptimal > 2 && hoursToOptimal < 22 && confidence.score >= 60) {
    recommendation = 'wait';
    waitHours = hoursToOptimal;
    recommendationText = `Wait ~${hoursToOptimal}h for better pricing window`;
  } else {
    recommendation = 'craft_now';
    recommendationText = allTraderInputs
      ? 'Input prices fixed — timing affects output only'
      : 'No strong timing signal — craft when ready';
  }

  return {
    recommendation,
    recommendationText,
    waitHours,
    confidence,
    confidenceLabel: confidence.label,
    trend,
    bestCraftTime: bestWindow ? { hour: bestWindow.hour, label: bestWindow.label, reason: 'Best output-to-input price margin' } : null,
    dayOfWeekPattern,
    currentWindow,
  };
}

export function buildOllamaPrompt(craft, analysis, inputs, outputs, settings) {
  const inputList = inputs.map(i =>
    `${i.count}x ${i.item.shortName} (${i.isTool ? 'tool' : i.source}, ${i.unitPrice.toLocaleString()}₽)`
  ).join(', ');

  const outputList = outputs.map(o =>
    `${o.count}x ${o.item.shortName} (${o.unitPrice.toLocaleString()}₽)`
  ).join(', ');

  const parts = [
    `Craft: ${craft.station.name} L${craft.level}, Duration: ${Math.round(craft.duration / 3600)}h`,
    `Inputs: ${inputList}`,
    `Outputs: ${outputList}`,
    `Trend: ${analysis.trend.description}`,
    `Confidence: ${analysis.confidenceLabel} (${analysis.confidence.score}/100)`,
  ];

  if (settings?.playWindowEnabled) {
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = (settings.playWindowDays || [0,1,2,3,4,5,6]).map(i => dayLabels[i]).join(', ');
    parts.push(`Play window: ${days} ${settings.playWindowStart}–${settings.playWindowEnd} (GMT+3)`);
  }

  if (analysis.bestCraftTime) {
    parts.push(`Best window: ${analysis.bestCraftTime.label}`);
  }
  if (analysis.dayOfWeekPattern) {
    parts.push(`Day pattern: ${analysis.dayOfWeekPattern.description}`);
  }
  parts.push(`Current recommendation: ${analysis.recommendationText}`);

  return `You are a Tarkov flea market analyst. Based on 7-day price history analysis, give a brief (2-3 sentences) craft timing recommendation. Be specific about hours (GMT+3 Turkish time). Mention if waiting vs crafting now is better and why.\n\n${parts.join('\n')}`;
}
