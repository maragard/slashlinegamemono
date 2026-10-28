import React from 'react';

export function IncorrectGuesses({ guesses }) {
  if (guesses.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="incorrect-guesses-heading" style={{ marginTop: '20px', color:'black' }}>
      <h3 id="incorrect-guesses-heading">Incorrect guesses</h3>
      <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
        {guesses.map((guess, index) => (
          <li key={`${typeof guess === 'string' ? guess : guess.name}-${index}`}>
            {typeof guess === 'string' ? guess : guess.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
