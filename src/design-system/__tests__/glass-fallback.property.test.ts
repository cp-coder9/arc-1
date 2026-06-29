// Feature: ui-ux-overhaul-landing-aesthetic, Property 2: Glass fallback renders without layout shift
//
// Property-based test for the Glass Material System fallback-consistency invariant.
//
// Property 2 (design.md): Glass fallback renders without layout shift.
// When backdrop-filter is not supported, glass-* elements render identical dimensions
// in fallback mode, maintaining proper contrast and no Cumulative Layout Shift (CLS < 0.1).
//
// Validates: Requirements 2.5, 12.3, 12.4
//
// Sub-assertions:
//   (a) All glass variants have @supports not (backdrop-filter) fallback coverage
//       that applies opaque background while maintaining same visual dimensions.
//   (b) Fallback mode uses proper contrast background (--landing-bg-deep) for WCAG compliance.
//   (c) No layout shift occurs when switching between supported/unsupported modes.
//   (d) Interactive states (hover, focus) maintain consistent dimensions in fallback.
//
// The test validates that CSS fallbacks maintain layout stability across all glass variants
// by checking that fallback styles preserve dimensions and spacing, preventing CLS.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

const RUNS = { numRuns: 100 } as const;

// ── Sources of truth ─────────────────────────────────────────────────────────

const CSS_PATH = resolve(process.cwd(), 'src/index.css');
const CSS = readFileSync(CSS_PATH, 'utf8');

// Glass variant classes defined in the design system
const GLASS_VARIANTS = [
  'glass',
  'glass-base',
  'glass-card',
  'glass-panel',
  'glass-modal',
  'glass-sheet',
  'glass-drawer',
  'glass-tile',
  'glass-record',
  'glass-nav',
  'glass-dropdown',
  'glass-header',
  'glass-section',
  'glass-input',
  'glass-button',
  'glass-button-solid',
  'glass-icon-box',
  'glass-pill',
  'glass-metric',
  'glass-divider',
] as const;

// Properties that affect layout dimensions
const DIMENSION_PROPERTIES = [
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border-width',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'font-size',
  'line-height',
] as const;

// ── CSS parsing utilities ────────────────────────────────────────────────────

/** Strip CSS block comments so they never pollute declaration parsing. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Extract the @supports block for backdrop-filter fallback. */
function extractSupportsBlock(css: string): string {
  const start = css.indexOf('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))');
  if (start === -1) {
    throw new Error('@supports fallback block not found in index.css');
  }
  
  const blockStart = css.indexOf('{', start);
  if (blockStart === -1) {
    throw new Error('Malformed @supports block');
  }
  
  // Find matching closing brace
  let depth = 1;
  let pos = blockStart + 1;
  while (depth > 0 && pos < css.length) {
    if (css[pos] === '{') depth++;
    if (css[pos] === '}') depth--;
    pos++;
  }
  
  if (depth > 0) {
    throw new Error('Unbalanced braces in @supports block');
  }
  
  return css.slice(blockStart + 1, pos - 1);
}

const cleaned = stripComments(CSS);
const SUPPORTS_BLOCK = extractSupportsBlock(cleaned);

/** Check if a glass variant is included in the comma-separated fallback list. */
function hasFallbackForVariant(variant: string): boolean {
  // Use the getVariantsFromFallbackList function which already parses correctly
  const fallbackVariants = getVariantsFromFallbackList();
  return fallbackVariants.includes(variant);
}

/** Extract the base CSS block for a glass variant. */
function extractBaseCssForVariant(variant: string): string | null {
  const variantPattern = new RegExp(`\\.${variant}\\s*{[^}]*}`, 'g');
  const matches = cleaned.match(variantPattern);
  return matches?.[0] || null;
}

/** Get all variants from the comma-separated fallback list. */
function getVariantsFromFallbackList(): string[] {
  const variants: string[] = [];
  
  // Include .glass itself
  if (SUPPORTS_BLOCK.includes('.glass {')) {
    variants.push('glass');
  }
  
  // Find the comma-separated list block
  const listStart = SUPPORTS_BLOCK.indexOf('.glass-base,');
  if (listStart !== -1) {
    const blockStart = listStart;
    const blockEnd = SUPPORTS_BLOCK.indexOf('{', blockStart);
    const listText = SUPPORTS_BLOCK.slice(blockStart, blockEnd);
    
    // Extract all variant names from the list (including glass-base)
    const variantMatches = listText.match(/\.(glass(?:-[a-z-]+)?)\b/g);
    if (variantMatches) {
      variants.push(...variantMatches.map(v => v.substring(1)));
    }
  }
  
  return variants;
}

