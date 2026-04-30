import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchHistoricalPrices } from '../api/tarkovApi.js';
import { fetchOllamaInsight } from '../api/ollamaApi.js';
import { formatRoublesUnsigned } from '../utils/calculator.js';
import { calculateTrend } from '../utils/priceAnalysis.js';
import {
  analyzeBuyTiming,
  analyzeSellTiming,
  compareFleaVsTrader,
  buildMarketPrompt,
} from '../utils/marketAnalysis.js';

function ConfidenceBar({ score, label }) {
  return (
    <span className="prediction-confidence">
      <span className="confidence-bar">
        <span className="confidence-fill" style={{ width: `${Math.min(score, 100)}%` }} />
      </span>
      {label}
    </span>
  );
}

export default function ItemTimingAdvisor({ item, settings }) {
  const [historicalData, setHistoricalData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const abortRef = useRef(null);

  // Fetch historical data when item changes
  useEffect(() => {
    if (!item?.id) return;
    let cancelled = false;
    setLoading(true);
    setHistoricalData(null);
    setAiText('');
    setAiError(null);

    fetchHistoricalPrices(item.id)
      .then(data => {
        if (!cancelled) {
          setHistoricalData(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [item?.id]);

  const trend = useMemo(
    () => historicalData ? calculateTrend(historicalData) : null,
    [historicalData]
  );

  const buyAnalysis = useMemo(
    () => historicalData ? analyzeBuyTiming(historicalData, settings) : null,
    [historicalData, settings]
  );

  // When play window is on, sell must come after buy hour
  const buyAfterHour = settings?.playWindowEnabled && buyAnalysis ? buyAnalysis.bestHour : null;

  const sellAnalysis = useMemo(
    () => historicalData && item?.basePrice
      ? analyzeSellTiming(historicalData, item.basePrice, settings, buyAfterHour)
      : null,
    [historicalData, item?.basePrice, settings, buyAfterHour]
  );

  const comparison = useMemo(
    () => item ? compareFleaVsTrader(item, sellAnalysis, settings) : null,
    [item, sellAnalysis, settings]
  );

  // Auto-trigger AI insight
  useEffect(() => {
    if (!trend || !item) return;
    if (!buyAnalysis && !sellAnalysis) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAiLoading(true);
    setAiError(null);
    setAiText('');

    const prompt = buildMarketPrompt(item, buyAnalysis, sellAnalysis, comparison, trend, settings);
    fetchOllamaInsight(`market-${item.id}`, prompt, controller.signal)
      .then(text => {
        if (!controller.signal.aborted) {
          setAiText(text);
          setAiLoading(false);
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setAiError(err.message);
          setAiLoading(false);
        }
      });

    return () => controller.abort();
  }, [trend, buyAnalysis, sellAnalysis, comparison, item]);

  if (!item) return null;

  const currentPrice = item.avg24hPrice || 0;
  const isFleaBanned = !item.avg24hPrice || item.avg24hPrice === 0;

  const trendClass = trend?.direction === 'up'
    ? 'prediction-trend-up'
    : trend?.direction === 'down'
      ? 'prediction-trend-down'
      : 'prediction-trend-flat';

  return (
    <div className="advisor-panel">
      {/* Header */}
      <div className="advisor-header">
        <div className="advisor-header-left">
          {item.iconLink && (
            <img src={item.iconLink} alt={item.shortName} className="item-icon" loading="lazy" />
          )}
          <div>
            <div className="advisor-item-name">{item.name}</div>
            <div className="advisor-item-price">
              Current: <strong>{formatRoublesUnsigned(currentPrice)}</strong>
              {isFleaBanned && <span className="flea-locked-tag">No Flea</span>}
            </div>
          </div>
        </div>
        {trend && (
          <div className={`advisor-trend ${trendClass}`}>
            {trend.direction === 'up' ? '\u2191' : trend.direction === 'down' ? '\u2193' : '\u2192'}{' '}
            {trend.description}
          </div>
        )}
      </div>

      {loading && (
        <div className="advisor-loading">
          <span className="spinner" /> Loading price history...
        </div>
      )}

      {!loading && !historicalData?.length && (
        <div className="advisor-empty">No historical price data available for this item.</div>
      )}

      {!loading && historicalData?.length > 0 && (
        <>
          {/* Buy / Sell Cards */}
          <div className="advisor-cards">
            <div className="advisor-card advisor-card-buy">
              <div className="advisor-card-title">Buy Timing</div>
              {buyAnalysis ? (
                <div className="advisor-card-body">
                  <div className="advisor-card-row">
                    <span className="advisor-card-label">Best hour</span>
                    <span>{buyAnalysis.bestHourLabel}</span>
                  </div>
                  <div className="advisor-card-row">
                    <span className="advisor-card-label">Avg at best</span>
                    <span>~{formatRoublesUnsigned(buyAnalysis.avgAtBest)}</span>
                  </div>
                  <div className="advisor-card-row">
                    <span className="advisor-card-label">Savings</span>
                    <span className="profit-positive">
                      {buyAnalysis.savingsPercent}% cheaper
                    </span>
                  </div>
                  {buyAnalysis.dayPattern && (
                    <div className="advisor-card-row">
                      <span className="advisor-card-label">Best day</span>
                      <span>{buyAnalysis.dayPattern}</span>
                    </div>
                  )}
                  <div className="advisor-card-row">
                    <span className="advisor-card-label">Confidence</span>
                    <ConfidenceBar score={buyAnalysis.confidence.score} label={buyAnalysis.confidence.label} />
                  </div>
                </div>
              ) : (
                <div className="advisor-card-empty">Not enough data</div>
              )}
            </div>

            <div className="advisor-card advisor-card-sell">
              <div className="advisor-card-title">Sell Timing</div>
              {sellAnalysis ? (
                <div className="advisor-card-body">
                  {sellAnalysis.nextSession && (
                    <div className="advisor-card-row">
                      <span className="advisor-card-label sell-next-session">Sell next session</span>
                    </div>
                  )}
                  <div className="advisor-card-row">
                    <span className="advisor-card-label">Best hour</span>
                    <span>{sellAnalysis.bestHourLabel}</span>
                  </div>
                  <div className="advisor-card-row">
                    <span className="advisor-card-label">Peak price</span>
                    <span>~{formatRoublesUnsigned(sellAnalysis.avgAtBest)}</span>
                  </div>
                  <div className="advisor-card-row">
                    <span className="advisor-card-label">Net after fee</span>
                    <span className={sellAnalysis.netAfterFee >= 0 ? '' : 'profit-negative'}>
                      {formatRoublesUnsigned(sellAnalysis.netAfterFee)}
                    </span>
                  </div>
                  <div className="advisor-card-row">
                    <span className="advisor-card-label">Fee at peak</span>
                    <span>{formatRoublesUnsigned(sellAnalysis.feeAtBest)}</span>
                  </div>
                  {sellAnalysis.dayPattern && (
                    <div className="advisor-card-row">
                      <span className="advisor-card-label">Best day</span>
                      <span>{sellAnalysis.dayPattern}</span>
                    </div>
                  )}
                  <div className="advisor-card-row">
                    <span className="advisor-card-label">Confidence</span>
                    <ConfidenceBar score={sellAnalysis.confidence.score} label={sellAnalysis.confidence.label} />
                  </div>
                </div>
              ) : (
                <div className="advisor-card-empty">
                  {isFleaBanned ? 'Item not on flea market' : 'Not enough data'}
                </div>
              )}
            </div>
          </div>

          {/* Flea vs Trader Comparison */}
          {comparison && comparison.recommendation !== 'none' && (
            <div className="advisor-comparison">
              <div className="advisor-comparison-title">Flea vs Trader</div>
              <div className="advisor-comparison-body">
                {comparison.traderName && comparison.traderPrice > 0 && (
                  <div className="advisor-comparison-row">
                    <span>{comparison.traderName}:</span>
                    <strong>{formatRoublesUnsigned(comparison.traderPrice)}</strong>
                    <span className="advisor-comparison-tag">instant</span>
                  </div>
                )}
                {comparison.fleaNet > 0 && (
                  <div className="advisor-comparison-row">
                    <span>Flea (at peak):</span>
                    <strong>{formatRoublesUnsigned(comparison.fleaNet)}</strong>
                    <span className="advisor-comparison-tag">net after fee</span>
                  </div>
                )}
                <div className="advisor-comparison-verdict">
                  <span className={`advisor-badge advisor-badge-${comparison.recommendation}`}>
                    {comparison.recommendation === 'trader' ? `Sell to ${comparison.traderName}`
                      : comparison.recommendation === 'flea_timed' ? 'Sell on Flea (timed)'
                      : 'Sell on Flea'}
                  </span>
                  <span className="advisor-comparison-reason">{comparison.reason}</span>
                </div>
              </div>
            </div>
          )}

          {/* AI Insight */}
          <div className="prediction-ai">
            <div className="prediction-ai-header">
              <span className="prediction-ai-icon">AI</span>
              Market Insight
            </div>
            {aiLoading && (
              <div className="prediction-ai-loading">
                <span className="spinner" /> Analyzing market patterns...
              </div>
            )}
            {aiError && (
              <div className="prediction-ai-error">{aiError}</div>
            )}
            {aiText && (
              <div className="prediction-ai-text">{aiText}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
