import { useState, useEffect, useCallback } from 'react';
import { fetchAllData } from './api/tarkovApi.js';
import { rankCrafts, calculateFuelCostPerHour, formatRoublesUnsigned } from './utils/calculator.js';
import { DEFAULT_SETTINGS } from './utils/constants.js';
import StationSelector from './components/StationSelector.jsx';
import UserSettings from './components/UserSettings.jsx';
import SearchBar from './components/SearchBar.jsx';
import CraftTable from './components/CraftTable.jsx';
import SessionPlanner from './components/SessionPlanner.jsx';
import FleaAdvisor from './components/FleaAdvisor.jsx';

const SETTINGS_KEY = 'tarkov-calc-settings';
const STATION_KEY = 'tarkov-calc-station';
const LEVEL_KEY = 'tarkov-calc-level';

function loadFromStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [crafts, setCrafts] = useState([]);
  const [fuelItems, setFuelItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [settings, setSettings] = useState(() => loadFromStorage(SETTINGS_KEY, DEFAULT_SETTINGS));
  const [station, setStation] = useState(() => loadFromStorage(STATION_KEY, 'all'));
  const [level, setLevel] = useState(() => loadFromStorage(LEVEL_KEY, 0));
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('calculator');

  // Persist settings to localStorage
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    localStorage.setItem(STATION_KEY, JSON.stringify(station));
  }, [station]);
  useEffect(() => {
    localStorage.setItem(LEVEL_KEY, JSON.stringify(level));
  }, [level]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllData();
      setCrafts(data.crafts);
      setFuelItems(data.fuelItems);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const results = crafts.length > 0
    ? rankCrafts(crafts, settings, fuelItems, station, level, searchQuery)
    : [];

  const fuelCostPerHour = fuelItems.length > 0
    ? calculateFuelCostPerHour(settings, fuelItems)
    : 0;

  const timeSinceUpdate = lastUpdated
    ? Math.round((Date.now() - lastUpdated.getTime()) / 60000)
    : null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Tarkov Hideout Profit Calculator</h1>
      </header>

      <div className="controls-panel">
        <div className="controls-top-row">
          <StationSelector
            station={station}
            level={level}
            onStationChange={setStation}
            onLevelChange={setLevel}
          />
          <SearchBar query={searchQuery} onChange={setSearchQuery} />
        </div>
        <UserSettings settings={settings} onSettingsChange={setSettings} />
      </div>

      <div className="info-bar">
        <span>
          Fuel cost: <strong>{formatRoublesUnsigned(fuelCostPerHour)}/hr</strong>
        </span>
        <span>
          {timeSinceUpdate !== null && (
            <>Last updated: {timeSinceUpdate < 1 ? 'just now' : `${timeSinceUpdate} min ago`}</>
          )}
        </span>
        <button className="refresh-btn" onClick={loadData} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh Prices'}
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span>Error: {error}</span>
          <button onClick={loadData}>Retry</button>
        </div>
      )}

      <div className="tab-bar">
        <button
          className={`tab ${activeTab === 'calculator' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('calculator')}
        >
          Craft Calculator
        </button>
        <button
          className={`tab ${activeTab === 'session' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('session')}
        >
          Session Planner
        </button>
        <button
          className={`tab ${activeTab === 'flea-advisor' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('flea-advisor')}
        >
          Flea Advisor
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading craft data...</div>
      ) : activeTab === 'calculator' ? (
        <>
          <div className="results-count">{results.length} crafts found</div>
          <CraftTable results={results} settings={settings} />
        </>
      ) : activeTab === 'session' ? (
        <SessionPlanner
          crafts={crafts}
          settings={settings}
          fuelItems={fuelItems}
          station={station}
          level={level}
        />
      ) : (
        <FleaAdvisor crafts={crafts} settings={settings} />
      )}
    </div>
  );
}
