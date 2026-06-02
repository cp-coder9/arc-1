import React from 'react';

import { cn } from '@/lib/utils';

type NativeImageProps = React.ImgHTMLAttributes<HTMLImageElement>;

export interface OptimizedImageProps extends Omit<NativeImageProps, 'loading' | 'decoding'> {
  /**
   * Above-the-fold images can opt into eager loading. Uploaded media and
   * portfolio galleries should keep the default lazy loading.
   */
  eager?: boolean;
  /**
   * Explicit responsive sizes hint so browsers avoid over-downloading large
   * uploaded photos for card thumbnails.
   */
  sizes?: string;
}

export const DEFAULT_THUMBNAIL_SIZES = '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw';

export const OptimizedImage = React.forwardRef<HTMLImageElement, OptimizedImageProps>(
  ({ alt, className, eager = false, sizes = DEFAULT_THUMBNAIL_SIZES, onError, ...props }, ref) => {
    return (
      <img
        ref={ref}
        alt={alt || ''}
        className={cn('bg-secondary/20', className)}
        loading={eager ? 'eager' : 'lazy'}
        decoding={eager ? 'sync' : 'async'}
        fetchPriority={eager ? 'high' : 'auto'}
        sizes={sizes}
        referrerPolicy={props.referrerPolicy || 'no-referrer'}
        onError={(event) => {
          event.currentTarget.dataset.loadState = 'error';
          onError?.(event);
        }}
        {...props}
      />
    );
  }
);

OptimizedImage.displayName = 'OptimizedImage';
