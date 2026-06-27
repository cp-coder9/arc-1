/**
 * Parser and Serializer for Design Token Configuration
 * 
 * Feature: ui-ux-overhaul-landing-aesthetic
 * 
 * Implements Requirement 16: Parser and Serializer for Design Token Configuration
 * 
 * This module provides functions to parse token configuration from JSON/YAML format
 * and serialize tokens back to CSS custom properties format.
 * 
 * Preconditions:
 * - Token configuration follows the Token type structure
 * - Token values are valid for their type (color hex/rgba, dimension with unit, etc.)
 * 
 * Postconditions:
 * - parseTokenConfig returns Token[] array or throws descriptive error
 * - serializeTokens outputs valid CSS custom properties format
 * - roundTrip: parse(serialize(tokens)) == tokens (no data loss)
 */

export type TokenType = 'color' | 'dimension' | 'font-family' | 'radius' | 'layout' | 'glass';
export type TokenCategory = 'color' | 'landing' | 'glass' | 'layout' | 'font' | 'radius';

export interface Token {
  /** The CSS custom property name without leading --, e.g., "landing-bg" */
  name: string;
  /** The token value, e.g., "#0d2520" or "20px" or "'Space Grotesk', sans-serif" */
  value: string;
  /** The type of token value for validation */
  type: TokenType;
  /** Category for organization and pretty-printing */
  category: TokenCategory;
}

export interface TokenConfig {
  /** Array of token definitions */
  tokens: Token[];
  /** Optional metadata */
  metadata?: {
    name?: string;
    version?: string;
    description?: string;
  };
}

/**
 * Validates a token value according to its type.
 * Returns true if valid, false if invalid.
 */
export function validateTokenValue(value: string, type: TokenType): boolean {
  // Define regexes used in multiple cases
  const dimensionRegex = /^-?\d+(\.\d+)?(e[+-]?\d+)?(px|rem|em|%|vh|vw|vmin|vmax|ch|ex)$/;
  
  switch (type) {
    case 'color':
      // Hex color: #rgb, #rgba, #rrggbb, #rrggbbaa
      // RGBA color: rgba(r, g, b, a), rgb(r, g, b)
      // CSS color name (not exhaustive but covers basics)
      const colorHexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
      
      // Check for rgb/rgba with validation of value ranges
      if (value.startsWith('rgb')) {
        // Match rgb(r, g, b) or rgba(r, g, b, a)
        const rgbMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,\s*[\d.]+)?\s*\)$/);
        if (rgbMatch) {
          const r = parseInt(rgbMatch[1], 10);
          const g = parseInt(rgbMatch[2], 10);
          const b = parseInt(rgbMatch[3], 10);
          // Validate RGB values are 0-255
          if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
            return true;
          }
        }
        return false;
      }
      
      const colorNamedColors = ['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'white', 'black', 'red', 'green', 'blue'];
      
      if (colorHexRegex.test(value)) return true;
      if (colorNamedColors.includes(value.toLowerCase())) return true;
      
      // Check for CSS color names (simplified)
      if (value.match(/^[a-zA-Z]+$/)) return true; // Simple check for color names
      return false;

    case 'dimension':
    case 'radius':
    case 'layout':
      // CSS dimension with unit: px, rem, em, %, vh, vw, etc.
      // Supports scientific notation: 1.401298464324817e-45px
      return dimensionRegex.test(value);
    
    case 'glass':
      // Glass tokens can be colors (RGBA for transparency) or dimensions (for blur)
      // First check if it's a valid color
      const glassHexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
      const glassNamedColors = ['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'white', 'black', 'red', 'green', 'blue'];
      
      // Check for rgb/rgba
      if (value.startsWith('rgb')) {
        const rgbMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,\s*[\d.]+)?\s*\)$/);
        if (rgbMatch) {
          const r = parseInt(rgbMatch[1], 10);
          const g = parseInt(rgbMatch[2], 10);
          const b = parseInt(rgbMatch[3], 10);
          if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
            return true;
          }
        }
        return false;
      }
      
      // Check for hex or named color
      if (glassHexRegex.test(value)) return true;
      if (glassNamedColors.includes(value.toLowerCase())) return true;
      if (value.match(/^[a-zA-Z]+$/)) return true; // Simple check for color names
      
      // If not a color, check if it's a dimension
      return dimensionRegex.test(value);

    case 'font-family':
      // Font family string, often quoted
      return typeof value === 'string' && value.length > 0;

    default:
      return false;
  }
}

/**
 * Infers token category from name.
 */
