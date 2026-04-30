import CraftRow from './CraftRow.jsx';

export default function CraftTable({ results, settings }) {
  if (results.length === 0) {
    return <div className="no-results">No crafts found for this filter.</div>;
  }

  return (
    <div className="craft-table-wrapper">
      <table className="craft-table">
        <thead>
          <tr>
            <th className="rank-col">#</th>
            <th className="output-col">Output</th>
            <th className="station-col">Station</th>
            <th className="level-col">Lvl</th>
            <th className="duration-col">Time</th>
            <th className="input-col">Input Cost</th>
            <th className="profit-col">Profit</th>
            <th className="profit-col">Profit/hr</th>
            <th className="expand-col"></th>
          </tr>
        </thead>
        <tbody>
          {results.map((result, i) => (
            <CraftRow key={result.craft.id} result={result} rank={i + 1} settings={settings} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
