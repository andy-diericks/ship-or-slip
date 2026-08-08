import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MicrosoftNote } from './MicrosoftNote';

describe('MicrosoftNote', () => {
  const note = {
    date: '2026-08-07',
    dateRaw: 'August 7, 2026',
    text: 'We have decided not to move forward with this change.',
  };

  it('quotes Microsoft and attributes it, so the voice is never ambiguous', () => {
    render(<MicrosoftNote note={note} />);
    expect(screen.getByText(/We have decided not to move forward/)).toBeInTheDocument();
    expect(screen.getByText(/— Microsoft, 7 August 2026/)).toBeInTheDocument();
  });

  it('renders as a blockquote, not as our own prose', () => {
    const { container } = render(<MicrosoftNote note={note} />);
    expect(container.querySelector('blockquote')).toBeTruthy();
    expect(container.querySelector('cite')).toBeTruthy();
  });

  it('shows the date Microsoft gave, which may precede when we noticed', () => {
    render(<MicrosoftNote note={{ ...note, date: '2026-06-02', dateRaw: 'June 2, 2026' }} />);
    expect(screen.getByText(/2 June 2026/)).toBeInTheDocument();
  });

  it("falls back to Microsoft's own rendering when the date will not parse", () => {
    render(<MicrosoftNote note={{ date: null, dateRaw: 'Augut 7, 2026', text: 'We stopped.' }} />);
    expect(screen.getByText(/Augut 7, 2026/)).toBeInTheDocument();
  });

  it('renders nothing when there is no note', () => {
    const { container: a } = render(<MicrosoftNote note={null} />);
    expect(a).toBeEmptyDOMElement();
    const { container: b } = render(<MicrosoftNote note={undefined} />);
    expect(b).toBeEmptyDOMElement();
  });

  it('renders nothing for an empty note text', () => {
    const { container } = render(
      <MicrosoftNote note={{ date: null, dateRaw: 'x', text: '' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
