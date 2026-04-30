import { useState, useEffect, useRef, useMemo } from 'react';
import { fetchItemsByName } from '../api/tarkovApi.js';
import { formatRoublesUnsigned } from '../utils/calculator.js';
import ItemTimingAdvisor from './ItemTimingAdvisor.jsx';

export default function FleaAdvisor({ crafts, settings }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  // Popular items from crafts (unique, sorted by price)
  const popularItems = useMemo(() => {
    if (!crafts || crafts.length === 0) return [];
    const seen = new Set();
    const items = [];
    for (const craft of crafts) {
      for (const req of craft.requiredItems) {
        if (!seen.has(req.item.id) && req.item.avg24hPrice > 0) {
          seen.add(req.item.id);
          items.push(req.item);
        }
      }
      for (const rew of craft.rewardItems) {
        if (!seen.has(rew.item.id) && rew.item.avg24hPrice > 0) {
          seen.add(rew.item.id);
          items.push(rew.item);
        }
      }
    }
    items.sort((a, b) => b.avg24hPrice - a.avg24hPrice);
    return items.slice(0, 20);
  }, [crafts]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchQuery.length < 2) {
      setSearchResults([]);
      setDropdownOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setSearching(true);
      fetchItemsByName(searchQuery)
        .then(results => {
          setSearchResults(results);
          setDropdownOpen(results.length > 0);
          setSearching(false);
        })
        .catch(() => {
          setSearchResults([]);
          setDropdownOpen(false);
          setSearching(false);
        });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function selectItem(item) {
    setSelectedItem(item);
    setSearchQuery('');
    setSearchResults([]);
    setDropdownOpen(false);
  }

  return (
    <div className="flea-advisor">
      <div className="flea-search-row">
        <div className="flea-search-wrapper" ref={wrapperRef}>
          <input
            className="flea-search"
            type="text"
            placeholder="Search item name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => { if (searchResults.length > 0) setDropdownOpen(true); }}
          />
          {searching && <span className="flea-search-spinner"><span className="spinner" /></span>}
          {dropdownOpen && searchResults.length > 0 && (
            <div className="flea-search-dropdown">
              {searchResults.slice(0, 15).map(item => (
                <button
                  key={item.id}
                  className="flea-search-item"
                  onClick={() => selectItem(item)}
                >
                  {item.iconLink && (
                    <img src={item.iconLink} alt="" className="item-icon-sm" loading="lazy" />
                  )}
                  <span className="flea-search-item-name">{item.name}</span>
                  <span className="flea-search-item-price">
                    {item.avg24hPrice > 0 ? formatRoublesUnsigned(item.avg24hPrice) : 'No flea'}
                  </span>
                </button>
              ))}
            </div>
          )}
          {dropdownOpen && searchResults.length === 0 && searchQuery.length >= 2 && !searching && (
            <div className="flea-search-dropdown">
              <div className="flea-search-empty">No items found</div>
            </div>
          )}
        </div>
      </div>

      {!selectedItem && popularItems.length > 0 && (
        <div className="flea-popular">
          <div className="flea-popular-title">Popular Items</div>
          <div className="flea-popular-chips">
            {popularItems.map(item => (
              <button
                key={item.id}
                className="flea-popular-chip"
                onClick={() => selectItem(item)}
              >
                {item.iconLink && (
                  <img src={item.iconLink} alt="" className="item-icon-sm" loading="lazy" />
                )}
                {item.shortName}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedItem && (
        <div className="flea-advisor-result">
          <button className="flea-back-btn" onClick={() => setSelectedItem(null)}>
            &larr; Back to search
          </button>
          <ItemTimingAdvisor item={selectedItem} settings={settings} />
        </div>
      )}
    </div>
  );
}
