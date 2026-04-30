import { formatRoubles } from '../utils/calculator.js';

const COLORS = {
  stable: 'var(--profit-green)',
  moderate: '#f0ad4e',
  volatile: 'var(--profit-red)',
};

export default function VolatilityBadge({ volatility }) {
  if (!volatility) return null;

  const { bestProfit, worstProfit, profitRange, stabilityRating, stabilityLabel } = volatility;
  const color = COLORS[stabilityRating];

  // Bar width: normalize range to 0-100% (cap at 200K range for display)
  const barPercent = Math.min((profitRange / 200000) * 100, 100);

  return (
    <div className="volatility-badge">
      <div className="volatility-header">
        <span className="volatility-label" style={{ color }}>
          {stabilityLabel}
        </span>
        <span className="volatility-range-text">
          {formatRoubles(worstProfit)} to {formatRoubles(bestProfit)}
        </span>
      </div>
      <div className="volatility-bar-track">
        <div
          className="volatility-bar-fill"
          style={{ width: `${barPercent}%`, backgroundColor: color }}
        />
        <div
          className="volatility-bar-marker"
          style={{ left: `${barPercent > 0 ? ((-worstProfit) / profitRange * 100) : 50}%` }}
          title="Average profit"
        />
      </div>
      <div className="volatility-range-labels">
        <span>Worst</span>
        <span>Best</span>
      </div>
    </div>
  );
}
