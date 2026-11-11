import React, { useState, useEffect } from 'react';
import { NameGuessInput } from './NameGuessInput';
import { PopupFrame } from './PopupFrame.js';
import { PastGuesses, RevealedPlayer } from './PastGuesses';
import baseball from './2021-hot-fast-ball.jpg';
import './Game.css';

const API_BASE_URL = "/api";
const API_URL = `${API_BASE_URL}/guess-player`;
const START_URL = `${API_BASE_URL}/start`;
const MAX_GUESSES = 9;
const GAME_MODES = [
  { id: 'all-time', name: 'All Time', years: '1871–Present (all players)' },
  { id: 'post-integration', name: 'Post-Integration', years: '1950–Present' },
  { id: '30-team-era', name: '30 Team Era', years: '1998–Present' },
];

export default function Game() {
  const [selectedMode, setSelectedMode] = useState(GAME_MODES[0].id);
  const [gameStates, setGameStates] = useState({
    'all-time': { result: null, pastGuesses: [], freePlayGuesses: [], freePlayActive: false },
  });
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [startHint, setStartHint] = useState('Loading hint...');
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [duplicateCandidates, setDuplicateCandidates] = useState([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const selectedModeDetails = GAME_MODES.find((mode) => mode.id === selectedMode);
  const activeGame = gameStates[selectedMode] || { result: null, pastGuesses: [] };
  const hasWon = Boolean(activeGame.result?.success);
  const isRoundComplete = Boolean(activeGame.revealedPlayer || activeGame.result?.success);
  const hasReachedGuessLimit = !activeGame.freePlayActive
    && activeGame.pastGuesses.length >= MAX_GUESSES;
  const allGuesses = [
    ...activeGame.pastGuesses,
    ...(activeGame.freePlayGuesses || []),
  ];

  const handleModeSelect = (mode) => {
    setSelectedMode(mode);
    setPlayerName('');
    setError('');
    setDuplicateCandidates([]);
    setStartHint('Loading hint...');
  };

  const startFreePlay = () => {
    setGameStates((states) => ({
      ...states,
      [selectedMode]: {
        ...(states[selectedMode] || { result: null, pastGuesses: [] }),
        freePlayActive: true,
        freePlayGuesses: states[selectedMode]?.freePlayGuesses || [],
      },
    }));
    setPlayerName('');
    setError('');
  };

  useEffect(() => {
    let isMounted = true;

    const fetchStartHint = async () => {
      try {
        const response = await fetch(`${START_URL}?mode=${encodeURIComponent(selectedMode)}`);
        if (!response.ok) {
          throw new Error('Failed to load start hint.');
        }

        const data = await response.json();
        if (isMounted) {
          setStartHint(data?.hint || 'No hint available.');
        }
      } catch (err) {
        if (isMounted) {
          setStartHint(err.message || 'Unable to load hint.');
        }
      }
    };

    fetchStartHint();

    return () => {
      isMounted = false;
    };
  }, [selectedMode]);

  const submitGuess = async (guess) => {
    if ((!activeGame.freePlayActive && hasReachedGuessLimit) || isRoundComplete) {
      return;
    }

    const trimmedName = (guess.name || playerName).trim();
    const guessId = guess.id ?? selectedPlayerId;
    if (!trimmedName && guessId == null) {
      setError('Please enter a player name.');
      return;
    }
    setLoading(true);
    setError('');
    setGameStates((states) => ({
      ...states,
      [selectedMode]: {
        ...(states[selectedMode] || { result: null, pastGuesses: [] }),
        result: null,
        revealedPlayer: null,
      },
    }));

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(guessId == null ? { name: trimmedName } : { id: guessId }),
          mode: selectedMode,
        }),
      });

      const data = await response.json();

      if (response.status === 409 && Array.isArray(data.candidates)) {
        setDuplicateCandidates(data.candidates);
        return;
      }

      if (!response.ok) {
        throw new Error(data?.detail || data?.error || 'Something went wrong.');
      }

      if (!data.player?.name) {
        throw new Error(
          'Player not found in our database. Please choose a player from the suggestions.'
        );
      }

      setDuplicateCandidates([]);
      setGameStates((states) => {
        const game = states[selectedMode] || { result: null, pastGuesses: [] };
        const newGuess = { ...data.player, isCorrect: data.success, hints: data.hints || {} };
        return {
          ...states,
          [selectedMode]: {
            result: data,
            revealedPlayer: null,
            freePlayActive: game.freePlayActive || false,
            pastGuesses: game.freePlayActive
              ? game.pastGuesses
              : [...game.pastGuesses, newGuess],
            freePlayGuesses: game.freePlayActive
              ? [...(game.freePlayGuesses || []), newGuess]
              : (game.freePlayGuesses || []),
          },
        };
      });
    } catch (err) {
      setError(err.message || 'Failed to fetch player information.');
    } finally {
      setLoading(false);
    }
  };

  const revealPlayer = async () => {
    setLoading(true);
    setError('');
    setDuplicateCandidates([]);

    try {
      const response = await fetch(
        `${API_BASE_URL}/reveal-player?mode=${encodeURIComponent(selectedMode)}`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || 'Failed to reveal the player.');
      }
      if (!data.player?.name) {
        throw new Error('The selected player could not be found.');
      }

      setGameStates((states) => ({
        ...states,
        [selectedMode]: {
          ...(states[selectedMode] || { result: null, pastGuesses: [] }),
          result: null,
          revealedPlayer: data.player,
        },
      }));
    } catch (err) {
      setError(err.message || 'Failed to reveal the player.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (isRoundComplete || (hasReachedGuessLimit && !activeGame.freePlayActive)) {
      return;
    }

    const trimmedName = playerName.trim();
    if (!trimmedName) {
      setError('Please enter a player name.');
      setGameStates((states) => ({
        ...states,
        [selectedMode]: {
          ...(states[selectedMode] || { result: null, pastGuesses: [] }),
          result: null,
        },
      }));
      return;
    }

    setPlayerName('');
    setDuplicateCandidates([]);
    submitGuess(
      selectedPlayerId == null
        ? { name: trimmedName }
        : { id: selectedPlayerId, name: trimmedName }
    );
  };

  const handleCandidateSelect = (player) => {
    setDuplicateCandidates([]);
    submitGuess({ id: player.id });
  };

  return (
    <div className="game-shell">
      <nav className="game-mode-bar" aria-label="Game modes">
        <span className="game-brand">
          <img src={baseball} alt="" />
          Slashline
        </span>
        <div className="game-mode-buttons">
          {GAME_MODES.map((mode) => (
            <button
              key={mode.id}
              className={`game-mode-button${selectedMode === mode.id ? ' game-mode-button--active' : ''}`}
              type="button"
              aria-pressed={selectedMode === mode.id}
              onClick={() => handleModeSelect(mode.id)}
            >
              {mode.name}
            </button>
          ))}
        </div>
        <div className="game-mode-meta">
          <span className="game-mode-years">Player pool: {selectedModeDetails.years}</span>
          <button
            className="game-rules-button"
            type="button"
            onClick={() => setIsPopupOpen(true)}
          >
            Rules
          </button>
        </div>
      </nav>
      <PopupFrame
        isOpen={isPopupOpen}
        onClose={() => setIsPopupOpen(false)}
      >
        <h2>Game Rules</h2>
        <p>Welcome to Slashline! The rules are simple:</p>
        <ol>
          <li>Guess a player based on the given slashline.</li>
          <li>Only players who have more than 1000 plate appearances are eligible.</li>
          <li>You have nine guesses per mode. After that, start Free Play to make unlimited additional guesses on a separate board.</li>
          <li>Orange means a year is in the same decade, but not an exact year, or some positions or teams overlap.</li>
          <li>Green means the year matches exactly, or the full position or team list matches.</li>
        </ol>
      </PopupFrame>
      <main className="game-panel">
        <h1 style={{ marginBottom: '12px', fontSize: '28px' }}>{startHint}</h1>
        <h2 style={{ marginBottom: '20px' }}>Who's That Player?</h2>

        {hasWon ? (
          <div className="game-completed-player" role="status">
            <strong>{activeGame.result.player.name}</strong>
            <span>You did it!</span>
          </div>
        ) : !isRoundComplete && (
          <form className="game-form" onSubmit={handleSubmit}>
            <span className="game-feedback-slot" role="status" aria-live="polite">
              {activeGame.result && !activeGame.result.success && (
                <span className="game-try-again">
                  <span className="game-try-again__icon" aria-hidden="true">×</span>
                  Try again
                </span>
              )}
            </span>
            <NameGuessInput
              value={playerName}
              onChange={(name) => {
                setPlayerName(name);
                setSelectedPlayerId(null);
              }}
              onPlayerSelect={setSelectedPlayerId}
              pastGuesses={allGuesses}
              mode={selectedMode}
              disabled={loading || hasReachedGuessLimit}
            />
            <button
              type="submit"
              disabled={loading || hasReachedGuessLimit}
              style={{
                padding: '12px 18px',
                fontSize: '16px',
                border: 'none',
                borderRadius: '8px',
                background: '#2563eb',
                color: '#fff',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Submitting...' : 'Submit'}
            </button>
            {!activeGame.freePlayActive && (
              <button
                className="reveal-player-button"
                type="button"
                disabled={loading}
                onClick={revealPlayer}
              >
                Reveal Player
              </button>
            )}
            {hasReachedGuessLimit && !activeGame.revealedPlayer && (
              <button
                className="free-play-button"
                type="button"
                onClick={startFreePlay}
              >
                Free Play
              </button>
            )}
          </form>
        )}

        {hasReachedGuessLimit && !activeGame.revealedPlayer && !activeGame.freePlayActive && (
          <p className="game-result" role="status">
            You’ve used all {MAX_GUESSES} guesses for this mode.
          </p>
        )}

        {error && (
          <p className="game-error" role="alert">
            {error}
          </p>
        )}

        {duplicateCandidates.length > 0 && (
          <section className="duplicate-players" aria-labelledby="duplicate-players-heading">
            <h3 id="duplicate-players-heading">Choose the player you meant</h3>
            <p>These players share that name. Select the matching player record:</p>
            <ul>
              {duplicateCandidates.map((player) => (
                <li key={player.id}>
                  <button
                    className="duplicate-player-option"
                    type="button"
                    disabled={loading}
                    onClick={() => handleCandidateSelect(player)}
                  >
                    <strong>{player.name}</strong>
                    <span>{[player.team, player.position, player.debut_year, player.retirement_year]
                      .filter(Boolean)
                      .join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {activeGame.revealedPlayer && (
          <RevealedPlayer player={activeGame.revealedPlayer} />
        )}

        <PastGuesses guesses={activeGame.pastGuesses} />
        {activeGame.freePlayActive && (
          <PastGuesses
            guesses={activeGame.freePlayGuesses || []}
            title="Free Play"
            minimumRows={0}
          />
        )}
      </main>
    </div>
  );
}
