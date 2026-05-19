import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { DEFAULT_THUMBNAIL_SIZES, OptimizedImage } from './optimized-image';

describe('OptimizedImage', () => {
  test('defaults uploaded-media thumbnails to lazy async loading with a responsive sizes hint', () => {
    render(<OptimizedImage src="https://files.example/portfolio.jpg" alt="Portfolio project" className="rounded" />);

    const image = screen.getByAltText('Portfolio project');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveAttribute('fetchpriority', 'auto');
    expect(image).toHaveAttribute('sizes', DEFAULT_THUMBNAIL_SIZES);
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(image).toHaveClass('rounded');
  });

  test('allows above-the-fold images to opt into eager priority', () => {
    render(<OptimizedImage src="/hero.jpg" alt="Hero" eager sizes="100vw" />);

    const image = screen.getByAltText('Hero');
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('decoding', 'sync');
    expect(image).toHaveAttribute('fetchpriority', 'high');
    expect(image).toHaveAttribute('sizes', '100vw');
  });

  test('marks failed media without throwing so card galleries can continue rendering', () => {
    const onError = vi.fn();
    render(<OptimizedImage src="https://files.example/missing.jpg" alt="Missing" onError={onError} />);

    const image = screen.getByAltText('Missing') as HTMLImageElement;
    image.dispatchEvent(new Event('error', { bubbles: true }));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(image.dataset.loadState).toBe('error');
  });
});
