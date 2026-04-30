import { useState, useEffect, useRef } from 'react';
import { fetchHistoricalPrices } from '../api/tarkovApi.js';

const WIDTH = 500;
const HEIGHT = 140;
const PADDING = 24;
const Y_AXIS_WIDTH = 20;

export default function PriceSparkline({ itemId, itemName, data: externalData }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => {
    if (externalData !== undefined) {
      setData(externalData);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHistoricalPrices(itemId)
      .then(result => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [itemId, externalData]);

  if (loading) {
    return (
      <div className="sparkline-container">
        <span className="sparkline-label">{itemName}</span>
        <span className="sparkline-loading">Loading...</span>
      </div>
    );
  }

  if (error || !data || data.length < 2) {
    return (
      <div className="sparkline-container">
        <span className="sparkline-label">{itemName}</span>
        <span className="sparkline-empty">No price history</span>
      </div>
    );
  }

  // Sort by timestamp ascending
  const sorted = [...data].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const prices = sorted.map(d => d.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  // Chart area bounds
  const chartLeft = PADDING + Y_AXIS_WIDTH;
  const chartRight = WIDTH - PADDING;
  const chartTop = PADDING;
  const chartBottom = HEIGHT - PADDING;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  // Map to SVG coordinates
  const points = sorted.map((d, i) => {
    const x = chartLeft + (i / (sorted.length - 1)) * chartW;
    const y = chartTop + (1 - (d.price - minP) / range) * chartH;
    return { x, y, price: d.price, timestamp: d.timestamp };
  });

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = `M${points[0].x},${chartBottom} ${points.map(p => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},${chartBottom} Z`;

  // Grid lines (4 horizontal lines)
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
    y: chartTop + (1 - pct) * chartH,
    price: minP + pct * range,
  }));

  const formatK = (v) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${Math.round(v / 1000)}K`;
    return Math.round(v).toString();
  };

  const trendUp = prices[prices.length - 1] >= prices[0];
  const color = trendUp ? 'var(--profit-green)' : 'var(--profit-red)';
  const fillColor = trendUp ? 'rgba(76, 175, 80, 0.15)' : 'rgba(231, 76, 60, 0.15)';

  function handleMouseMove(e) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    // Find closest point
    let closest = points[0];
    let closestDist = Infinity;
    for (const p of points) {
      const dist = Math.abs(p.x - mouseX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = p;
      }
    }
    setHover(closest);
  }

  function handleMouseLeave() {
    setHover(null);
  }

  const formatPrice = (p) => Math.round(p).toLocaleString('en-US');
  const formatDate = (ts) => {
    const d = new Date(Number(ts));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="sparkline-container">
      <span className="sparkline-label">{itemName}</span>
      <div className="sparkline-wrapper">
        <svg
          ref={svgRef}
          className="sparkline-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {gridLines.map((g, i) => (
            <g key={i}>
              <line
                x1={chartLeft} y1={g.y}
                x2={chartRight} y2={g.y}
                stroke="var(--border)"
                strokeWidth="0.5"
              />
              <text
                x={chartLeft - 4}
                y={g.y + 3}
                textAnchor="end"
                fill="var(--text-muted)"
                fontSize="9"
              >
                {formatK(g.price)}
              </text>
            </g>
          ))}
          <path d={areaPath} fill={fillColor} />
          <polyline
            points={polyline}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {hover && (
            <>
              <line
                x1={hover.x} y1={chartTop}
                x2={hover.x} y2={chartBottom}
                stroke="var(--text-muted)"
                strokeWidth="0.5"
                strokeDasharray="3,3"
              />
              <line
                x1={chartLeft} y1={hover.y}
                x2={chartRight} y2={hover.y}
                stroke="var(--text-muted)"
                strokeWidth="0.5"
                strokeDasharray="3,3"
              />
              <circle cx={hover.x} cy={hover.y} r="4" fill={color} />
            </>
          )}
        </svg>
        {hover && (
          <div className="sparkline-tooltip" style={{ left: `${(hover.x / WIDTH) * 100}%` }}>
            <div>{formatPrice(hover.price)} &#8381;</div>
            <div className="sparkline-tooltip-date">{formatDate(hover.timestamp)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
