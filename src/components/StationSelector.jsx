import { STATIONS, MAX_STATION_LEVEL } from '../utils/constants.js';

export default function StationSelector({ station, level, onStationChange, onLevelChange }) {
  return (
    <div className="station-selector">
      <div className="control-group">
        <label htmlFor="station-select">Station</label>
        <select
          id="station-select"
          value={station}
          onChange={e => onStationChange(e.target.value)}
        >
          {STATIONS.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div className="control-group">
        <label htmlFor="level-select">Level</label>
        <select
          id="level-select"
          value={level}
          onChange={e => onLevelChange(Number(e.target.value))}
        >
          <option value={0}>All</option>
          {Array.from({ length: MAX_STATION_LEVEL }, (_, i) => i + 1).map(lvl => (
            <option key={lvl} value={lvl}>Lv. {lvl}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
