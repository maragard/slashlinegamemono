import React from 'react';
import './PastGuesses.css';

const POSITION_ABBREVIATIONS = {
  catcher: 'C',
  'first baseman': '1B',
  'first basemen': '1B',
  'second baseman': '2B',
  'second basemen': '2B',
  'third baseman': '3B',
  'third basemen': '3B',
  shortstop: 'SS',
  outfielder: 'OF',
  outfielders: 'OF',
  leftfielder: 'LF',
  leftfielders: 'LF',
  centerfielder: 'CF',
  centerfielders: 'CF',
  rightfielder: 'RF',
  rightfielders: 'RF',
  'designated hitter': 'DH',
  'designated hitters': 'DH',
};

function abbreviatePositions(positions) {
  return positions
    .split(/,|\s+and\s+/i)
    .map((position) => {
      const trimmedPosition = position.trim();
      return POSITION_ABBREVIATIONS[trimmedPosition.toLowerCase()] || trimmedPosition;
    })
    .filter((position) => position && position.toLowerCase() !== 'pinch hitter')
    .join(', ');
}

function formatTeams(teams) {
  return teams
    .split(',')
    .map((team) => team.trim())
    .filter((team) => team && team.toUpperCase() !== '2TM')
    .join(',');
}

function hintClass(hint) {
  if (hint === 'correct') {
    return 'past-guesses__cell--hint-correct';
  }
  if (hint === 'partial' || hint === 'decade') {
    return 'past-guesses__cell--hint-partial';
  }
  return '';
}

function hintStyle(hint) {
  if (hint === 'correct') {
    return { backgroundColor: '#63d47b', color: '#111820' };
  }
  if (hint === 'partial' || hint === 'decade') {
    return { backgroundColor: '#f4a340', color: '#111820' };
  }
  return undefined;
}

export function PastGuesses({ guesses }) {
  const rows = Array.from({ length: Math.max(7, guesses.length) }, (_, index) => guesses[index]);

  return (
    <section className="past-guesses" aria-labelledby="past-guesses-heading">
      <div className="past-guesses__heading">
        <h3 id="past-guesses-heading">Past guesses</h3>
        <span>{guesses.length} {guesses.length === 1 ? 'guess' : 'guesses'}</span>
      </div>
      <div className="past-guesses__table-scroll">
        <table className="past-guesses__table">
          <caption className="visually-hidden">Player details for each past guess</caption>
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Position(s)</th>
              <th scope="col">Team(s)</th>
              <th scope="col">Debut</th>
              <th scope="col">Retired</th>
              <th scope="col">AVG</th>
              <th scope="col">OBP</th>
              <th scope="col">SLG</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((guess, index) => (
              <tr
                key={guess ? `${guess.name}-${index}` : `empty-${index}`}
                className={guess
                  ? `past-guesses__player-row${guess.isCorrect ? ' past-guesses__player-row--correct' : ''}`
                  : 'past-guesses__empty-row'}
              >
                <th scope="row">{guess?.name || ''}</th>
                <td className={hintClass(guess?.hints?.position)} style={hintStyle(guess?.hints?.position)}>{guess?.position ? abbreviatePositions(guess.position) : ''}</td>
                <td className={hintClass(guess?.hints?.team)} style={hintStyle(guess?.hints?.team)}>{guess?.team ? formatTeams(guess.team) : ''}</td>
                <td className={hintClass(guess?.hints?.debut_year)} style={hintStyle(guess?.hints?.debut_year)}>{guess?.debut_year || ''}</td>
                <td className={hintClass(guess?.hints?.retirement_year)} style={hintStyle(guess?.hints?.retirement_year)}>{guess?.retirement_year || ''}</td>
                <td>{guess?.avg || ''}</td>
                <td>{guess?.obp || ''}</td>
                <td>{guess?.slg || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
