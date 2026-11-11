import React, { useState, useEffect, useRef } from 'react';

export function NameGuessInput({
  value,
  onChange,
  onPlayerSelect = () => {},
  pastGuesses = [],
  incorrectGuesses = [],
  mode = 'all-time',
  disabled = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionCache = useRef(new Map());
  const guessesToExclude = [...pastGuesses, ...incorrectGuesses];
  const pastGuessIds = new Set(
    guessesToExclude
      .filter((guess) => typeof guess === 'object' && guess.id != null)
      .map((guess) => guess.id)
  );
  const pastGuessNames = new Set(
    guessesToExclude
      .filter((guess) => typeof guess === 'string' || guess.id == null)
      .map((guess) => (typeof guess === 'string' ? guess : guess.name).trim().toLowerCase())
  );
  const filteredSuggestions = suggestions
    .filter((player) => (
      !pastGuessIds.has(player.id) &&
      !pastGuessNames.has(player.name.trim().toLowerCase())
    ))
    .slice(0, 8);

  useEffect(() => {
    setSuggestions([]);
    const query = disabled ? '' : value.trim();
    if (query.length < 3) {
      if (disabled) {
        setShowSuggestions(false);
      }
      return;
    }

    let isCurrentQuery = true;
    const delayDebounceTimer = setTimeout(() => {
      const cacheKey = `${mode}:${query}`;
      const cachedResult = suggestionCache.current.get(cacheKey);
      const headers = cachedResult?.etag
        ? { 'If-None-Match': cachedResult.etag }
        : {};

      fetch(
        `/api/suggest?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}`,
        { headers }
      )
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
          if (!Array.isArray(data)) {
            throw new Error('Suggestion response must be an array.');
          }
          const playerSuggestions = data.map((player) => {
            if (typeof player === 'string') {
              return { name: player };
            }
            if (player && typeof player === 'object' && typeof player.name === 'string') {
              return player;
            }
            throw new Error('Suggestion response contains an invalid player record.');
          });
          suggestionCache.current.set(cacheKey, {
            suggestions: playerSuggestions,
            etag: response.headers.get('ETag'),
          });
          return playerSuggestions;
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
    <div style={{ position: 'relative', width: '300px' }}>
      <input
        type="text"
        value={value}
        disabled={disabled}
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

      {!disabled && showSuggestions && filteredSuggestions.length > 0 && (
        <ul style={{ position: 'absolute', background: 'white', border: '1px solid #ccc', width: '100%', zIndex: 10 }}>
          {filteredSuggestions.map((player, index) => (
            <li
              key={player.id ?? `${player.name}-${index}`}
              onMouseDown={() => {
                onChange(player.name);
                onPlayerSelect(player.id ?? null);
                setShowSuggestions(false);
              }}
              style={{ padding: '8px', cursor: 'pointer', color: 'black', listStyle: 'none' }}
            >
              <span>{player.name}</span>
              {(player.position || player.debut || player.retirement) && (
                <small style={{ display: 'block', color: '#555' }}>
                  {player.position || 'Position unavailable'} · {player.team || 'Team unavailable'}  · {player.debut || 'unknown'} · {player.retirement === 'Not Found' ? 'Active' : player.retirement || 'unknown'}
                </small>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
