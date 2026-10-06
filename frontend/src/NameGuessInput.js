import React, { useState, useEffect } from 'react';

export function NameGuessInput({ value, onChange, incorrectGuesses }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const incorrectGuessNames = new Set(
    incorrectGuesses.map((guess) => guess.trim().toLowerCase())
  );
  const filteredSuggestions = suggestions
    .filter((name) => !incorrectGuessNames.has(name.trim().toLowerCase()))
    .slice(0, 8);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 3) {
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
        placeholder="Guess a player..."
        style={{
          flex: 1,
          padding: '12px 14px',
          fontSize: '16px',
          borderRadius: '8px',
          border: '1px solid #ccc',
        }}
      />

      {showSuggestions && filteredSuggestions.length > 0 && (
        <ul style={{ position: 'absolute', background: 'white', border: '1px solid #ccc', width: '100%', zIndex: 10 }}>
          {filteredSuggestions.map((name) => (
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
