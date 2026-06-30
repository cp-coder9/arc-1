import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import DrawingPinViewer from '../DrawingPinViewer';

describe('DrawingPinViewer Edit Mode', () => {
  const drawingId = 'drawing-1';
  const drawingUrl = '/path/to/drawing.jpg';
  const issues = [
    { id: 'issue-1', drawingPin: { drawingId, x: 0.3, y: 0.4 } },
    { id: 'issue-2', drawingPin: { drawingId, x: 0.7, y: 0.8 } },
  ];

  beforeEach(() => {
    // Mock getBoundingClientRect for the container
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: vi.fn(),
    }));
  });

  it('highlights the edited pin with different styling', () => {
    render(
      <DrawingPinViewer
        drawingId={drawingId}
        drawingUrl={drawingUrl}
        issues={issues}
        mode="edit"
        editingIssueId="issue-1"
      />
    );

    const editedPin = screen.getByTestId('pin-marker-issue-1');
    const normalPin = screen.getByTestId('pin-marker-issue-2');

    // Edited pin should have animate-pulse and scale-125 classes
    expect(editedPin).toHaveClass('animate-pulse', 'ring-2', 'ring-yellow-500', 'scale-125');
    
    // Normal pin should not have edit styling
    expect(normalPin).not.toHaveClass('animate-pulse', 'ring-yellow-500', 'scale-125');
  });

  it('calls onPinEdited with new coordinates when clicking in edit mode', () => {
    const onPinEdited = vi.fn();

    render(
      <DrawingPinViewer
        drawingId={drawingId}
        drawingUrl={drawingUrl}
        issues={issues}
        mode="edit"
        editingIssueId="issue-1"
        onPinEdited={onPinEdited}
      />
    );

    const container = screen.getByTestId('drawing-pin-viewer');
    
    // Simulate click at position (400, 300) = normalized (0.5, 0.5)
    fireEvent.click(container, {
      clientX: 400,
      clientY: 300,
    });

    expect(onPinEdited).toHaveBeenCalledWith('issue-1', { x: 0.5, y: 0.5 });
  });

  it('clamps coordinates to [0, 1] when clicking outside bounds', () => {
    const onPinEdited = vi.fn();

    render(
      <DrawingPinViewer
        drawingId={drawingId}
        drawingUrl={drawingUrl}
        issues={issues}
        mode="edit"
        editingIssueId="issue-1"
        onPinEdited={onPinEdited}
      />
    );

    const container = screen.getByTestId('drawing-pin-viewer');
    
    // Simulate click at position (-100, 700) = clamped to (0, 1)
    fireEvent.click(container, {
      clientX: -100,
      clientY: 700,
    });

    expect(onPinEdited).toHaveBeenCalledWith('issue-1', { x: 0, y: 1 });
  });

  it('does not call onPinEdited when editingIssueId is not set', () => {
    const onPinEdited = vi.fn();

    render(
      <DrawingPinViewer
        drawingId={drawingId}
        drawingUrl={drawingUrl}
        issues={issues}
        mode="edit"
        onPinEdited={onPinEdited}
      />
    );

    const container = screen.getByTestId('drawing-pin-viewer');
    
    fireEvent.click(container, {
      clientX: 400,
      clientY: 300,
    });

    expect(onPinEdited).not.toHaveBeenCalled();
  });

  it('shows crosshair cursor in edit mode', () => {
    render(
      <DrawingPinViewer
        drawingId={drawingId}
        drawingUrl={drawingUrl}
        issues={issues}
        mode="edit"
        editingIssueId="issue-1"
      />
    );

    const container = screen.getByTestId('drawing-pin-viewer');
    expect(container).toHaveClass('cursor-crosshair');
  });

  it('has correct aria-label for edit mode', () => {
    render(
      <DrawingPinViewer
        drawingId={drawingId}
        drawingUrl={drawingUrl}
        issues={issues}
        mode="edit"
        editingIssueId="issue-1"
      />
    );

    const container = screen.getByTestId('drawing-pin-viewer');
    expect(container).toHaveAttribute('aria-label', expect.stringContaining('Click or press Enter to reposition'));
  });

  it('shows edited pin with "(currently being edited)" in aria-label', () => {
    render(
      <DrawingPinViewer
        drawingId={drawingId}
        drawingUrl={drawingUrl}
        issues={issues}
        mode="edit"
        editingIssueId="issue-1"
      />
    );

    const editedPin = screen.getByTestId('pin-marker-issue-1');
    const normalPin = screen.getByTestId('pin-marker-issue-2');

    expect(editedPin).toHaveAttribute('aria-label', expect.stringContaining('Issue pin issue-1'));
    expect(editedPin).toHaveAttribute('aria-label', expect.stringContaining('currently being edited'));
    expect(normalPin).toHaveAttribute('aria-label', expect.stringContaining('Issue pin issue-2'));
  });
});