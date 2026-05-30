import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ProjectCommunicationCentrePage static integration', () => {
  it('exposes the Greg/Amy Project Chat Applet and desktop Message Centre surfaces', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/ProjectCommunicationCentrePage.tsx'), 'utf8');

    expect(source).toContain('ProjectChatApplet');
    expect(source).toContain('ProjectMessageCentre');
    expect(source).toContain('buildProjectCommunicationCentreModel');
    expect(source).toContain('getPhaseCommunicationConfig');
    expect(source).toContain('requiresHumanApproval');
    expect(source).toContain('structuredStatus');
    expect(source).toContain('recordLinks');
  });
});