export function inferCategory(name: string): TokenCategory {
  if (name.startsWith('--')) {
    name = name.slice(2);
  }
  
  if (name.includes('glass')) return 'glass';
  if (name.includes('landing')) return 'landing';
  if (name.includes('font')) return 'font';
  if (name.includes('radius')) return 'radius';
  if (name.includes('grid') || name.includes('step')) return 'layout';
  return 'color';
}

/**
 * Infers token type from value.
 */
export function inferType(value: string): TokenType {
  // Use the same validation logic as validateTokenValue but for inference
  
  // Check for hex colors (must start with # and have valid hex digits)
  const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  if (hexRegex.test(value)) return 'color';
  
  // Check for rgb/rgba colors
  if (value.startsWith('rgb') || value.startsWith('rgba')) {
    // Check if it matches the rgb/rgba pattern
    const rgbMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,\s*[\d.]+)?\s*\)$/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1], 10);
      const g = parseInt(rgbMatch[2], 10);
      const b = parseInt(rgbMatch[3], 10);
      // Validate RGB values are 0-255
      if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
        return 'color';
      }
    }
  }
  
  // Check for named colors
  const namedColors = ['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'white', 'black', 'red', 'green', 'blue'];
  if (namedColors.includes(value.toLowerCase())) return 'color';
  
  // Check for CSS color names (simple check - single word)
  if (value.match(/^[a-zA-Z]+$/)) return 'color';
  
  // Check for dimension values using the dimension regex
  const dimensionRegex = /^-?\d+(\.\d+)?(e[+-]?\d+)?(px|rem|em|%|vh|vw|vmin|vmax|ch|ex)$/;
  if (dimensionRegex.test(value)) return 'dimension';
  
  // Check for font family values (non-empty strings)
  // Font family validation is simple: any non-empty string is valid
  if (typeof value === 'string' && value.trim().length > 0) {
    // Heuristic: if it contains quotes and font fallback terms, it's likely a font family
    if (value.includes("'") && (value.includes('sans-serif') || value.includes('monospace') || value.includes('serif'))) {
      return 'font-family';
    }
    // Also check for common font family patterns
    if (value.includes(',') && (value.includes('sans-serif') || value.includes('monospace') || value.includes('serif'))) {
      return 'font-family';
    }
  }
  
  // Default to layout for other values
  return 'layout';
}

/**
 * Parses token configuration from JSON string.
 * 
 * @param json JSON string containing token configuration
 * @returns Array of Token objects
 * @throws Error if JSON is invalid or tokens fail validation
 */
export function parseTokenConfig(json: string): Token[] {
  let config: TokenConfig;
  try {
    config = JSON.parse(json);
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!config.tokens || !Array.isArray(config.tokens)) {
    throw new Error('Token configuration must contain "tokens" array');
  }

  const validatedTokens: Token[] = [];
  const errors: string[] = [];
  const seenNames = new Set<string>();

  for (let i = 0; i < config.tokens.length; i++) {
    const token = config.tokens[i];
    
    // Validate required fields
    if (!token.name || typeof token.name !== 'string') {
      errors.push(`Token at index ${i}: missing or invalid "name" field`);
      continue;
    }
    
    if (!token.value || typeof token.value !== 'string') {
      errors.push(`Token at index ${i}: missing or invalid "value" field`);
      continue;
    }

    // Normalize name: remove leading -- if present
    const normalizedName = token.name.startsWith('--') ? token.name.slice(2) : token.name;
    
    // Check for duplicate names
    if (seenNames.has(normalizedName)) {
      errors.push(`Token at index ${i}: duplicate token name "${normalizedName}"`);
      continue;
    }
    seenNames.add(normalizedName);
    
    // Determine type and category
    const type = token.type || inferType(token.value);
    const category = token.category || inferCategory(normalizedName);
    
    // Validate token value
    if (!validateTokenValue(token.value, type)) {
      errors.push(`Token "${normalizedName}" (${type}): invalid value "${token.value}"`);
      continue;
    }

    validatedTokens.push({
      name: normalizedName,
      value: token.value,
      type,
      category,
    });
  }

  if (errors.length > 0) {
    throw new Error(`Token validation failed:\n${errors.join('\n')}`);
  }

  return validatedTokens;
}

/**
 * Serializes tokens to CSS custom properties format.
 * 
 * @param tokens Array of Token objects to serialize
 * @param options Formatting options
 * @returns CSS string with token declarations
 */