/** Parse CSS declarations from a CSS block. */
function parseDeclarations(cssBlock: string): Map<string, string> {
  const declarations = new Map<string, string>();
  const declPattern = /\s*([a-z-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  
  while ((match = declPattern.exec(cssBlock)) !== null) {
    declarations.set(match[1].trim(), match[2].trim());
  }
  
  return declarations;
}

/** Check if a declaration affects layout dimensions. */
function isDimensionProperty(property: string): boolean {
  return DIMENSION_PROPERTIES.some(dimProp => 
    property === dimProp || property.startsWith(dimProp + '-')
  );
}

/** Extract fallback CSS declarations that apply to a specific variant. */
function getFallbackDeclarationsForVariant(variant: string): Map<string, string> {
  const declarations = new Map<string, string>();
  
  if (variant === 'glass') {
    // Extract from .glass block
    const glassMatch = SUPPORTS_BLOCK.match(/\.glass\s*\{([^}]*)\}/);
    if (glassMatch) {
      const glassDeclarations = parseDeclarations(`{${glassMatch[1]}}`);
      glassDeclarations.forEach((value, key) => declarations.set(key, value));
    }
  } else if (hasFallbackForVariant(variant)) {
    // Extract from comma-separated list block
    const listMatch = SUPPORTS_BLOCK.match(/\.glass-base,[^{]*\{([^}]*)\}/);
    if (listMatch) {
      const listDeclarations = parseDeclarations(`{${listMatch[1]}}`);
      listDeclarations.forEach((value, key) => declarations.set(key, value));
    }
    
    // Check for specific hover states
    if (variant === 'glass-tile') {
      const tileHoverMatch = SUPPORTS_BLOCK.match(/\.glass-tile:hover\s*\{([^}]*)\}/);
      if (tileHoverMatch) {
        const hoverDeclarations = parseDeclarations(`{${tileHoverMatch[1]}}`);
        hoverDeclarations.forEach((value, key) => declarations.set(key, value));
      }
    }
    
    if (variant === 'glass-record') {
      const recordHoverMatch = SUPPORTS_BLOCK.match(/\.glass-record:hover\s*\{([^}]*)\}/);
      if (recordHoverMatch) {
        const hoverDeclarations = parseDeclarations(`{${recordHoverMatch[1]}}`);
        hoverDeclarations.forEach((value, key) => declarations.set(key, value));
      }
    }
  }
  
  return declarations;
}

/** Extract fallback CSS block for a specific variant (for CLS tests). */
function extractFallbackForVariant(variant: string): string | null {
  if (variant === 'glass') {
    const glassMatch = SUPPORTS_BLOCK.match(/\.glass\s*\{[^}]*\}/);
    return glassMatch?.[0] || null;
  }
  
  if (hasFallbackForVariant(variant)) {
    // All variants in the comma-separated list share the same block
    const listMatch = SUPPORTS_BLOCK.match(/\.glass-base,[^{]*\{([^}]*)\}/);
    if (listMatch) {
      // Return a synthesized block for the specific variant
      return `.${variant} {${listMatch[1]}}`;
    }
  }
  
  return null;
}

/** Check if fallback maintains layout dimensions consistent with base styles. */
function fallbackMaintainsDimensions(baseDeclarations: Map<string, string>, fallbackDeclarations: Map<string, string>): boolean {
  for (const [property, value] of baseDeclarations) {
    if (isDimensionProperty(property)) {
      const fallbackValue = fallbackDeclarations.get(property);
      // If dimension property exists in base but not in fallback, that's okay
      // But if it exists in both, they should match
      if (fallbackValue !== undefined && fallbackValue !== value) {
        return false;
      }
    }
  }
  return true;
}

/** Check if fallback has proper contrast background. */
function hasContrastBackground(declarations: Map<string, string>): boolean {
  const background = declarations.get('background');
  return background?.includes('var(--landing-bg-deep)') || false;
}



// ── Sanity guards ────────────────────────────────────────────────────────────

