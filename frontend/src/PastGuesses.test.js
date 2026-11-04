import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { PastGuesses } from './PastGuesses';

test('prepopulates seven blank past-guess rows', () => {
  render(<PastGuesses guesses={[]} />);

  expect(screen.getByText('0 guesses')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Past guesses' })).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(8);
  const firstBlankRow = screen.getAllByRole('row')[1];
  expect(within(firstBlankRow).getAllByRole('cell')).toHaveLength(7);
  within(firstBlankRow).getAllByRole('cell').forEach((cell) => {
    expect(cell).toBeEmptyDOMElement();
  });
});

test('shows past guesses with the available player details', () => {
  render(
    <PastGuesses
      guesses={[
        {
          name: 'Henry Aaron',
          position: 'Rightfielder and First Baseman',
          team: 'MLN,ATL,MIL',
          debut_year: '1954',
          retirement_year: '1976',
          plate_apps: '13941',
          avg: '0.305',
          obp: '0.374',
          slg: '0.555',
          hints: {
            position: 'partial',
            team: 'correct',
            debut_year: 'decade',
            retirement_year: 'correct',
          },
        },
      ]}
    />
  );

  const row = screen.getByRole('row', { name: /Henry Aaron/ });
  expect(row).toHaveClass('past-guesses__player-row');
  expect(within(row).getByText('RF, 1B')).toBeInTheDocument();
  expect(within(row).getByText('MLN,ATL,MIL')).toBeInTheDocument();
  expect(within(row).getByText('RF, 1B').closest('td')).toHaveClass('past-guesses__cell--hint-partial');
  expect(within(row).getByText('MLN,ATL,MIL').closest('td')).toHaveClass('past-guesses__cell--hint-correct');
  expect(within(row).getByText('RF, 1B').closest('td')).toHaveStyle({
    backgroundColor: 'rgb(244, 163, 64)',
    color: 'rgb(17, 24, 32)',
  });
  expect(within(row).getByText('1954').closest('td')).toHaveClass('past-guesses__cell--hint-partial');
  expect(within(row).getByText('1976').closest('td')).toHaveClass('past-guesses__cell--hint-correct');
  expect(within(row).getByText('0.555')).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'PA' })).not.toBeInTheDocument();
});

test('abbreviates all supported positions while preserving other position labels', () => {
  render(
    <PastGuesses
      guesses={[
        {
          name: 'Multi-position Player',
          position: 'Catcher, First Baseman and Designated Hitter',
        },
        {
          name: 'Another Player',
          position: 'Second Baseman, Shortstop, Third Baseman, Leftfielder, Centerfielder and Rightfielder',
        },
      ]}
    />
  );

  expect(screen.getByText('C, 1B, DH')).toBeInTheDocument();
  expect(screen.getByText('2B, SS, 3B, LF, CF, RF')).toBeInTheDocument();
});

test('abbreviates outfielders and hides pinch hitter and 2TM labels', () => {
  render(
    <PastGuesses
      guesses={[
        {
          name: 'Utility Player',
          position: 'Outfielder, Pinch Hitter and Catcher',
          team: '2TM,NYM',
        },
      ]}
    />
  );

  const row = screen.getByRole('row', { name: /Utility Player/ });
  expect(within(row).getByText('OF, C')).toBeInTheDocument();
  expect(within(row).getByText('NYM')).toBeInTheDocument();
  expect(within(row).queryByText(/Pinch Hitter|2TM/)).not.toBeInTheDocument();
});

test('leaves player details blank when there is no matching player record', () => {
  render(<PastGuesses guesses={[{ name: 'Unknown Player' }]} />);

  const row = screen.getByRole('row', { name: /Unknown Player/ });
  within(row).getAllByRole('cell').forEach((cell) => {
    expect(cell).toBeEmptyDOMElement();
  });
});
