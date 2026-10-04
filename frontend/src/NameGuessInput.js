import React, { useState, useEffect } from 'react';

export function NameGuessInput({ value, onChange }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    // 1. Set up a 2s delay timer before requesting the backend
    const delayDebounceTimer = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => setSuggestions(data))
        .catch((err) => console.error("Error fetching suggestions:", err));
    }, 1000); // 2s typing buffer

    // 2. Clear the timer automatically if the user types another letter before 2s passes
    return () => clearTimeout(delayDebounceTimer);
  }, [value]);

  return (
    <div style={{ position: 'relative', width: '300px' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
        }}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="Type a name guess..."
        style={{
          flex: 1,
          padding: '12px 14px',
          fontSize: '16px',
          borderRadius: '8px',
          border: '1px solid #ccc',
        }}
      />

      {showSuggestions && suggestions.length > 0 && (
        <ul style={{ position: 'absolute', background: 'white', border: '1px solid #ccc', width: '100%', zIndex: 10 }}>
          {suggestions.map((name) => (
            <ul 
              key={name}
              onMouseDown={() => {
                onChange(name);
                setShowSuggestions(false);
              }}
              style={{ padding: '8px', cursor: 'pointer', color: 'black' }}
            >
              {name}
            </ul>
          ))}
        </ul>
      )}
    </div>
  );
}
