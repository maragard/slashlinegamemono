import { act, fireEvent, render, screen } from '@testing-library/react';
import Game from './Game';

const player = {
  id: 102,
  name: 'Sam Same',
  team: 'TEAM B',
  position: 'Outfielder',
  debut_year: '1980',
  retirement_year: '1990',
  plate_apps: '1200',
  avg: '.250',
  obp: '.350',
  slg: '.450',
};
const originalFetch = global.fetch;
let guessRequest;

describe('Game player guesses', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    guessRequest = null;
    global.fetch = jest.fn((url, options) => {
      if (url.startsWith('/api/start')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ hint: 'slashline' }),
        });
      }
      if (url.startsWith('/api/suggest')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [player],
          headers: { get: () => '"suggestions-etag"' },
        });
      }
      if (url === '/api/guess-player') {
        guessRequest = options;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: false,
            msg: 'Try again',
            player,
            hints: {},
          }),
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  test('submits the selected suggestion ID with the selected game mode', async () => {
    render(<Game />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const input = screen.getByPlaceholderText('Guess a player...');
    fireEvent.change(input, { target: { value: 'Sam' } });
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.mouseDown(screen.getByText('TEAM B · 1980 · 1990').closest('li'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(JSON.parse(guessRequest.body)).toEqual({ id: 102, mode: 'all-time' });
  });

  test('submits typed guesses by name', async () => {
    render(<Game />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.change(screen.getByPlaceholderText('Guess a player...'), {
      target: { value: 'Sam Same' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(JSON.parse(guessRequest.body)).toEqual({ name: 'Sam Same', mode: 'all-time' });
  });
});
