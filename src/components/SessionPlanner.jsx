import { useState, useEffect, useMemo, useRef } from 'react';
import { rankCrafts, formatRoubles, formatRoublesUnsigned, formatDuration } from '../utils/calculator.js';
import { fetchHistoricalPrices } from '../api/tarkovApi.js';
import { optimizeCraftsForSession, buildSessionOllamaPrompt } from '../utils/sessionOptimizer.js';
import { fetchOllamaInsight } from '../api/ollamaApi.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TOP_N = 20;
const TZ = 'Europe/Istanbul';

function getCurrentDay() {
  return new Date().toLocaleString('en-US', { timeZone: TZ, weekday: 'long' });
}

export default function SessionPlanner({ crafts, settings, fuelItems, station, level }) {
  const [day, setDay] = useState(getCurrentDay);
  const [startTime, setStartTime] = useState('21:00');
  const [endTime, setEndTime] = useState('23:30');
  const [historicalData, setHistoricalData] = useState({});
  const [fetchDone, setFetchDone] = useState(0);
  const [fetchTotal, setFetchTotal] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [aiText, setAiText] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiElapsed, setAiElapsed] = useState(0);
  const aiControllerRef = useRef(null);

  const startHour = useMemo(() => {
    const [h, m] = startTime.split(':').map(Number);
    return h + (m || 0) / 60;
  }, [startTime]);

  const endHour = useMemo(() => {
    const [h, m] = endTime.split(':').map(Number);
    return h + (m || 0) / 60;
  }, [endTime]);

  // Top crafts by current prices (pre-filter for efficiency)
  const topCrafts = useMemo(() => {
    if (crafts.length === 0) return [];
    return rankCrafts(crafts, settings, fuelItems, station, level, '').slice(0, TOP_N);
  }, [crafts, settings, fuelItems, station, level]);

  // Unique item IDs we need historical data for
  const itemIds = useMemo(() => {
    const ids = new Set();
    for (const r of topCrafts) {
      for (const inp of r.inputs) ids.add(inp.item.id);
      for (const out of r.outputs) ids.add(out.item.id);
    }
    return [...ids];
  }, [topCrafts]);

  // Fetch historical data with concurrency-limited workers
  useEffect(() => {
    const toFetch = itemIds.filter(id => !historicalData[id]);
    if (toFetch.length === 0) return;

    let cancelled = false;
    setFetching(true);
    setFetchDone(0);
    setFetchTotal(toFetch.length);

    const dataMap = { ...historicalData };
    let done = 0;
    const queue = [...toFetch];

    async function worker() {
      while (queue.length > 0 && !cancelled) {
        const id = queue.shift();
        try {
          dataMap[id] = await fetchHistoricalPrices(id);
        } catch {
          dataMap[id] = [];
        }
        done++;
        if (!cancelled) setFetchDone(done);
      }
    }

    const workers = Array(Math.min(5, queue.length)).fill(null).map(() => worker());
    Promise.all(workers).then(() => {
      if (!cancelled) {
        setHistoricalData(dataMap);
        setFetching(false);
      }
    });

    return () => { cancelled = true; };
  }, [itemIds]);

  // Session-optimized results
  const sessionResults = useMemo(() => {
    if (fetching || topCrafts.length === 0) return [];
    const rawCrafts = topCrafts.map(r => r.craft);
    return optimizeCraftsForSession(rawCrafts, settings, fuelItems, { day, startHour, endHour }, historicalData);
  }, [fetching, topCrafts, settings, fuelItems, day, startHour, endHour, historicalData]);

  const inSession = sessionResults.filter(r => r.finishesInSession);
  const sellLater = sessionResults.filter(r => !r.finishesInSession);

  // Reset AI when config changes
  useEffect(() => {
    setAiText(null);
    setAiError(null);
  }, [day, startTime, endTime]);

  // AI elapsed timer
  useEffect(() => {
    if (!aiLoading) { setAiElapsed(0); return; }
    const t = setInterval(() => setAiElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [aiLoading]);

  function requestAiPlan() {
    if (sessionResults.length === 0) return;
    const controller = new AbortController();
    aiControllerRef.current = controller;
    setAiLoading(true);
    setAiError(null);
    setAiText(null);

    const prompt = buildSessionOllamaPrompt(sessionResults, { day, startHour, endHour });
    fetchOllamaInsight(`session-${day}-${startHour}-${endHour}`, prompt, controller.signal)
      .then(text => { setAiText(text); setAiLoading(false); })
      .catch(err => { if (!controller.signal.aborted) setAiError(err.message); setAiLoading(false); });
  }

  function stopAi() {
    aiControllerRef.current?.abort();
    setAiLoading(false);
    setAiError('AI analysis cancelled');
  }

  const sessionDuration = startHour < endHour
    ? endHour - startHour
    : 24 - startHour + endHour;
  const durationLabel = `${Math.floor(sessionDuration)}h ${Math.round((sessionDuration % 1) * 60)}m`;

  return (
    <div className="session-planner">
      <div className="session-config">
        <h3 className="session-config-title">Plan Your Session</h3>
        <div className="session-config-row">
          <div className="control-group">
            <label>Day</label>
            <select value={day} onChange={e => setDay(e.target.value)}>
              {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="control-group">
            <label>Start (GMT+3)</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div className="control-group">
            <label>End (GMT+3)</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
          <div className="session-duration-badge">
            {durationLabel} session
          </div>
        </div>
      </div>

      {fetching && (
        <div className="session-loading">
          <span className="spinner" /> Fetching price history... {fetchDone}/{fetchTotal} items
          <div className="session-progress-bar">
            <div
              className="session-progress-fill"
              style={{ width: fetchTotal > 0 ? `${(fetchDone / fetchTotal) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {!fetching && sessionResults.length > 0 && (
        <>
          {inSession.length > 0 && (
            <div className="session-group">
              <h4>Complete During Session ({inSession.length})</h4>
              <SessionTable results={inSession} />
            </div>
          )}

          {sellLater.length > 0 && (
            <div className="session-group">
              <h4>Start Now, Sell Later ({sellLater.length})</h4>
              <SessionTable results={sellLater} />
            </div>
          )}

          <div className="prediction-ai">
            <div className="prediction-ai-header">
              <span className="prediction-ai-icon">AI</span>
              <span>Session Game Plan</span>
              {!aiLoading && !aiText && (
                <button className="session-ai-btn" onClick={requestAiPlan}>Generate</button>
              )}
            </div>
            {aiLoading && (
              <div className="prediction-ai-text prediction-ai-loading">
                <span className="spinner" /> Planning your session...{aiElapsed > 5 ? ` (${aiElapsed}s)` : ''}
                <button className="session-ai-stop" onClick={stopAi}>Stop</button>
              </div>
            )}
            {aiError && <div className="prediction-ai-text prediction-ai-error">{aiError}</div>}
            {aiText && !aiLoading && <div className="prediction-ai-text">{aiText}</div>}
          </div>
        </>
      )}

      {!fetching && sessionResults.length === 0 && topCrafts.length === 0 && (
        <div className="no-results">No crafts match your current filters</div>
      )}
    </div>
  );
}

function SessionTable({ results }) {
  return (
    <div className="craft-table-wrapper">
      <table className="craft-table session-table">
        <thead>
          <tr>
            <th className="rank-col">#</th>
            <th>Craft</th>
            <th className="station-col">Station</th>
            <th>Duration</th>
            <th>Timing</th>
            <th className="profit-col">Predicted</th>
            <th className="profit-col">₽/hr</th>
            <th className="expand-col"></th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <SessionRow key={r.craft.id} result={r} rank={i + 1} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceDelta({ predicted, current }) {
  if (!current || current === 0) return null;
  const diff = ((predicted - current) / current) * 100;
  if (Math.abs(diff) < 0.5) return null;
  const cls = diff > 0 ? 'prediction-trend-up' : 'prediction-trend-down';
  return <span className={`session-delta ${cls}`}>{diff > 0 ? '+' : ''}{diff.toFixed(1)}%</span>;
}

function SessionRow({ result, rank }) {
  const [expanded, setExpanded] = useState(false);
  const { craft, predictedProfit, profitPerHour, timingNote, predictedInputCost, predictedOutputValue, predictedFees, fuelCost } = result;
  const isProfitable = predictedProfit >= 0;
  const profitClass = isProfitable ? 'profit-positive' : 'profit-negative';

  const outputLabel = result.outputDetails.map(o =>
    `${o.item.shortName}${o.count > 1 ? ' x' + o.count : ''}`
  ).join(' + ');

  const primaryOutput = result.outputDetails[0];

  return (
    <>
      <tr className={`craft-row ${profitClass}`} onClick={() => setExpanded(!expanded)}>
        <td className="rank-col">{rank}</td>
        <td>
          <div className="output-cell">
            {primaryOutput?.item.iconLink && (
              <img src={primaryOutput.item.iconLink} alt="" className="item-icon" loading="lazy" />
            )}
            <span>{outputLabel}</span>
          </div>
        </td>
        <td className="station-col">{craft.station.name} L{craft.level}</td>
        <td>{formatDuration(craft.duration)}</td>
        <td className="session-timing-cell">{timingNote}</td>
        <td className={`profit-col ${profitClass}`}>{formatRoubles(predictedProfit)}</td>
        <td className={`profit-col ${profitClass}`}>{formatRoubles(profitPerHour)}/hr</td>
        <td className="expand-col">{expanded ? '\u25B2' : '\u25BC'}</td>
      </tr>
      {expanded && (
        <tr className="craft-detail-row">
          <td colSpan={8}>
            <div className="craft-detail session-detail">
              <div className="detail-section">
                <h4>Inputs (predicted buy price)</h4>
                <ul>
                  {result.inputDetails.map((inp, i) => (
                    <li key={i} className={inp.isTool ? 'tool-item' : ''}>
                      {inp.item.iconLink && (
                        <img src={inp.item.iconLink} alt="" className="item-icon-sm" loading="lazy" />
                      )}
                      {inp.count}x {inp.item.shortName}
                      {inp.isTool
                        ? ' (tool - not consumed)'
                        : <>
                            {' @ '}{formatRoublesUnsigned(inp.predictedPrice)}
                            {' = '}{formatRoublesUnsigned(inp.predictedPrice * inp.count)}
                            <PriceDelta predicted={inp.predictedPrice} current={inp.currentPrice} />
                          </>
                      }
                    </li>
                  ))}
                </ul>
              </div>
              <div className="detail-section">
                <h4>Outputs (predicted sell price)</h4>
                <ul>
                  {result.outputDetails.map((out, i) => (
                    <li key={i}>
                      {out.item.iconLink && (
                        <img src={out.item.iconLink} alt="" className="item-icon-sm" loading="lazy" />
                      )}
                      {out.count}x {out.item.shortName}
                      {' @ '}{formatRoublesUnsigned(out.predictedPrice)}
                      {' = '}{formatRoublesUnsigned(out.totalValue)}
                      <PriceDelta predicted={out.predictedPrice} current={out.currentPrice} />
                      {out.item.minLevelForFlea > 0 && (
                        <span className="flea-locked-tag" title={`Flea market requires level ${out.item.minLevelForFlea}`}>
                          Lv{out.item.minLevelForFlea}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="detail-summary">
                <span>Input: {formatRoublesUnsigned(predictedInputCost)}</span>
                <span>Output: {formatRoublesUnsigned(predictedOutputValue)}</span>
                <span>Fuel: {formatRoublesUnsigned(fuelCost)}</span>
                <span>Flea Fee: {formatRoublesUnsigned(predictedFees)}</span>
                <span className={profitClass}>Net: {formatRoubles(predictedProfit)}</span>
                <span className={profitClass}>Per hour: {formatRoubles(profitPerHour)}/hr</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
