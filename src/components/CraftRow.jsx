import { useState, useEffect } from 'react';
import { formatRoubles, formatRoublesUnsigned, formatDuration } from '../utils/calculator.js';
import { fetchHistoricalPrices } from '../api/tarkovApi.js';
import { getItemTimingBadge } from '../utils/marketAnalysis.js';
import VolatilityBadge from './VolatilityBadge.jsx';
import PriceSparkline from './PriceSparkline.jsx';
import CraftPrediction from './CraftPrediction.jsx';

const STABILITY_COLORS = {
  stable: 'var(--profit-green)',
  moderate: '#f0ad4e',
  volatile: 'var(--profit-red)',
};

export default function CraftRow({ result, rank, settings }) {
  const [expanded, setExpanded] = useState(false);
  const [historicalData, setHistoricalData] = useState({});
  const [histLoading, setHistLoading] = useState(false);
  const { craft, inputs, outputs, inputCost, outputValue, fuelCost, totalFleaFee, netProfit, profitPerHour, volatility } = result;

  const isProfitable = netProfit >= 0;
  const profitClass = isProfitable ? 'profit-positive' : 'profit-negative';

  // Primary output display
  const primaryOutput = outputs[0];
  const outputLabel = outputs.map(o =>
    `${o.item.shortName}${o.count > 1 ? ' x' + o.count : ''}`
  ).join(' + ');

  // Items to show sparklines for: all outputs + most expensive non-tool input
  const chartItems = [];
  for (const out of outputs) {
    chartItems.push({ id: out.item.id, name: out.item.shortName });
  }
  const expensiveInput = inputs
    .filter(i => !i.isTool && i.totalPrice > 0)
    .sort((a, b) => b.totalPrice - a.totalPrice)[0];
  if (expensiveInput && !chartItems.some(c => c.id === expensiveInput.item.id)) {
    chartItems.push({ id: expensiveInput.item.id, name: expensiveInput.item.shortName });
  }

  useEffect(() => {
    if (!expanded || chartItems.length === 0) return;
    // Skip if we already have data for all chart items
    if (chartItems.every(ci => historicalData[ci.id] !== undefined)) return;

    let cancelled = false;
    setHistLoading(true);

    Promise.all(chartItems.map(ci =>
      fetchHistoricalPrices(ci.id).then(data => ({ id: ci.id, data }))
    ))
      .then(results => {
        if (!cancelled) {
          const dataMap = {};
          for (const r of results) dataMap[r.id] = r.data;
          setHistoricalData(dataMap);
          setHistLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setHistLoading(false);
      });

    return () => { cancelled = true; };
  }, [expanded]);

  return (
    <>
      <tr className={`craft-row ${profitClass}`} onClick={() => setExpanded(!expanded)}>
        <td className="rank-col">{rank}</td>
        <td className="output-col">
          <div className="output-cell">
            {primaryOutput?.item.iconLink && (
              <img
                src={primaryOutput.item.iconLink}
                alt={primaryOutput.item.shortName}
                className="item-icon"
                loading="lazy"
              />
            )}
            <span>{outputLabel}</span>
          </div>
        </td>
        <td className="station-col">{craft.station.name}</td>
        <td className="level-col">{craft.level}</td>
        <td className="duration-col">{formatDuration(craft.duration)}</td>
        <td className="input-col">{formatRoublesUnsigned(inputCost)}</td>
        <td className={`profit-col ${profitClass}`}>{formatRoubles(netProfit)}</td>
        <td className={`profit-col ${profitClass}`}>
          {volatility && (
            <span
              className="stability-dot"
              style={{ backgroundColor: STABILITY_COLORS[volatility.stabilityRating] }}
              title={`${volatility.stabilityLabel} - Range: ${formatRoubles(volatility.worstProfit)} to ${formatRoubles(volatility.bestProfit)}`}
            />
          )}
          {formatRoubles(profitPerHour)}/hr
        </td>
        <td className="expand-col">{expanded ? '\u25B2' : '\u25BC'}</td>
      </tr>
      {expanded && (
        <tr className="craft-detail-row">
          <td colSpan={9}>
            <div className="craft-detail">
              <div className="detail-section">
                <h4>Inputs</h4>
                <ul>
                  {inputs.map((inp, i) => {
                    const badge = historicalData[inp.item.id] ? getItemTimingBadge(historicalData[inp.item.id], settings) : null;
                    return (
                      <li key={i} className={inp.isTool ? 'tool-item' : ''}>
                        {inp.item.iconLink && (
                          <img src={inp.item.iconLink} alt="" className="item-icon-sm" loading="lazy" />
                        )}
                        {inp.count}x {inp.item.shortName}
                        {inp.isTool
                          ? ' (tool - not consumed)'
                          : ` @ ${formatRoublesUnsigned(inp.unitPrice)} = ${formatRoublesUnsigned(inp.totalPrice)}`
                        }
                        <span className="source-tag">{inp.source}</span>
                        {badge && <span className={`timing-badge timing-badge-${badge.color}`}>{badge.label}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="detail-section">
                <h4>Outputs</h4>
                <ul>
                  {outputs.map((out, i) => {
                    const badge = historicalData[out.item.id] ? getItemTimingBadge(historicalData[out.item.id], settings) : null;
                    return (
                      <li key={i}>
                        {out.item.iconLink && (
                          <img src={out.item.iconLink} alt="" className="item-icon-sm" loading="lazy" />
                        )}
                        {out.count}x {out.item.shortName}
                        {` @ ${formatRoublesUnsigned(out.unitPrice)} = ${formatRoublesUnsigned(out.totalValue)}`}
                        {out.fleaLocked && (
                          <span className="flea-locked-tag" title={`Flea market requires level ${out.item.minLevelForFlea}`}>
                            Lv{out.item.minLevelForFlea}
                          </span>
                        )}
                        {badge && <span className={`timing-badge timing-badge-${badge.color}`}>{badge.label}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
              {volatility && (
                <div className="detail-section">
                  <h4>Price Volatility</h4>
                  <VolatilityBadge volatility={volatility} />
                </div>
              )}
              <div className="detail-charts">
                <h4>Price History (7 days)</h4>
                <div className="sparkline-row">
                  {chartItems.map(ci => (
                    <PriceSparkline key={ci.id} itemId={ci.id} itemName={ci.name} data={historicalData[ci.id]} />
                  ))}
                </div>
              </div>
              <CraftPrediction
                craft={craft}
                historicalData={historicalData}
                inputs={inputs}
                outputs={outputs}
                loading={histLoading}
                settings={settings}
              />
              <div className="detail-summary">
                <span>Input: {formatRoublesUnsigned(inputCost)}</span>
                <span>Output: {formatRoublesUnsigned(outputValue)}</span>
                <span>Fuel: {formatRoublesUnsigned(fuelCost)}</span>
                <span>Flea Fee: {formatRoublesUnsigned(totalFleaFee)}</span>
                <span className={profitClass}>Net: {formatRoubles(netProfit)}</span>
                <span className={profitClass}>Per hour: {formatRoubles(profitPerHour)}/hr</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