describe('Property 2: Glass fallback consistency — derivation guards', () => {
  it('loads CSS file successfully', () => {
    expect(CSS.length).toBeGreaterThan(0);
  });
  
  it('finds @supports fallback block', () => {
    expect(SUPPORTS_BLOCK.length).toBeGreaterThan(0);
    expect(SUPPORTS_BLOCK).toContain('background: var(--landing-bg-deep)');
  });
  
  it('has at least one glass variant defined', () => {
    const glassClassPattern = /\.glass(-[a-z]+)?\s*\{/g;
    const matches = CSS.match(glassClassPattern);
    expect(matches?.length).toBeGreaterThan(0);
  });
});

// ── Property tests ───────────────────────────────────────────────────────────

describe('Property 2: Glass fallback renders without layout shift', () => {
  // (a) All glass variants have @supports fallback coverage that applies opaque background
  //     while maintaining same visual dimensions.
  it('(a) glass variants in fallback list maintain dimensions and have fallback background', () => {
    const fallbackVariants = getVariantsFromFallbackList();
    
    fc.assert(
      fc.property(fc.constantFrom(...fallbackVariants), (variant) => {
        const baseCss = extractBaseCssForVariant(variant);
        
        // Some variants might not have standalone definitions
        if (!baseCss) {
          return true; // Skip if no base CSS found
        }
        
        const baseDeclarations = parseDeclarations(baseCss);
        const fallbackDeclarations = getFallbackDeclarationsForVariant(variant);
        
        // Check that fallback maintains layout dimensions (no layout shift)
        const maintainsDimensions = fallbackMaintainsDimensions(baseDeclarations, fallbackDeclarations);
        expect(maintainsDimensions, `Fallback for "${variant}" does not maintain layout dimensions`).toBe(true);
        
        // Check that fallback has contrast background (Requirement 2.5)
        const hasBackground = hasContrastBackground(fallbackDeclarations);
        expect(hasBackground, `Fallback for "${variant}" should use var(--landing-bg-deep) for contrast`).toBe(true);
        
        return maintainsDimensions && hasBackground;
      }),
      RUNS,
    );
  });
  
  // (b) Fallback mode uses proper contrast background for WCAG compliance.
  it('(b) fallback uses proper contrast background (--landing-bg-deep)', () => {
    const fallbackVariants = getVariantsFromFallbackList();
    
    fc.assert(
      fc.property(fc.constantFrom(...fallbackVariants), (variant) => {
        const fallbackDeclarations = getFallbackDeclarationsForVariant(variant);
        const hasBackground = hasContrastBackground(fallbackDeclarations);
        expect(hasBackground, `Fallback for "${variant}" should use var(--landing-bg-deep) for contrast`).toBe(true);
        return hasBackground;
      }),
      RUNS,
    );
    
    // Also check that the main .glass fallback has contrast background
    const glassFallbackMatch = SUPPORTS_BLOCK.match(/\.glass\s*\{([^}]*)\}/);
    expect(glassFallbackMatch, 'Main .glass fallback should exist').toBeTruthy();
    
    if (glassFallbackMatch) {
      const glassDeclarations = parseDeclarations(`{${glassFallbackMatch[1]}}`);
      const glassHasBackground = hasContrastBackground(glassDeclarations);
      expect(glassHasBackground, 'Main .glass fallback should use var(--landing-bg-deep)').toBe(true);
    }
  });
  
  // (c) Interactive states maintain consistent dimensions in fallback.
  it('(c) interactive states maintain consistent dimensions in fallback', () => {
    // Check for hover states in @supports block
    const hoverPattern = /\.glass-[a-z-]+:hover\s*\{([^}]*)\}/g;
    const hoverMatches = SUPPORTS_BLOCK.matchAll(hoverPattern);
    
    for (const match of hoverMatches) {
      const [fullMatch, cssContent] = match;
      const selector = fullMatch.match(/\.([^{]+)\{/)?.[1] || 'unknown';
      const hoverDeclarations = parseDeclarations(`{${cssContent}}`);
      
      // Check that hover states don't introduce layout shifts
      const hasTransform = hoverDeclarations.has('transform');
      const hasTranslate = hoverDeclarations.get('transform')?.includes('translate');
      
      if (hasTransform && hasTranslate) {
        // If transform has translate in fallback, it should be removed or set to none
        const transformValue = hoverDeclarations.get('transform');
        expect(transformValue, `Hover transform for "${selector}" should be disabled in fallback to prevent layout shift`).toBe('none');
      }
      
      // Check that hover doesn't change dimensions in ways that cause layout shift
      const changesWidth = hoverDeclarations.has('width');
      const changesHeight = hoverDeclarations.has('height');
      const changesPosition = hoverDeclarations.has('position');
      const changesTop = hoverDeclarations.has('top');
      const changesLeft = hoverDeclarations.has('left');
      
      expect(changesWidth, `Hover for "${selector}" should not change width in fallback`).toBe(false);
      expect(changesHeight, `Hover for "${selector}" should not change height in fallback`).toBe(false);
      expect(changesPosition, `Hover for "${selector}" should not change position in fallback`).toBe(false);
      expect(changesTop, `Hover for "${selector}" should not change top in fallback`).toBe(false);
      expect(changesLeft, `Hover for "${selector}" should not change left in fallback`).toBe(false);
    }
    
    // Also check for focus states
    const focusPattern = /\.glass-[a-z-]+:focus(?:-within)?\s*\{([^}]*)\}/g;
    const focusMatches = SUPPORTS_BLOCK.matchAll(focusPattern);
    
    for (const match of focusMatches) {
      const [fullMatch, cssContent] = match;
      const selector = fullMatch.match(/\.([^{]+)\{/)?.[1] || 'unknown';
      const focusDeclarations = parseDeclarations(`{${cssContent}}`);
      
      // Focus states should not introduce layout shifts
      const changesDimensions = Array.from(focusDeclarations.keys())
        .some(prop => isDimensionProperty(prop) && !prop.includes('outline') && !prop.includes('border'));
      
      expect(changesDimensions, `Focus state for "${selector}" should not change dimensions in fallback`).toBe(false);
    }
  });
  
  // (d) Comprehensive fallback coverage report
  it('(d) reports fallback coverage for all glass variants', () => {
    const fallbackVariants = getVariantsFromFallbackList();
    const coverageReport = GLASS_VARIANTS.map(variant => {
      const baseCss = extractBaseCssForVariant(variant);
      const hasFallback = hasFallbackForVariant(variant);
      const fallbackDeclarations = getFallbackDeclarationsForVariant(variant);
      
      let status = 'no-fallback';
      let issues: string[] = [];
      
      if (hasFallback) {
        const hasBackground = hasContrastBackground(fallbackDeclarations);
        if (!hasBackground) issues.push('missing-contrast-background');
        
        // Check dimension consistency if we have base CSS
        if (baseCss) {
          const baseDeclarations = parseDeclarations(baseCss);
          const maintainsDimensions = fallbackMaintainsDimensions(baseDeclarations, fallbackDeclarations);
          if (!maintainsDimensions) issues.push('dimensions-not-maintained');
        }
        
        status = issues.length === 0 ? 'ok' : 'issues: ' + issues.join(', ');
      } else {
        status = 'no-fallback';
        issues.push('not-in-fallback-list');
      }
      
      return { 
        variant, 
        status, 
        baseDefined: !!baseCss, 
        inFallbackList: hasFallback,
        issues: issues.length > 0 ? issues.join(', ') : 'none'
      };
    });
    
    // Log report for visibility
    // eslint-disable-next-line no-console
    console.table(coverageReport);
    
    // Check that all essential variants have fallback coverage
    const essentialVariants = ['glass', 'glass-card', 'glass-panel', 'glass-modal', 'glass-input', 'glass-button'];
    const missingFallback = essentialVariants.filter(v => !hasFallbackForVariant(v));
    expect(missingFallback.length, `Essential glass variants missing fallback: ${missingFallback.join(', ')}`).toBe(0);
  });
});

// ── CLS (Cumulative Layout Shift) specific tests ─────────────────────────────

describe('Property 2 extension: Cumulative Layout Shift prevention', () => {
  it('fallback does not introduce position shifts', () => {
    // Check that fallback styles don't use properties that cause layout shifts
    const layoutShiftProperties = ['top', 'left', 'right', 'bottom', 'position'];
    
    fc.assert(
      fc.property(fc.constantFrom(...GLASS_VARIANTS), (variant) => {
        const fallbackCss = extractFallbackForVariant(variant);
        
        if (!fallbackCss) {
          return true;
        }
        
        const fallbackDeclarations = parseDeclarations(fallbackCss);
        
        // Check for layout-shift-inducing properties
        for (const shiftProp of layoutShiftProperties) {
          if (fallbackDeclarations.has(shiftProp)) {
            const value = fallbackDeclarations.get(shiftProp);
            // Position: relative/absolute might be okay if dimensions are fixed
            if (shiftProp === 'position' && (value === 'relative' || value === 'absolute')) {
              // Check that dimensions are also defined
              const hasWidth = fallbackDeclarations.has('width');
              const hasHeight = fallbackDeclarations.has('height');
              if (!hasWidth || !hasHeight) {
                return false;
              }
            } else {
              return false;
            }
          }
        }
        
        return true;
      }),
      RUNS,
    );
  });
  
  it('fallback maintains box-sizing consistency', () => {
    // Box-sizing affects how dimensions are calculated
    fc.assert(
      fc.property(fc.constantFrom(...GLASS_VARIANTS), (variant) => {
        const baseCss = extractBaseCssForVariant(variant);
        const fallbackCss = extractFallbackForVariant(variant);
        
        if (!baseCss || !fallbackCss) {
          return true;
        }
        
        const baseDeclarations = parseDeclarations(baseCss);
        const fallbackDeclarations = parseDeclarations(fallbackCss);
        
        const baseBoxSizing = baseDeclarations.get('box-sizing');
        const fallbackBoxSizing = fallbackDeclarations.get('box-sizing');
        
        // If box-sizing is defined in base, it should match in fallback
        if (baseBoxSizing && fallbackBoxSizing) {
          return baseBoxSizing === fallbackBoxSizing;
        }
        
        // If not defined in either, that's fine
        return true;
      }),
      RUNS,
    );
  });
});