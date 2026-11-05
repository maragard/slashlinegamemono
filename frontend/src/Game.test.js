import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import Game from './Game';

test('does not add a past guess when the API cannot confirm the player', async () => {
  global.fetch = jest.fn((url) => {
    if (url.startsWith('/api/start')) {
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
    if (url.startsWith('/api/start')) {
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
  expect(screen.getByRole('status')).toHaveClass('game-completed-player');
  expect(screen.getByRole('status')).toHaveTextContent('Target PlayerYou did it!');
  expect(screen.getAllByText('You did it!')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  const row = screen.getByRole('row', { name: /Target Player/ });
  expect(row).toHaveClass('past-guesses__player-row--correct');
  expect(within(row).getByText('SS')).toBeInTheDocument();
  expect(within(row).getByText('NYM')).toBeInTheDocument();
});

test('shows incorrect-guess feedback in a reserved slot left of the input', async () => {
  const player = {
    name: 'Incorrect Guess',
    position: 'Shortstop',
    team: 'NYM',
    debut_year: '2000',
    retirement_year: '2010',
    avg: '0.250',
    obp: '0.300',
    slg: '0.350',
  };
  global.fetch = jest.fn((url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(url.startsWith('/api/start')
      ? { hint: '0.300/0.400/0.500' }
      : { success: false, msg: 'Try again', player, hints: {} }),
  }));

  render(<Game />);
  await screen.findByRole('heading', { name: '0.300/0.400/0.500' });
  const input = screen.getByPlaceholderText('Guess a player...');
  fireEvent.change(input, { target: { value: player.name } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

  await screen.findByText('Try again', { selector: '.game-try-again' });
  const feedback = screen.getByRole('status');
  expect(feedback).toHaveTextContent('Try again');
  expect(within(feedback).getByText('×')).toBeInTheDocument();
  expect(feedback).toHaveClass('game-feedback-slot');
  expect(input.closest('form').firstElementChild).toBe(feedback);
  expect(screen.queryByText('Try again', { selector: '.game-result' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Past guesses' })).toBeInTheDocument();
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
    if (url.startsWith('/api/start')) {
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
  expect(screen.getAllByRole('button', { name: /John Smith/ })).toHaveLength(2);
  fireEvent.click(chooseButton);

  expect(await screen.findByText('You did it!')).toBeInTheDocument();
  const guessRequest = global.fetch.mock.calls.find(
    ([url, options]) => url === '/api/guess-player' && JSON.parse(options.body).id
  );
  expect(JSON.parse(guessRequest[1].body)).toEqual({ id: 17, mode: 'all-time' });
});

test('switches modes, shows the player pool years, and loads that mode hint', async () => {
  global.fetch = jest.fn((url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      hint: url.includes('post-integration')
        ? 'Post-Integration hint'
        : url.includes('30-team-era')
          ? '30 Team Era hint'
          : '0.300/0.400/0.500',
    }),
  }));

  render(<Game />);
  await screen.findByRole('heading', { name: '0.300/0.400/0.500' });
  expect(screen.getByText('Slashline')).toBeInTheDocument();
  const menuBar = screen.getByRole('navigation', { name: 'Game modes' });
  expect(menuBar).toBeInTheDocument();
  expect(within(menuBar).getByRole('button', { name: 'Rules' })).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByText('Player pool: 1871–Present (all players)')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Post-Integration' }));

  await screen.findByRole('heading', { name: 'Post-Integration hint' });
  expect(screen.getByText('Player pool: 1950–Present')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Post-Integration' })).toHaveAttribute('aria-pressed', 'true');
  expect(global.fetch).toHaveBeenCalledWith('/api/start?mode=post-integration');
  fireEvent.click(screen.getByRole('button', { name: '30 Team Era' }));
  await screen.findByRole('heading', { name: '30 Team Era hint' });
  expect(screen.getByText('Player pool: 1998–Present')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/start?mode=30-team-era');
});

test('keeps guesses separate per mode and restores them when switching back', async () => {
  const player = {
    id: 21,
    name: 'Modern Player',
    team: 'NYM',
    position: 'Shortstop',
    debut_year: '2000',
    retirement_year: '2010',
    plate_apps: '5000',
    avg: '0.300',
    obp: '0.400',
    slg: '0.500',
  };
  global.fetch = jest.fn((url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(url.startsWith('/api/start')
      ? { hint: url.includes('post-integration') ? 'Post-Integration hint' : '0.300/0.400/0.500' }
      : { success: false, msg: 'Try again', player, hints: {} }),
  }));

  render(<Game />);
  await screen.findByRole('heading', { name: '0.300/0.400/0.500' });
  fireEvent.click(screen.getByRole('button', { name: 'Post-Integration' }));
  await screen.findByRole('heading', { name: 'Post-Integration hint' });
  fireEvent.change(screen.getByPlaceholderText('Guess a player...'), {
    target: { value: 'Modern Player' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

  expect(await screen.findByRole('row', { name: /Modern Player/ })).toBeInTheDocument();
  const guessRequest = global.fetch.mock.calls.find(
    ([url]) => url === '/api/guess-player'
  );
  expect(JSON.parse(guessRequest[1].body)).toEqual({
    name: 'Modern Player',
    mode: 'post-integration',
  });

  fireEvent.click(screen.getByRole('button', { name: '30 Team Era' }));
  await screen.findByRole('heading', { name: '0.300/0.400/0.500' });
  expect(screen.getByText('0 guesses')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Post-Integration' }));
  await screen.findByRole('heading', { name: 'Post-Integration hint' });
  expect(screen.getByText('1 guess')).toBeInTheDocument();
  expect(screen.getByRole('row', { name: /Modern Player/ })).toBeInTheDocument();
});

test('reveals the selected mode player where feedback appears without adding a guess', async () => {
  const revealedPlayer = {
    id: 32,
    name: 'Revealed Legend',
    team: 'BOS',
    position: 'Rightfielder',
    debut_year: '1998',
    retirement_year: '2005',
    plate_apps: '4500',
    avg: '0.310',
    obp: '0.420',
    slg: '0.580',
  };
  global.fetch = jest.fn((url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(url.startsWith('/api/start')
      ? { hint: '0.310/0.420/0.580' }
      : { player: revealedPlayer }),
  }));

  render(<Game />);
  await screen.findByRole('heading', { name: '0.310/0.420/0.580' });
  fireEvent.click(screen.getByRole('button', { name: 'Reveal Player' }));

  const row = await screen.findByRole('row', { name: /Revealed Legend/ });
  expect(row).toHaveClass('past-guesses__player-row--correct');
  expect(within(row).getByText('RF')).toBeInTheDocument();
  expect(within(row).getByText('BOS')).toBeInTheDocument();
  expect(within(row).getByText('0.310')).toBeInTheDocument();
  expect(screen.getByText('0 guesses')).toBeInTheDocument();
  expect(screen.queryByText('Try again')).not.toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/reveal-player?mode=all-time');
  expect(screen.queryByPlaceholderText('Guess a player...')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reveal Player' })).not.toBeInTheDocument();
});

test('offers unlimited free play in a separate table after nine regular guesses', async () => {
  let guessNumber = 0;
  global.fetch = jest.fn((url) => {
    if (url.startsWith('/api/start')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hint: '0.300/0.400/0.500' }),
      });
    }

    guessNumber += 1;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        success: false,
        msg: 'Try again',
        player: {
          id: guessNumber,
          name: `Player ${guessNumber}`,
          position: 'Shortstop',
          team: 'NYM',
          debut_year: '2000',
          retirement_year: '2010',
          avg: '0.300',
          obp: '0.400',
          slg: '0.500',
        },
        hints: {},
      }),
    });
  });

  render(<Game />);
  await screen.findByRole('heading', { name: '0.300/0.400/0.500' });
  for (let number = 1; number <= 9; number += 1) {
    fireEvent.change(screen.getByPlaceholderText('Guess a player...'), {
      target: { value: `Player ${number}` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByRole('row', { name: new RegExp(`Player ${number}`) });
  }

  expect(screen.getAllByRole('row')).toHaveLength(10);
  expect(screen.getByText('9 guesses')).toBeInTheDocument();
  expect(screen.getByText('You’ve used all 9 guesses for this mode.')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Guess a player...')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reveal Player' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Free Play' })).toBeEnabled();

  fireEvent.change(screen.getByPlaceholderText('Guess a player...'), {
    target: { value: 'Player 10' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(guessNumber).toBe(9);

  fireEvent.click(screen.getByRole('button', { name: 'Free Play' }));
  const freePlaySection = screen.getByRole('region', { name: 'Free Play' });
  expect(within(freePlaySection).getByText('0 guesses')).toBeInTheDocument();
  expect(within(freePlaySection).getAllByRole('row')).toHaveLength(1);
  expect(screen.queryByText('You’ve used all 9 guesses for this mode.')).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText('Guess a player...')).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();

  for (let number = 10; number <= 11; number += 1) {
    fireEvent.change(screen.getByPlaceholderText('Guess a player...'), {
      target: { value: `Player ${number}` },
    });
    expect(screen.getByPlaceholderText('Guess a player...')).toHaveValue(`Player ${number}`);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(global.fetch).toHaveBeenCalledTimes(number + 1);
    expect(await within(freePlaySection).findByRole('row', {
      name: new RegExp(`Player ${number}`),
    })).toBeInTheDocument();
  }

  expect(guessNumber).toBe(11);
  expect(screen.getByText('9 guesses')).toBeInTheDocument();
  expect(within(freePlaySection).getByText('2 guesses')).toBeInTheDocument();
  expect(within(freePlaySection).getAllByRole('row')).toHaveLength(3);
});

test('ends Free Play input after a correct guess', async () => {
  let guessNumber = 0;
  global.fetch = jest.fn((url) => {
    if (url.startsWith('/api/start')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hint: '0.300/0.400/0.500' }),
      });
    }

    if (url.startsWith('/api/reveal-player')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ player: { name: 'Revealed' } }),
      });
    }

    guessNumber += 1;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        success: guessNumber === 10,
        msg: guessNumber === 10 ? 'You did it!' : 'Try again',
        player: {
          id: guessNumber,
          name: `Player ${guessNumber}`,
          position: 'Shortstop',
          team: 'NYM',
          debut_year: '2000',
          retirement_year: '2010',
          avg: '0.300',
          obp: '0.400',
          slg: '0.500',
        },
        hints: {},
      }),
    });
  });

  render(<Game />);
  await screen.findByRole('heading', { name: '0.300/0.400/0.500' });
  for (let number = 1; number <= 9; number += 1) {
    fireEvent.change(screen.getByPlaceholderText('Guess a player...'), {
      target: { value: `Player ${number}` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByRole('row', { name: new RegExp(`Player ${number}`) });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Free Play' }));
  const freePlaySection = screen.getByRole('region', { name: 'Free Play' });
  fireEvent.change(screen.getByPlaceholderText('Guess a player...'), {
    target: { value: 'Player 10' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

  expect(await screen.findByText('You did it!')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Player 10');
  expect(await within(freePlaySection).findByRole('row', { name: /Player 10/ })).toBeInTheDocument();
  expect(within(freePlaySection).getByText('1 guess')).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Guess a player...')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reveal Player' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Free Play' })).not.toBeInTheDocument();
  expect(guessNumber).toBe(10);
});
