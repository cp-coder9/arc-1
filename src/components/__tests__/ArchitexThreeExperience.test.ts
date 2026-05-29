import { describe, expect, it } from 'vitest';

import {
  HERO_PANEL_LABEL_BOTTOM_RESERVED_PX,
  HERO_PANEL_LABEL_SAFE_INSET_PX,
  clampHeroPanelLabelPosition,
} from '../ArchitexThreeExperience';

describe('ArchitexThreeExperience hero label alignment', () => {
  it('keeps projected labels inside the right-hand hero panel instead of letting them clip at the card edge', () => {
    const position = clampHeroPanelLabelPosition(620, 535, 576, 544);

    expect(position.x).toBe(576 - HERO_PANEL_LABEL_SAFE_INSET_PX);
    expect(position.y).toBe(544 - HERO_PANEL_LABEL_BOTTOM_RESERVED_PX);
  });

  it('preserves already-safe label positions so the spatial layer remains visually balanced', () => {
    expect(clampHeroPanelLabelPosition(288, 170, 576, 544)).toEqual({ x: 288, y: 170 });
  });
});
