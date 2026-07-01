import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DrawingPinViewer from '../DrawingPinViewer';
import type { DrawingPin } from '@/types';

describe('DrawingPinViewer', () => {
  const drawingId = 'drawing-001';
  const drawingUrl = 'https://example.com/floor-plan.png';

  const issues: Array<{ id: string; drawingPin?: DrawingPin }> = [
    { id: 'issue-1', drawingPin: { drawingId: 'drawing-001', x: 0.25, y: 0.75 } },
    { id: 'issue-2', drawingPin: { drawingId: 'drawing-001', x: 0.5, y: 0.5 } },
    { id: 'issue-3', drawingPin: { drawingId: 'drawing-002', x: 0.1, y: 0.9 } }, // different drawing
    { id: 'issue-4' }, // no pin at all
  ];

  it('renders the drawing image with correct src and alt', () => {
    render(
      <DrawingPinViewer drawingId={drawingId} drawingUrl={drawingUrl} issues={issues} />,
    );

    const img = screen.getByAltText(`Project drawing ${drawingId}`);
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', drawingUrl);
  });

  it('renders one marker per issue whose drawingId matches the displayed drawing', () => {
    render(
      <DrawingPinViewer drawingId={drawingId} drawingUrl={drawingUrl} issues={issues} />,
    );

    // Should render markers for issue-1 and issue-2 (matching drawingId)
    expect(screen.getByTestId('pin-marker-issue-1')).toBeInTheDocument();
    expect(screen.getByTestId('pin-marker-issue-2')).toBeInTheDocument();

    // Should NOT render markers for issue-3 (different drawing) or issue-4 (no pin)
    expect(screen.queryByTestId('pin-marker-issue-3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pin-marker-issue-4')).not.toBeInTheDocument();
  });

  it('positions markers at stored (x, y) coordinates as CSS percentages', () => {
    render(
      <DrawingPinViewer drawingId={drawingId} drawingUrl={drawingUrl} issues={issues} />,
    );

    const marker1 = screen.getByTestId('pin-marker-issue-1');
    expect(marker1.style.left).toBe('25%');
    expect(marker1.style.top).toBe('75%');

    const marker2 = screen.getByTestId('pin-marker-issue-2');
    expect(marker2.style.left).toBe('50%');
    expect(marker2.style.top).toBe('50%');
  });

  it('calls onPinClick with the issueId when a marker is clicked', async () => {
    const user = userEvent.setup();
    const onPinClick = vi.fn();

    render(
      <DrawingPinViewer
        drawingId={drawingId}
        drawingUrl={drawingUrl}
        issues={issues}
        onPinClick={onPinClick}
      />,
    );

    await user.click(screen.getByTestId('pin-marker-issue-1'));
    expect(onPinClick).toHaveBeenCalledWith('issue-1');
    expect(onPinClick).toHaveBeenCalledTimes(1);
  });

  it('renders no markers when no issues match the drawing', () => {
    render(
      <DrawingPinViewer
        drawingId="non-existent-drawing"
        drawingUrl={drawingUrl}
        issues={issues}
      />,
    );

    expect(screen.queryByTestId('pin-marker-issue-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pin-marker-issue-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pin-marker-issue-3')).not.toBeInTheDocument();
  });

  it('renders no markers when issues array is empty', () => {
    render(
      <DrawingPinViewer drawingId={drawingId} drawingUrl={drawingUrl} issues={[]} />,
    );

    const container = screen.getByTestId('drawing-pin-viewer');
    // Only the image should be present, no buttons
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  it('each marker has an accessible label', () => {
    render(
      <DrawingPinViewer drawingId={drawingId} drawingUrl={drawingUrl} issues={issues} />,
    );

    expect(screen.getByLabelText(/Issue pin issue-1 at 25% horizontal, 75% vertical/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Issue pin issue-2 at 50% horizontal, 50% vertical/)).toBeInTheDocument();
  });

  describe('pin placement mode', () => {
    it('defaults to view mode (no crosshair cursor)', () => {
      render(
        <DrawingPinViewer drawingId={drawingId} drawingUrl={drawingUrl} issues={issues} />,
      );

      const container = screen.getByTestId('drawing-pin-viewer');
      expect(container.className).not.toContain('cursor-crosshair');
    });

    it('shows crosshair cursor when mode is place', () => {
      render(
        <DrawingPinViewer
          drawingId={drawingId}
          drawingUrl={drawingUrl}
          issues={issues}
          mode="place"
        />,
      );

      const container = screen.getByTestId('drawing-pin-viewer');
      expect(container.className).toContain('cursor-crosshair');
    });

    it('calls onPinPlaced with normalized coordinates on click in place mode', () => {
      const onPinPlaced = vi.fn();

      render(
        <DrawingPinViewer
          drawingId={drawingId}
          drawingUrl={drawingUrl}
          issues={issues}
          mode="place"
          onPinPlaced={onPinPlaced}
        />,
      );

      const container = screen.getByTestId('drawing-pin-viewer');

      // Mock getBoundingClientRect to return a known container size
      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        top: 50,
        width: 800,
        height: 600,
        right: 900,
        bottom: 650,
        x: 100,
        y: 50,
        toJSON: () => {},
      });

      // Click at position (500, 350) relative to viewport
      // Normalized: x = (500 - 100) / 800 = 0.5, y = (350 - 50) / 600 = 0.5
      fireEvent.click(container, { clientX: 500, clientY: 350 });

      expect(onPinPlaced).toHaveBeenCalledTimes(1);
      expect(onPinPlaced).toHaveBeenCalledWith({ x: 0.5, y: 0.5 });
    });

    it('normalizes coordinates to 0..1 range', () => {
      const onPinPlaced = vi.fn();

      render(
        <DrawingPinViewer
          drawingId={drawingId}
          drawingUrl={drawingUrl}
          issues={issues}
          mode="place"
          onPinPlaced={onPinPlaced}
        />,
      );

      const container = screen.getByTestId('drawing-pin-viewer');

      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 1000,
        height: 500,
        right: 1000,
        bottom: 500,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Click at (250, 125) → x = 0.25, y = 0.25
      fireEvent.click(container, { clientX: 250, clientY: 125 });

      expect(onPinPlaced).toHaveBeenCalledWith({ x: 0.25, y: 0.25 });
    });

    it('clamps coordinates to [0, 1] when click is outside container bounds', () => {
      const onPinPlaced = vi.fn();

      render(
        <DrawingPinViewer
          drawingId={drawingId}
          drawingUrl={drawingUrl}
          issues={issues}
          mode="place"
          onPinPlaced={onPinPlaced}
        />,
      );

      const container = screen.getByTestId('drawing-pin-viewer');

      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        top: 100,
        width: 400,
        height: 300,
        right: 500,
        bottom: 400,
        x: 100,
        y: 100,
        toJSON: () => {},
      });

      // Click at (50, 50) → before container → raw: (-50/400, -50/300) → clamped to (0, 0)
      fireEvent.click(container, { clientX: 50, clientY: 50 });

      expect(onPinPlaced).toHaveBeenCalledWith({ x: 0, y: 0 });
    });

    it('does not call onPinPlaced when in view mode', () => {
      const onPinPlaced = vi.fn();

      render(
        <DrawingPinViewer
          drawingId={drawingId}
          drawingUrl={drawingUrl}
          issues={issues}
          mode="view"
          onPinPlaced={onPinPlaced}
        />,
      );

      const container = screen.getByTestId('drawing-pin-viewer');
      fireEvent.click(container, { clientX: 200, clientY: 200 });

      expect(onPinPlaced).not.toHaveBeenCalled();
    });

    it('does not call onPinPlaced when mode is place but callback is not provided', () => {
      // Should not throw
      render(
        <DrawingPinViewer
          drawingId={drawingId}
          drawingUrl={drawingUrl}
          issues={issues}
          mode="place"
        />,
      );

      const container = screen.getByTestId('drawing-pin-viewer');
      expect(() => fireEvent.click(container, { clientX: 200, clientY: 200 })).not.toThrow();
    });

    it('has accessible label and role in place mode', () => {
      render(
        <DrawingPinViewer
          drawingId={drawingId}
          drawingUrl={drawingUrl}
          issues={issues}
          mode="place"
          onPinPlaced={vi.fn()}
        />,
      );

      const container = screen.getByTestId('drawing-pin-viewer');
      expect(container).toHaveAttribute('role', 'button');
      expect(container).toHaveAttribute('aria-label', expect.stringContaining('Click or press Enter to place a pin'));
    });

    it('does not have role=button in view mode', () => {
      render(
        <DrawingPinViewer drawingId={drawingId} drawingUrl={drawingUrl} issues={issues} />,
      );

      const container = screen.getByTestId('drawing-pin-viewer');
      expect(container).toHaveAttribute('role', 'img');
    });

    it('still renders existing pins in place mode', () => {
      render(
        <DrawingPinViewer
          drawingId={drawingId}
          drawingUrl={drawingUrl}
          issues={issues}
          mode="place"
          onPinPlaced={vi.fn()}
        />,
      );

      expect(screen.getByTestId('pin-marker-issue-1')).toBeInTheDocument();
      expect(screen.getByTestId('pin-marker-issue-2')).toBeInTheDocument();
    });

    it('does not call onPinClick on marker click when in place mode', async () => {
      const onPinClick = vi.fn();
      const onPinPlaced = vi.fn();
      const user = userEvent.setup();

      render(
        <DrawingPinViewer
          drawingId={drawingId}
          drawingUrl={drawingUrl}
          issues={issues}
          mode="place"
          onPinClick={onPinClick}
          onPinPlaced={onPinPlaced}
        />,
      );

      await user.click(screen.getByTestId('pin-marker-issue-1'));
      expect(onPinClick).not.toHaveBeenCalled();
    });
  });
});
