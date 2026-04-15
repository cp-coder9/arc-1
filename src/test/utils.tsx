import React from 'react';
import { render as rtlRender, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

interface WrapperProps {
  children: React.ReactNode;
}

function Wrapper({ children }: WrapperProps) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

export function render(
  ui: React.ReactElement,
  options?: RenderOptions
) {
  return rtlRender(ui, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react';
export { render };
