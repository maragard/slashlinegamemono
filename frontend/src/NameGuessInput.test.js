import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NameGuessInput } from './NameGuessInput';

const players = [
  {
    id: 101,
    name: 'Sam Same',
    team: 'TEAM A',
    debut_year: '1960',
    retirement_year: 'Not Found',
  },
  {
    id: 102,
    name: 'Sam Same',
    team: 'TEAM B',
    debut_year: '1980',
    retirement_year: '1990',
  },
];
const originalFetch = global.fetch;

function SuggestionInputHarness({ mode = 'all-time', pastGuesses = [] }) {
  const [value, setValue] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  return (
    <>
      <NameGuessInput
        value={value}
        onChange={setValue}
        onPlayerSelect={setSelectedId}
        pastGuesses={pastGuesses}
        mode={mode}
      />
      <output data-testid="selected-id">{selectedId ?? ''}</output>
    </>
  );
}

describe('NameGuessInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => players,
      headers: { get: () => '"suggestions-etag"' },
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  test('shows duplicate names with metadata and selects only the name', async () => {
    render(<SuggestionInputHarness />);
    fireEvent.change(screen.getByPlaceholderText('Guess a player...'), {
      target: { value: 'Sam' },
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    const secondPlayerDetails = screen.getByText('TEAM B · 1980 · 1990');
    expect(screen.getAllByText('Sam Same')).toHaveLength(2);
    expect(screen.getByText('TEAM A · 1960 · Active')).toBeInTheDocument();

    fireEvent.mouseDown(secondPlayerDetails.closest('li'));

    expect(screen.getByPlaceholderText('Guess a player...')).toHaveValue('Sam Same');
    expect(screen.getByTestId('selected-id')).toHaveTextContent('102');

    fireEvent.change(screen.getByPlaceholderText('Guess a player...'), {
      target: { value: 'Sam Sam' },
    });
    expect(screen.getByTestId('selected-id')).toBeEmptyDOMElement();
  });

  test('accepts name-only suggestions and sends the selected mode', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ['Sam Same'],
      headers: { get: () => '"names-etag"' },
    });

    render(<SuggestionInputHarness mode="post-integration" />);
    fireEvent.change(screen.getByPlaceholderText('Guess a player...'), {
      target: { value: 'Sam' },
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    const suggestion = screen.getByText('Sam Same');
    expect(suggestion).toBeInTheDocument();
    expect(screen.queryByText(/Team not listed/)).not.toBeInTheDocument();
    fireEvent.mouseDown(suggestion.closest('li'));

    expect(screen.getByPlaceholderText('Guess a player...')).toHaveValue('Sam Same');
    expect(screen.getByTestId('selected-id')).toBeEmptyDOMElement();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/suggest?q=Sam&mode=post-integration',
      { headers: {} }
    );
  });
});
