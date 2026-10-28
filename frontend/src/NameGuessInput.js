import React, { useState, useEffect, useRef } from 'react';

export function NameGuessInput({
  value,
  onChange,
  onPlayerSelect = () => {},
  incorrectGuesses,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionCache = useRef(new Map());
  const incorrectGuessIds = new Set(
    incorrectGuesses
      .filter((guess) => typeof guess === 'object' && guess.id != null)
      .map((guess) => guess.id)
  );
  const incorrectGuessNames = new Set(
    incorrectGuesses
      .filter((guess) => typeof guess === 'string' || guess.id == null)
      .map((guess) => (typeof guess === 'string' ? guess : guess.name).trim().toLowerCase())
  );
  const filteredSuggestions = suggestions
    .filter((player) => (
      !incorrectGuessIds.has(player.id) &&
      !incorrectGuessNames.has(player.name.trim().toLowerCase())
    ))
    .slice(0, 8);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    let isCurrentQuery = true;
    const delayDebounceTimer = setTimeout(() => {
      const cachedResult = suggestionCache.current.get(query);
      const headers = cachedResult?.etag
        ? { 'If-None-Match': cachedResult.etag }
        : {};

      fetch(`/api/suggest?q=${encodeURIComponent(query)}`, { headers })
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
          suggestionCache.current.set(query, {
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
  }, [value]);

  return (
    <div style={{ position: 'relative', width: '300px' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onPlayerSelect(null);
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
