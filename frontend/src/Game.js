import React, { useState, useEffect } from 'react';
import { NameGuessInput } from './NameGuessInput';
import { PopupFrame } from './PopupFrame.js';
import { PastGuesses } from './PastGuesses';
import './Game.css';

const API_BASE_URL = "/api";
const API_URL = `${API_BASE_URL}/guess-player`;
const START_URL = `${API_BASE_URL}/start`;

export default function Game() {
  const [playerName, setPlayerName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [startHint, setStartHint] = useState('Loading hint...');
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [pastGuesses, setPastGuesses] = useState([]);
  const [duplicateCandidates, setDuplicateCandidates] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const fetchStartHint = async () => {
      try {
        const response = await fetch(START_URL);
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
  }, []);

  const submitGuess = async (guess) => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(guess),
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

      setResult(data);
      setDuplicateCandidates([]);
      setPastGuesses((guesses) => [
        ...guesses,
        { ...data.player, isCorrect: data.success, hints: data.hints || {} },
      ]);
    } catch (err) {
      setError(err.message || 'Failed to fetch player information.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const trimmedName = playerName.trim();
    if (!trimmedName) {
      setError('Please enter a player name.');
      setResult(null);
      return;
    }

    setPlayerName('');
    setDuplicateCandidates([]);
    submitGuess({ name: trimmedName });
  };

  const handleCandidateSelect = (player) => {
    setDuplicateCandidates([]);
    submitGuess({ id: player.id });
  };

  return (
    <div>
      <PopupFrame
        isOpen={isPopupOpen}
        onClose={() => setIsPopupOpen(false)}
      >
        <h2>Game Rules</h2>
        <p>Welcome to Slashline! The rules are simple:</p>
        <ol>
          <li>Guess a player based on the given slashline.</li>
          <li>Only players who have more than 1000 plate appearances are eligible.</li>
          <li>Orange means a year is in the same decade, but not an exact year, or some positions or teams overlap.</li>
          <li>Green means the year matches exactly, or the full position or team list matches.</li>
          <li>More rules to follow</li>
        </ol>
      </PopupFrame>
      <main className="game-panel">
        <h1 style={{ marginBottom: '12px', fontSize: '28px' }}>{startHint}</h1>
        <h2 style={{ marginBottom: '20px' }}>Who's That Player?</h2>

        <form className="game-form" onSubmit={handleSubmit}>
          <NameGuessInput 
            value={playerName}
            onChange={setPlayerName}
            pastGuesses={pastGuesses}
          />
          <button
            type="submit"
            disabled={loading}
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
        </form>

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

        {result && (
          <p className={`game-result${result.success ? ' game-result--success' : ''}`}>
            {result.msg || (result.success ? 'You did it!' : 'Try again.')}
          </p>
        )}

        <PastGuesses guesses={pastGuesses} />
      </main>
      <button className="game-rules-button" onClick={() => setIsPopupOpen(true)}>
        Rules
      </button>
    </div>
  );
}
