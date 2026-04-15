import React from 'react';
import { render as rtlRender, RenderOptions } from '@testing-library/react';

interface WrapperProps {
  children: React.ReactNode;
}

function Wrapper({ children }: WrapperProps) {
  return <>{children}</>;
}

export function render(
  ui: React.ReactElement,
  options?: RenderOptions
) {
  return rtlRender(ui, { wrapper: Wrapper, ...options });
}

// Re-export everything except render, which we custom defined
export * from '@testing-library/react';
// We don't need export { render } because it's already exported above with 'export function render'
