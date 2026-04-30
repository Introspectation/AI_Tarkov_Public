export default function SearchBar({ query, onChange }) {
  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search items..."
        value={query}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
