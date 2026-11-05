import React, { useState, useEffect, useRef } from 'react';

export function NameGuessInput({ value, onChange, pastGuesses, mode, disabled = false }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionCache = useRef(new Map());
  const pastGuessNames = new Set(
    pastGuesses.map((guess) => (guess.name || guess).trim().toLowerCase())
  );
  const filteredSuggestions = suggestions
    .filter((name) => !pastGuessNames.has(name.trim().toLowerCase()))
    .slice(0, 8);

  useEffect(() => {
    const query = disabled ? '' : value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    let isCurrentQuery = true;
    const delayDebounceTimer = setTimeout(() => {
      const cacheKey = `${mode}:${query}`;
      const cachedResult = suggestionCache.current.get(cacheKey);
      const headers = cachedResult?.etag
        ? { 'If-None-Match': cachedResult.etag }
        : {};

      fetch(`/api/suggest?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}`, { headers })
        .then(async (response) => {
          if (response.status === 304) {
            if (!cachedResult) {
              throw new Error(`Received 304 without cached suggestions for "${query}".`);
            }
            return cachedResult.suggestions;
          }

          if (!response.ok) {
            throw new Error(`Failed to fetch suggestions (${response.status}).`);
          }

          const data = await response.json();
          suggestionCache.current.set(cacheKey, {
            suggestions: data,
            etag: response.headers.get('ETag'),
          });
          return data;
        })
        .then((data) => {
          if (isCurrentQuery) {
            setSuggestions(data);
          }
        })
        .catch((err) => {
          if (isCurrentQuery) {
            console.error('Error fetching suggestions:', err);
          }
        });
    }, 1000);

    return () => {
      isCurrentQuery = false;
      clearTimeout(delayDebounceTimer);
    };
  }, [disabled, mode, value]);

  return (
    <div style={{ position: 'relative', width: 'min(100%, 300px)' }}>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
        }}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="Guess a player..."
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '12px 14px',
          fontSize: '16px',
          borderRadius: '8px',
          border: '1px solid #ccc',
        }}
      />

      {showSuggestions && filteredSuggestions.length > 0 && (
        <ul style={{ position: 'absolute', background: 'white', border: '1px solid #ccc', width: '100%', zIndex: 10 }}>
          {filteredSuggestions.map((name, index) => (
            <ul 
              key={`${name}-${index}`}
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