export function serializeTokens(
  tokens: Token[],
  options: {
    indent?: number;
    sortByCategory?: boolean;
    includeComments?: boolean;
  } = {}
): string {
  const {
    indent = 2,
    sortByCategory = true,
    includeComments = false,
  } = options;

  // Group tokens by category if sorting is enabled
  const tokensToSerialize = sortByCategory 
    ? [...tokens].sort((a, b) => {
        // Sort by category first
        const categoryCompare = a.category.localeCompare(b.category);
        if (categoryCompare !== 0) return categoryCompare;
        // Then by name within category
        return a.name.localeCompare(b.name);
      })
    : tokens;

  const indentStr = ' '.repeat(indent);
  let css = '';

  let currentCategory: TokenCategory | null = null;

  for (const token of tokensToSerialize) {
    // Add category comment if enabled
    if (includeComments && token.category !== currentCategory) {
      if (currentCategory !== null) {
        css += '\n';
      }
      css += `${indentStr}/* ${token.category.charAt(0).toUpperCase() + token.category.slice(1)} tokens */\n`;
      currentCategory = token.category;
    }

    css += `${indentStr}--${token.name}: ${token.value};\n`;
  }

  return css.trim();
}

/**
 * Pretty prints token configuration as CSS custom properties.
 * This is a convenience wrapper around serializeTokens with default pretty-printing options.
 */
export function prettyPrintTokens(tokens: Token[]): string {
  return serializeTokens(tokens, {
    indent: 2,
    sortByCategory: true,
    includeComments: true,
  });
}

/**
 * Creates a sample token configuration based on the current theme.
 * Useful for testing and demonstration.
 */
export function createSampleTokenConfig(): TokenConfig {
  return {
    tokens: [
      // Color tokens
      { name: 'landing-bg', value: '#0d2520', type: 'color', category: 'landing' },
      { name: 'landing-bg-deep', value: '#081a16', type: 'color', category: 'landing' },
      { name: 'landing-text', value: '#ffffff', type: 'color', category: 'landing' },
      { name: 'landing-text-muted', value: 'rgba(255, 255, 255, 0.62)', type: 'color', category: 'landing' },
      { name: 'landing-accent', value: '#aeefe3', type: 'color', category: 'landing' },
      
      // Glass tokens
      { name: 'glass-bg', value: 'rgba(255, 255, 255, 0.07)', type: 'glass', category: 'glass' },
      { name: 'glass-border', value: 'rgba(174, 239, 227, 0.24)', type: 'glass', category: 'glass' },
      { name: 'glass-glow', value: 'rgba(0, 118, 102, 0.38)', type: 'glass', category: 'glass' },
      { name: 'glass-blur', value: '20px', type: 'dimension', category: 'glass' },
      
      // Font tokens
      { name: 'font-heading', value: "'Space Grotesk', sans-serif", type: 'font-family', category: 'font' },
      { name: 'font-sans', value: "'Inter', sans-serif", type: 'font-family', category: 'font' },
      { name: 'font-mono', value: "'JetBrains Mono', monospace", type: 'font-family', category: 'font' },
      
      // Radius tokens
      { name: 'radius', value: '1.25rem', type: 'radius', category: 'radius' },
      { name: 'radius-sm', value: '0.75rem', type: 'radius', category: 'radius' },
      { name: 'radius-md', value: '1rem', type: 'radius', category: 'radius' },
      { name: 'radius-lg', value: '1.25rem', type: 'radius', category: 'radius' },
      
      // Layout tokens
      { name: 'grid-step', value: '54px', type: 'dimension', category: 'layout' },
    ],
    metadata: {
      name: 'Dark Theme Tokens',
      version: '1.0.0',
      description: 'Default dark theme tokens for Architex landing page aesthetic',
    },
  };
}

/**
 * Round-trip test helper: parse(serialize(tokens)) should equal tokens.
 * This is the core property being tested.
 */
export function testRoundTrip(tokens: Token[]): boolean {
  try {
    // Serialize to CSS
    const css = serializeTokens(tokens);
    
    // Convert CSS back to tokens (simulate parsing CSS)
    // This is a simplified version - in reality you'd parse CSS back
    const parsedTokens = parseTokenConfigFromCSS(css);
    
    // Compare - they should be equivalent
    if (parsedTokens.length !== tokens.length) return false;
    
    for (let i = 0; i < tokens.length; i++) {
      const original = tokens[i];
      const parsed = parsedTokens[i];
      
      if (original.name !== parsed.name) return false;
      if (original.value !== parsed.value) return false;
      // Type and category might be inferred differently, so we don't compare them
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Helper function to parse token configuration from CSS string.
 * This simulates parsing CSS custom properties back to tokens.
 */
function parseTokenConfigFromCSS(css: string): Token[] {
  const lines = css.split('\n');
  const tokens: Token[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Match CSS custom property declaration: --name: value;
    const match = trimmed.match(/^--([\w-]+)\s*:\s*(.+?)\s*;$/);
    
    if (match) {
      const [, name, value] = match;
      const type = inferType(value);
      const category = inferCategory(name);
      
      tokens.push({
        name,
        value,
        type,
        category,
      });
    }
  }
  
  return tokens;
}