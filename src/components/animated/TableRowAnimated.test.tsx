/**
 * Unit tests for TableRowAnimated.
 *
 * Verifies the staggered slide-in entrance wrapper renders its children inside
 * a table row and honours the prefers-reduced-motion preference.
 *
 * **Validates: Requirements 7.6, 12.1**
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { TableRowAnimated } from './TableRowAnimated';

function renderRow(props: { index: number; prefersReducedMotion: boolean }) {
  return render(
    <table>
      <tbody>
        <TableRowAnimated index={props.index} prefersReducedMotion={props.prefersReducedMotion}>
          <td>Cell content</td>
        </TableRowAnimated>
      </tbody>
    </table>,
  );
}

describe('TableRowAnimated', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders children inside a table row element', () => {
    renderRow({ index: 0, prefersReducedMotion: false });

    const cell = screen.getByText('Cell content');
    expect(cell).toBeTruthy();
    // The cell's parent should be a <tr>
    expect(cell.closest('tr')).not.toBeNull();
  });

  it('applies the glass-record styling class', () => {
    renderRow({ index: 0, prefersReducedMotion: false });

    const row = screen.getByText('Cell content').closest('tr');
    expect(row?.className).toContain('glass-record');
  });

  it('merges custom className with the base styling', () => {
    render(
      <table>
        <tbody>
          <TableRowAnimated index={0} prefersReducedMotion={false} className="custom-row">
            <td>Styled</td>
          </TableRowAnimated>
        </tbody>
      </table>,
    );

    const row = screen.getByText('Styled').closest('tr');
    expect(row?.className).toContain('glass-record');
    expect(row?.className).toContain('custom-row');
  });

  it('renders without error when prefers-reduced-motion is enabled', () => {
    renderRow({ index: 3, prefersReducedMotion: true });

    expect(screen.getByText('Cell content')).toBeTruthy();
  });
});
