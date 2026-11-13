import React from 'react';
import './PastGuesses.css';

function hintClass(hint) {
  if (hint === 'correct') {
    return 'past-guesses__cell--hint-correct';
  }
  if (hint === 'close') {
    return 'past-guesses__cell--hint-close';
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
  if (hint === 'close') {
    return { backgroundColor: '#f4d35e', color: '#111820' };
  }
  if (hint === 'partial' || hint === 'decade') {
    return { backgroundColor: '#f4a340', color: '#111820' };
  }
  return undefined;
}

function PlayerTableHeader() {
  return (
    <thead>
      <tr>
        <th scope="col">Player</th>
        <th scope="col">Position(s)</th>
        <th scope="col">Team(s)</th>
        <th scope="col">Debut</th>
        <th scope="col">Retired</th>
      </tr>
    </thead>
  );
}

function PlayerTableRow({ player }) {
  return (
    <tr className={`past-guesses__player-row${player.isCorrect ? ' past-guesses__player-row--correct' : ''}`}>
      <th scope="row">{player.name || ''}</th>
      <td className={hintClass(player.hints?.position)} style={hintStyle(player.hints?.position)}>{player.position ? player.position : ''}</td>
      <td className={hintClass(player.hints?.team)} style={hintStyle(player.hints?.team)}>{player.team ? player.team : ''}</td>
      <td className={hintClass(player.hints?.debut_year)} style={hintStyle(player.hints?.debut_year)}>{player.debut_year || ''}</td>
      <td className={hintClass(player.hints?.retirement_year)} style={hintStyle(player.hints?.retirement_year)}>{player.retirement_year || ''}</td>
    </tr>
  );
}

export function RevealedPlayer({ player }) {
  return (
    <div className="past-guesses__table-container revealed-player">
      <table className="past-guesses__table">
        <caption className="visually-hidden">Revealed player details</caption>
        <PlayerTableHeader />
        <tbody>
          <PlayerTableRow player={{ ...player, isCorrect: true }} />
        </tbody>
      </table>
    </div>
  );
}

export function PastGuesses({
  guesses,
  title = 'Past guesses',
  minimumRows = 9,
  guessLimit = 9,
}) {
  const rows = Array.from(
    { length: Math.max(minimumRows, guesses.length) },
    (_, index) => guesses[index]
  );
  const headingId = title === 'Free Play' ? 'free-play-heading' : 'past-guesses-heading';

  return (
    <section className="past-guesses" aria-labelledby={headingId}>
      <div className="past-guesses__heading">
        <h3 id={headingId}>{title}</h3>
        <span>
          {guessLimit === null
            ? `${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}`
            : `${guesses.length}/${guessLimit} guesses`}
        </span>
      </div>
      <div className="past-guesses__table-container">
        <table className="past-guesses__table">
          <caption className="visually-hidden">Player details for each past guess</caption>
          <PlayerTableHeader />
          <tbody>
            {rows.map((guess, index) => (
              guess
                ? <PlayerTableRow key={`${guess.name}-${index}`} player={guess} />
                : (
                  <tr key={`empty-${index}`} className="past-guesses__empty-row">
                    <th scope="row" />
                    <td /><td /><td /><td />
                  </tr>
                )
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
