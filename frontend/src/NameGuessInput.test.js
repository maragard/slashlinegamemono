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

function SuggestionInputHarness() {
  const [value, setValue] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  return (
    <>
      <NameGuessInput
        value={value}
        onChange={setValue}
        onPlayerSelect={setSelectedId}
        pastGuesses={[]}
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

  test('shows duplicate names with metadata and selects the player ID', async () => {
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
});
