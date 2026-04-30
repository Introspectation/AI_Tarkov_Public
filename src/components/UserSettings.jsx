const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function UserSettings({ settings, onSettingsChange }) {
  const update = (key, value) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const toggleDay = (dayIndex) => {
    const days = settings.playWindowDays || [0, 1, 2, 3, 4, 5, 6];
    const next = days.includes(dayIndex)
      ? days.filter(d => d !== dayIndex)
      : [...days, dayIndex].sort((a, b) => a - b);
    if (next.length > 0) update('playWindowDays', next);
  };

  return (
    <div className="user-settings">
      <div className="settings-row">
        <div className="control-group">
          <label htmlFor="player-level">
            Player Level: <span className="value-badge">{settings.playerLevel}</span>
          </label>
          <input
            id="player-level"
            type="range"
            min={1}
            max={79}
            value={settings.playerLevel}
            onChange={e => update('playerLevel', Number(e.target.value))}
          />
        </div>

        <div className="control-group">
          <label htmlFor="mgmt-level">
            Hideout Mgmt: <span className="value-badge">{settings.hideoutMgmtLevel}</span>
          </label>
          <input
            id="mgmt-level"
            type="range"
            min={0}
            max={50}
            value={settings.hideoutMgmtLevel}
            onChange={e => update('hideoutMgmtLevel', Number(e.target.value))}
          />
        </div>

        <div className="control-group">
          <label>Intel Center</label>
          <div className="button-group">
            {[0, 1, 2, 3].map(lvl => (
              <button
                key={lvl}
                className={settings.intelCenterLevel === lvl ? 'active' : ''}
                onClick={() => update('intelCenterLevel', lvl)}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-row">
        <div className="control-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.solarPower}
              onChange={e => update('solarPower', e.target.checked)}
            />
            Solar Power
          </label>
        </div>

        <div className="control-group">
          <label htmlFor="fuel-type">Fuel</label>
          <select
            id="fuel-type"
            value={settings.fuelType}
            onChange={e => update('fuelType', e.target.value)}
          >
            <option value="expeditionary">Expeditionary (60u)</option>
            <option value="metal">Metal (100u)</option>
          </select>
        </div>

        <div className="control-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.includeFuelCost}
              onChange={e => update('includeFuelCost', e.target.checked)}
            />
            Include fuel cost
          </label>
        </div>

        <div className="control-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.hideFleaLocked}
              onChange={e => update('hideFleaLocked', e.target.checked)}
            />
            Hide flea-locked
          </label>
        </div>

        <div className="control-group">
          <label htmlFor="sort-by">Sort by</label>
          <select
            id="sort-by"
            value={settings.sortBy}
            onChange={e => update('sortBy', e.target.value)}
          >
            <option value="profitPerHour">Profit / Hour</option>
            <option value="totalProfit">Total Profit</option>
          </select>
        </div>
      </div>

      <div className="settings-row">
        <div className="control-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.playWindowEnabled}
              onChange={e => update('playWindowEnabled', e.target.checked)}
            />
            Play Window
          </label>
        </div>
        <div className="control-group play-window-controls">
          <label htmlFor="play-start">Start</label>
          <input
            id="play-start"
            type="time"
            value={settings.playWindowStart}
            disabled={!settings.playWindowEnabled}
            onChange={e => update('playWindowStart', e.target.value)}
          />
        </div>
        <div className="control-group play-window-controls">
          <label htmlFor="play-end">End</label>
          <input
            id="play-end"
            type="time"
            value={settings.playWindowEnd}
            disabled={!settings.playWindowEnabled}
            onChange={e => update('playWindowEnd', e.target.value)}
          />
        </div>
        <div className="control-group">
          <label>Days</label>
          <div className="button-group play-day-buttons">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                className={(settings.playWindowDays || [0,1,2,3,4,5,6]).includes(i) ? 'active' : ''}
                disabled={!settings.playWindowEnabled}
                onClick={() => toggleDay(i)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
