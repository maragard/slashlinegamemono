import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import Game from './Game';

test('does not add a past guess when the API cannot confirm the player', async () => {
  global.fetch = jest.fn((url) => {
    if (url === '/api/start') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hint: '0.300/0.400/0.500' }),
      });
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: false, msg: 'Try again' }),
    });
  });

  render(<Game />);
  fireEvent.change(screen.getByPlaceholderText('Guess a player...'), {
    target: { value: 'Not A Player' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Player not found in our database'
  );
  expect(screen.getByPlaceholderText('Guess a player...')).toHaveValue('');
  expect(screen.getByText('0 guesses')).toBeInTheDocument();
  expect(screen.queryByRole('row', { name: /Not A Player/ })).not.toBeInTheDocument();
});

test('adds the correct player to the past guesses board', async () => {
  global.fetch = jest.fn((url) => {
    if (url === '/api/start') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hint: '0.300/0.400/0.500' }),
      });
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        msg: 'You did it!',
        hints: {
          position: 'correct',
          team: 'correct',
          debut_year: 'correct',
          retirement_year: 'correct',
        },
        player: {
          name: 'Target Player',
          position: 'Shortstop',
          team: 'NYM',
          debut_year: '2000',
          retirement_year: '2010',
          plate_apps: '5000',
          avg: '0.300',
          obp: '0.400',
          slg: '0.500',
        },
      }),
    });
  });

  render(<Game />);
  fireEvent.change(screen.getByPlaceholderText('Guess a player...'), {
    target: { value: 'Target Player' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

  expect(await screen.findByText('You did it!')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Guess a player...')).toHaveValue('');
  const row = screen.getByRole('row', { name: /Target Player/ });
  expect(row).toHaveClass('past-guesses__player-row--correct');
  expect(within(row).getByText('Shortstop')).toBeInTheDocument();
  expect(within(row).getByText('NYM')).toBeInTheDocument();
});

test('asks the user to select a record when player names are duplicated', async () => {
  const candidate = {
    id: 17,
    name: 'John Smith',
    team: 'NYM',
    position: 'Shortstop',
    debut_year: '1980',
    retirement_year: '1985',
    plate_apps: '1200',
    avg: '0.250',
    obp: '0.300',
    slg: '0.350',
  };
  const secondCandidate = {
    ...candidate,
    id: 18,
    team: 'BOS',
    position: 'Catcher',
    debut_year: '1990',
    retirement_year: '1995',
  };
  global.fetch = jest.fn((url, options) => {
    if (url === '/api/start') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hint: '0.300/0.400/0.500' }),
      });
    }

    if (JSON.parse(options.body).name) {
      return Promise.resolve({
        status: 409,
        ok: false,
        json: () => Promise.resolve({
          detail: 'Multiple players have that name.',
          candidates: [candidate, secondCandidate],
        }),
      });
    }

    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({
        success: true,
        msg: 'You did it!',
        player: candidate,
        hints: {},
      }),
    });
  });

  render(<Game />);
  fireEvent.change(screen.getByPlaceholderText('Guess a player...'), {
    target: { value: 'John Smith' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

  const chooseButton = await screen.findByRole('button', {
    name: /John Smith.*NYM.*Shortstop.*1980.*1985/,
  });
  expect(screen.getByText('Choose the player you meant')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Choose John Smith/ })).toHaveLength(2);
  fireEvent.click(chooseButton);

  expect(await screen.findByText('You did it!')).toBeInTheDocument();
  const guessRequest = global.fetch.mock.calls.find(
    ([url, options]) => url === '/api/guess-player' && JSON.parse(options.body).id
  );
  expect(JSON.parse(guessRequest[1].body)).toEqual({ id: 17 });
});
