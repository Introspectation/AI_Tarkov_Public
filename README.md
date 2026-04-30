# AI Tarkov - Hideout Profit Calculator

A React + Vite web app for Escape from Tarkov hideout profitability, session planning, and flea-market timing.

## What this project does

- Pulls live craft and item data from `api.tarkov.dev` GraphQL.
- Calculates craft profitability with:
  - Input cost (best RUB buy source)
  - Output value (flea/trader-aware)
  - Flea listing fee
  - Optional fuel cost
  - Net profit and profit per hour
- Supports station/level filters and item search.
- Shows expanded craft details with:
  - Input/output breakdown
  - Volatility badge (stable/moderate/volatile)
  - 7-day price sparklines
  - Craft timing analysis + local AI insight
- Includes a Session Planner tab to optimize crafts for a selected day/time window.
- Includes a Flea Advisor tab with item search, buy/sell timing, and flea-vs-trader recommendation.
- Saves user settings in browser `localStorage`.

## Tech stack

- React 18
- Vite 6
- Plain CSS
- Tarkov.dev GraphQL API
- Optional local Ollama API for AI insight

## Prerequisites

- Node.js 18+
- npm
- Internet access for Tarkov.dev API

Optional (for AI sections):

- Ollama running at `http://localhost:11434`
- Model configured in `src/api/ollamaApi.js` (currently `ministral-3`)

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Open the local URL shown in terminal (usually `http://localhost:5173`).

## Build and preview

Create production build:

```bash
npm run build
```

Preview production build locally:

```bash
npm run preview
```

Stop running dev/preview server with `Ctrl + C`.

## App tabs

1. Craft Calculator
- Ranks crafts by Profit/Hour or Total Profit.
- Supports station, level, flea lock, and search filters.
- Expands each craft with volatility, sparklines, and timing guidance.

2. Session Planner
- Select day and start/end time (GMT+3).
- Predicts input/output prices by day/hour patterns.
- Splits results into "Complete During Session" and "Start Now, Sell Later".
- Optional local AI "Session Game Plan".

3. Flea Advisor
- Debounced item search + popular item chips.
- Per-item buy/sell timing with confidence + best day.
- Flea vs trader comparison using net after fee.
- Optional local AI market insight.

## Calculation and timing notes

- Prices are handled in RUB offers only.
- Tool requirements are detected and treated as not consumed.
- Flea fee logic is implemented in `src/utils/calculator.js`.
- Play window supports both hour range and selected days.
- Historical analysis is normalized to GMT+3 (`Europe/Istanbul`).
- For timing advisor sell logic, when play-window mode is enabled, sell hour is constrained to come after buy hour.
- Historical price and item-search responses are cached in memory for 10 minutes.
- AI responses are cached in memory for 10 minutes.

## Project structure

```text
src/
  api/
    tarkovApi.js          # GraphQL fetch, historical prices, item search
    ollamaApi.js          # Local Ollama integration + response cache
  components/
    CraftTable.jsx
    CraftRow.jsx
    CraftPrediction.jsx
    FleaAdvisor.jsx
    ItemTimingAdvisor.jsx
    PriceSparkline.jsx
    SearchBar.jsx
    SessionPlanner.jsx
    StationSelector.jsx
    UserSettings.jsx
    VolatilityBadge.jsx
  styles/
    app.css               # Main styling
  utils/
    calculator.js         # Profit, fee, fuel, volatility logic
    constants.js          # API URL, station list, defaults, constants
    priceAnalysis.js      # Hour/day pattern analysis + craft timing
    marketAnalysis.js     # Buy/sell timing + flea vs trader logic
    sessionOptimizer.js   # Session-based predicted craft ranking
  App.jsx                 # Main app state and tab orchestration
  main.jsx                # React entry point
```

## Configuration points

- API endpoint: `src/utils/constants.js` (`API_URL`)
- Station list and default settings: `src/utils/constants.js`
- Play window defaults (hour + day): `src/utils/constants.js` (`DEFAULT_SETTINGS`)
- Ollama URL/model/timeout: `src/api/ollamaApi.js`

## Troubleshooting

- If install fails, verify Node.js version is 18+.
- If craft data fails to load, check internet/API availability and click **Retry**.
- If AI panels fail, ensure Ollama is running and model name in `src/api/ollamaApi.js` is available locally.
- If UI shows old preferences, clear browser local storage for this site.
