import React, { useState, useEffect, useRef } from 'react';

export function NameGuessInput({
  value,
  onChange,
  onPlayerSelect = () => {},
  pastGuesses = [],
  mode = 'all-time',
  disabled = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionCache = useRef(new Map());
  const guessedIds = new Set(
    pastGuesses.filter((guess) => guess.id != null).map((guess) => String(guess.id))
  );
  const guessedNames = new Set(
    pastGuesses
      .filter((guess) => guess.id == null)
      .map((guess) => (typeof guess === 'string' ? guess : guess.name || '').trim().toLowerCase())
  );
  const filteredSuggestions = suggestions
    .filter((player) => (
      !guessedIds.has(String(player.id))
      && !guessedNames.has((player.name || '').trim().toLowerCase())
    ))
    .slice(0, 8);

  useEffect(() => {
    const query = value.trim();
    setSuggestions([]);
    if (query.length < 3 || disabled) {
      return undefined;
    }

    let isCurrentQuery = true;
    const cacheKey = `${mode}:${query.toLowerCase()}`;
    const delayDebounceTimer = setTimeout(() => {
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
  }, [value, mode, disabled]);

  return (
    <div style={{ position: 'relative', width: 'min(100%, 300px)' }}>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          onPlayerSelect(null);
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

      {showSuggestions && !disabled && filteredSuggestions.length > 0 && (
        <ul style={{ position: 'absolute', background: 'white', border: '1px solid #ccc', width: '100%', zIndex: 10 }}>
          {filteredSuggestions.map((player) => (
            <li
              key={player.id}
              onMouseDown={() => {
                onChange(player.name);
                onPlayerSelect(player.id);
                setShowSuggestions(false);
              }}
              style={{ padding: '8px', cursor: 'pointer', color: 'black', listStyle: 'none' }}
            >
              <span>{player.name}</span>
              <small style={{ display: 'block', color: '#555' }}>
                {player.team || 'Team not listed'} · {player.debut_year || 'unknown'} · {player.retirement_year === 'Not Found' ? 'Active' : player.retirement_year || 'unknown'}
              </small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
