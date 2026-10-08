import React, { useState, useEffect } from 'react';
import { NameGuessInput } from './NameGuessInput';
import { PopupFrame } from './PopupFrame.js';
import { IncorrectGuesses } from './IncorrectGuesses';

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
  const [incorrectGuesses, setIncorrectGuesses] = useState([]);

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

  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmedName = playerName.trim();
    if (!trimmedName) {
      setError('Please enter a player name.');
      setResult(null);
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: trimmedName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.detail || data?.error || 'Something went wrong.');
      }

      setResult(data);
      if (!data.success) {
        setIncorrectGuesses((guesses) => [...guesses, trimmedName]);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch player information.');
    } finally {
      setLoading(false);
    }
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
          <li>More rules to follow</li>
        </ol>
      </PopupFrame>
      <div
        style={{
          maxWidth: '600px',
          margin: '40px auto',
          padding: '24px',
          fontFamily: 'Arial, sans-serif',
          background: '#f7f7f7',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}
      >
        <h1 style={{ marginBottom: '12px', fontSize: '28px' }}>{startHint}</h1>
        <h2 style={{ marginBottom: '20px' }}>Who's That Player?</h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <NameGuessInput 
            value={playerName}
            onChange={setPlayerName}
            incorrectGuesses={incorrectGuesses}
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
          <p style={{ color: '#b91c1c', marginBottom: '16px' }} role="alert">
            {error}
          </p>
        )}

        {result && (
          <section>
            <div
              style={{
                background: '#fff',
                borderRadius: '8px',
                padding: '16px',
                border: '1px solid #e5e7eb',
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: result.success ? '#166534' : '#b91c1c',
                  fontWeight: '600',
                }}
              >
                {result.msg || (result.success ? 'You did it!' : 'Try again.')}
              </p>
            </div>
          </section>
        )}

        <IncorrectGuesses guesses={incorrectGuesses} />
      </div>
      <button onClick={() => setIsPopupOpen(true)}>
        Rules
      </button>
    </div>
  );
}
