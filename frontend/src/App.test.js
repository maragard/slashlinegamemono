import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Slashline game and mode navigation', () => {
  render(<App />);
  expect(screen.getByText('Slashline')).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Game modes' })).toBeInTheDocument();
});
