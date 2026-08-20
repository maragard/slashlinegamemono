import React, { useState, useEffect } from 'react';

const API_URL = 'http://localhost:8000/guess-player/';
const START_URL = 'http://localhost:8000/start/';

export default function Game() {
  const [playerName, setPlayerName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [startHint, setStartHint] = useState('Loading hint...');

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
    } catch (err) {
      setError(err.message || 'Failed to fetch player information.');
    } finally {
      setLoading(false);
    }
  };

  return (
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
        <input
          type="text"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          placeholder="Enter a player name"
          style={{
            flex: 1,
            padding: '12px 14px',
            fontSize: '16px',
            borderRadius: '8px',
            border: '1px solid #ccc',
          }}
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
    </div>
  );
}
