/**
 * CAD Processor Utility
 * Extracts text, dimensions, and metadata from DXF and DWG files.
 */

export interface CadExtraction {
  format: 'DXF' | 'DWG' | 'UNKNOWN';
  textLabels: string[];
  dimensions: string[];
  metadata: Record<string, any>;
  summary: string;
}

/**
 * Extracts text and metadata from a DXF file (text-based).
 */
export function processDXF(dxfContent: string): CadExtraction {
  const labels: string[] = [];
  const dimensions: string[] = [];
  const layers = new Set<string>();
  
  // Basic DXF Entity parsing using state machine/regex
  // DXF structure: 0\nENTITY_TYPE\n8\nLAYER_NAME\n1\nTEXT_VALUE
  
  const lines = dxfContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  let currentEntity: string | null = null;
  let currentLayer: string = '0';

  for (let i = 0; i < lines.length - 1; i += 2) {
    const groupCode = lines[i];
    const value = lines[i + 1];
    
    if (groupCode === '0') {
      currentEntity = value;
    } else if (groupCode === '8') {
      currentLayer = value;
      layers.add(value);
    } else if (groupCode === '1') {
      if (currentEntity === 'TEXT' || currentEntity === 'MTEXT') {
        // Clean up MTEXT formatting (e.g. \fArial|b0|i0|c0|p34;Bedroom 1)
        // Also remove brackets {} but keep content
        const cleanText = value.replace(/\\[A-Za-z0-9\.\-\|]+;?/g, '') // remove \fArial; etc
                              .replace(/[\{\}]/g, '') // remove brackets
                              .trim();
        if (cleanText && !labels.includes(cleanText)) {
          labels.push(cleanText);
        }
      }
    } else if (groupCode === '42') {
      if (currentEntity === 'DIMENSION') {
        dimensions.push(value);
      }
    }
  }

  return {
    format: 'DXF',
    textLabels: labels.slice(0, 500), // Limit to avoid prompt bloat
    dimensions: dimensions.slice(0, 100),
    metadata: {
      layerCount: layers.size,
      layers: Array.from(layers).slice(0, 20),
      entityCount: Math.round(lines.length / 10) // rough estimate
    },
    summary: `DXF Drawing with ${layers.size} layers and ${labels.length} text labels. Key labels: ${labels.slice(0, 10).join(', ')}`
  };
}

/**
 * Best-effort extraction for binary DWG files.
 * Uses a "strings" approach to find readable text.
 */
export function processDWG(buffer: Buffer): CadExtraction {
  const labels: string[] = [];
  
  // Look for sequences of 4 or more printable ASCII/UTF-8 characters
  // This helps find room names and notes embedded in the binary format.
  const content = buffer.toString('binary');
  const regex = /[\x20-\x7E]{4,}/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const text = match[0].trim();
    // Filter out common noise/keywords
    if (text.length > 3 && !/^[0-9\.\s]+$/.test(text) && !/AcDb/.test(text)) {
      if (!labels.includes(text)) {
        labels.push(text);
      }
    }
  }

  return {
    format: 'DWG',
    textLabels: labels.slice(0, 200),
    dimensions: [],
    metadata: {
      byteSize: buffer.length
    },
    summary: `DWG Binary Drawing. Extracted ${labels.length} potential text strings.`
  };
}

/**
 * Main entry point for CAD processing.
 */
export function extractCadData(buffer: Buffer, fileName: string): CadExtraction {
  const ext = fileName.toLowerCase().split('.').pop();
  
  if (ext === 'dxf') {
    return processDXF(buffer.toString('utf8'));
  } else if (ext === 'dwg') {
    return processDWG(buffer);
  }
  
  return {
    format: 'UNKNOWN',
    textLabels: [],
    dimensions: [],
    metadata: {},
    summary: 'Unknown CAD format'
  };
}
