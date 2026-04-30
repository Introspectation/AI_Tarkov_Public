import { API_URL, FUEL_ITEM_NAMES } from '../utils/constants.js';

const CRAFTS_QUERY = `{
  crafts {
    id
    station {
      id
      name
      normalizedName
    }
    level
    duration
    requiredItems {
      item {
        id
        name
        shortName
        avg24hPrice
        low24hPrice
        high24hPrice
        basePrice
        sellFor {
          vendor { name }
          price
          currency
        }
        buyFor {
          vendor { name }
          price
          currency
        }
        iconLink
        minLevelForFlea
      }
      count
      attributes {
        name
        value
      }
    }
    rewardItems {
      item {
        id
        name
        shortName
        avg24hPrice
        low24hPrice
        high24hPrice
        basePrice
        sellFor {
          vendor { name }
          price
          currency
        }
        buyFor {
          vendor { name }
          price
          currency
        }
        iconLink
        minLevelForFlea
      }
      count
    }
  }
}`;

const FUEL_QUERY = `{
  items(names: ${JSON.stringify(FUEL_ITEM_NAMES)}) {
    id
    name
    shortName
    avg24hPrice
    basePrice
    buyFor {
      vendor { name }
      price
      currency
    }
    iconLink
  }
}`;

async function graphqlFetch(query) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  const json = await response.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${json.errors.map(e => e.message).join(', ')}`);
  }
  return json.data;
}

export async function fetchCrafts() {
  const data = await graphqlFetch(CRAFTS_QUERY);
  return data.crafts;
}

export async function fetchFuelPrices() {
  const data = await graphqlFetch(FUEL_QUERY);
  return data.items;
}

const historicalCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function fetchHistoricalPrices(itemId) {
  const cached = historicalCache.get(itemId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  const query = `{
    historicalItemPrices(id: "${itemId}") {
      price
      priceMin
      timestamp
    }
  }`;
  const data = await graphqlFetch(query);
  const result = data.historicalItemPrices || [];
  historicalCache.set(itemId, { data: result, timestamp: Date.now() });
  return result;
}

const searchCache = new Map();

export async function fetchItemsByName(query) {
  const key = query.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const escaped = query.replace(/"/g, '\\"');
  const gql = `{
    items(name: "${escaped}") {
      id
      name
      shortName
      avg24hPrice
      low24hPrice
      high24hPrice
      basePrice
      sellFor {
        vendor { name }
        price
        currency
      }
      buyFor {
        vendor { name }
        price
        currency
      }
      iconLink
      minLevelForFlea
    }
  }`;
  const data = await graphqlFetch(gql);
  const result = data.items || [];
  searchCache.set(key, { data: result, timestamp: Date.now() });
  return result;
}

export async function fetchAllData() {
  const [crafts, fuelItems] = await Promise.all([
    fetchCrafts(),
    fetchFuelPrices(),
  ]);
  return { crafts, fuelItems };
}
