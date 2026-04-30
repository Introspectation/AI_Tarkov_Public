import { useMemo, useState, useEffect, useRef } from 'react';
import { analyzePricePatterns, buildOllamaPrompt } from '../utils/priceAnalysis.js';
import { fetchOllamaInsight } from '../api/ollamaApi.js';

const BADGE_CLASSES = {
  craft_now: 'prediction-badge prediction-badge-craft_now',
  wait: 'prediction-badge prediction-badge-wait',
  trending_down: 'prediction-badge prediction-badge-trending_down',
  insufficient_data: 'prediction-badge prediction-badge-neutral',
};

const TREND_ARROWS = {
  up: { symbol: '\u2191', className: 'prediction-trend-up' },
  down: { symbol: '\u2193', className: 'prediction-trend-down' },
  flat: { symbol: '\u2192', className: 'prediction-trend-flat' },
};

export default function CraftPrediction({ craft, historicalData, inputs, outputs, loading, settings }) {
  const [aiText, setAiText] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiElapsed, setAiElapsed] = useState(0);
  const aiControllerRef = useRef(null);

  const analysis = useMemo(() => {
    if (loading || !historicalData) return null;
    return analyzePricePatterns(historicalData, inputs, outputs, settings);
  }, [historicalData, inputs, outputs, loading, settings]);

  // Elapsed timer while AI is loading
  useEffect(() => {
    if (!aiLoading) { setAiElapsed(0); return; }
    const t = setInterval(() => setAiElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [aiLoading]);

  useEffect(() => {
    if (!analysis || analysis.recommendation === 'insufficient_data') return;

    const controller = new AbortController();
    aiControllerRef.current = controller;
    setAiLoading(true);
    setAiError(null);

    const prompt = buildOllamaPrompt(craft, analysis, inputs, outputs, settings);
    fetchOllamaInsight(craft.id, prompt, controller.signal)
      .then(text => {
        if (!controller.signal.aborted) {
          setAiText(text);
          setAiLoading(false);
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setAiError(err.message);
        }
        setAiLoading(false);
      });

    return () => { controller.abort(); };
  }, [analysis, craft, inputs, outputs]);

  function stopAi() {
    aiControllerRef.current?.abort();
    setAiLoading(false);
    setAiError('AI analysis cancelled');
  }

  if (loading) {
    return (
      <div className="prediction-section">
        <h4>Craft Timing</h4>
        <span className="sparkline-loading">Analyzing prices...</span>
      </div>
    );
  }

  if (!analysis) return null;

  const trend = TREND_ARROWS[analysis.trend.direction] || TREND_ARROWS.flat;
  const badgeClass = BADGE_CLASSES[analysis.recommendation] || BADGE_CLASSES.craft_now;

  return (
    <div className="prediction-section">
      <h4>Craft Timing</h4>

      <div className={badgeClass}>
        {analysis.recommendationText}
        {analysis.waitHours > 0 && <span className="prediction-wait-hours"> (~{analysis.waitHours}h)</span>}
      </div>

      <div className="prediction-details">
        <div className="prediction-detail-row">
          <span className="prediction-label">Trend</span>
          <span className={trend.className}>
            {trend.symbol} {analysis.trend.description}
          </span>
        </div>

        {analysis.bestCraftTime && (
          <div className="prediction-detail-row">
            <span className="prediction-label">Best Window</span>
            <span>{analysis.bestCraftTime.label}</span>
          </div>
        )}

        {analysis.dayOfWeekPattern && (
          <div className="prediction-detail-row">
            <span className="prediction-label">Day Pattern</span>
            <span>{analysis.dayOfWeekPattern.description}</span>
          </div>
        )}

        <div className="prediction-detail-row">
          <span className="prediction-label">Confidence</span>
          <span className="prediction-confidence">
            <span className="confidence-bar">
              <span
                className="confidence-fill"
                style={{ width: `${analysis.confidence.score}%` }}
              />
            </span>
            {analysis.confidenceLabel}
          </span>
        </div>
      </div>

      <div className="prediction-ai">
        <div className="prediction-ai-header">
          <span className="prediction-ai-icon">AI</span>
          <span>Local AI Insight</span>
        </div>
        {aiLoading && (
          <div className="prediction-ai-text prediction-ai-loading">
            <span className="spinner" /> Analyzing with local AI...{aiElapsed > 5 ? ` (${aiElapsed}s — first request loads the model)` : ''}
            <button className="session-ai-stop" onClick={stopAi}>Stop</button>
          </div>
        )}
        {aiError && (
          <div className="prediction-ai-text prediction-ai-error">{aiError}</div>
        )}
        {aiText && !aiLoading && (
          <div className="prediction-ai-text">{aiText}</div>
        )}
        {!aiLoading && !aiError && !aiText && analysis.recommendation === 'insufficient_data' && (
          <div className="prediction-ai-text prediction-ai-error">Not enough data for AI analysis</div>
        )}
      </div>
    </div>
  );
}
