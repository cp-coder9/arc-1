// @vitest-environment node
import {
  validateDescription,
  validateAttachment,
  validateStatusTransition,
  validateActionDescription,
  validateDeclineReason,
  validateCategory,
  feedbackSubmissionSchema,
  contextSnapshotSchema,
} from './feedbackValidation';

describe('feedbackValidation — validateDescription', () => {
  it('accepts a valid description with ≥10 non-whitespace chars and ≤2000 total', () => {
    const result = validateDescription('This is a valid feedback description.');
    expect(result).toEqual({ valid: true });
  });

  it('rejects a description with fewer than 10 non-whitespace characters', () => {
    const result = validateDescription('   abc   ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 10 non-whitespace');
  });

  it('rejects an empty string', () => {
    const result = validateDescription('');
    expect(result.valid).toBe(false);
  });

  it('rejects a description exceeding 2000 total characters', () => {
    const result = validateDescription('a'.repeat(2001));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('2000');
  });

  it('accepts exactly 10 non-whitespace characters', () => {
    const result = validateDescription('abcdefghij');
    expect(result).toEqual({ valid: true });
  });

  it('accepts exactly 2000 total characters with enough non-whitespace', () => {
    const result = validateDescription('a'.repeat(2000));
    expect(result).toEqual({ valid: true });
  });

  it('counts non-whitespace ignoring all whitespace types', () => {
    // 9 non-whitespace chars surrounded by whitespace
    const result = validateDescription('  a b c d e f g h i  ');
    expect(result.valid).toBe(false);
  });
});

describe('feedbackValidation — validateAttachment', () => {
  it('accepts a valid PNG file under the size limit', () => {
    const result = validateAttachment({ type: 'image/png', size: 1_000_000 }, 0);
    expect(result).toEqual({ valid: true });
  });

  it('accepts a valid JPEG file under the size limit', () => {
    const result = validateAttachment({ type: 'image/jpeg', size: 5_242_880 }, 2);
    expect(result).toEqual({ valid: true });
  });

  it('rejects when currentCount is already 3', () => {
    const result = validateAttachment({ type: 'image/png', size: 100 }, 3);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Maximum of 3');
  });

  it('rejects an invalid MIME type', () => {
    const result = validateAttachment({ type: 'application/pdf', size: 100 }, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('PNG or JPEG');
  });

  it('rejects a file exceeding 5MB', () => {
    const result = validateAttachment({ type: 'image/png', size: 5_242_881 }, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('5MB');
  });

  it('rejects image/gif even though it is an image format', () => {
    const result = validateAttachment({ type: 'image/gif', size: 1000 }, 0);
    expect(result.valid).toBe(false);
  });
});

describe('feedbackValidation — validateStatusTransition', () => {
  it('allows received → reviewing', () => {
    expect(validateStatusTransition('received', 'reviewing')).toEqual({ valid: true });
  });

  it('allows received → declined', () => {
    expect(validateStatusTransition('received', 'declined')).toEqual({ valid: true });
  });

  it('allows reviewing → planned', () => {
    expect(validateStatusTransition('reviewing', 'planned')).toEqual({ valid: true });
  });

  it('allows reviewing → declined', () => {
    expect(validateStatusTransition('reviewing', 'declined')).toEqual({ valid: true });
  });

  it('allows planned → shipped', () => {
    expect(validateStatusTransition('planned', 'shipped')).toEqual({ valid: true });
  });

  it('rejects shipped → anything (terminal)', () => {
    const result = validateStatusTransition('shipped', 'received');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('terminal state');
  });

  it('rejects declined → anything (terminal)', () => {
    const result = validateStatusTransition('declined', 'reviewing');
    expect(result.valid).toBe(false);
  });

  it('rejects received → shipped (skipping steps)', () => {
    const result = validateStatusTransition('received', 'shipped');
    expect(result.valid).toBe(false);
  });

  it('rejects planned → declined', () => {
    const result = validateStatusTransition('planned', 'declined');
    expect(result.valid).toBe(false);
  });
});

describe('feedbackValidation — validateActionDescription', () => {
  it('accepts a description of exactly 10 characters', () => {
    expect(validateActionDescription('1234567890')).toEqual({ valid: true });
  });

  it('rejects a description shorter than 10 characters', () => {
    const result = validateActionDescription('short');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 10');
  });

  it('accepts a longer description', () => {
    expect(validateActionDescription('Moving this to planned status for next sprint')).toEqual({ valid: true });
  });
});

describe('feedbackValidation — validateDeclineReason', () => {
  it('accepts a reason of exactly 20 characters', () => {
    expect(validateDeclineReason('12345678901234567890')).toEqual({ valid: true });
  });

  it('rejects a reason shorter than 20 characters', () => {
    const result = validateDeclineReason('too short reason');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 20');
  });

  it('rejects a reason exceeding 1000 characters', () => {
    const result = validateDeclineReason('x'.repeat(1001));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('1000');
  });

  it('accepts a reason of exactly 1000 characters', () => {
    expect(validateDeclineReason('x'.repeat(1000))).toEqual({ valid: true });
  });
});

describe('feedbackValidation — validateCategory', () => {
  it('accepts bug', () => {
    expect(validateCategory('bug')).toEqual({ valid: true });
  });

  it('accepts feature_request', () => {
    expect(validateCategory('feature_request')).toEqual({ valid: true });
  });

  it('accepts usability', () => {
    expect(validateCategory('usability')).toEqual({ valid: true });
  });

  it('accepts praise', () => {
    expect(validateCategory('praise')).toEqual({ valid: true });
  });

  it('rejects an invalid category', () => {
    const result = validateCategory('invalid');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid category');
  });

  it('rejects an empty string', () => {
    const result = validateCategory('');
    expect(result.valid).toBe(false);
  });
});

describe('feedbackValidation — feedbackSubmissionSchema', () => {
  const validSubmission = {
    category: 'bug',
    description: 'The button does not work when clicked on mobile',
    contextSnapshot: {
      pagePath: '/projects/123/documents',
      activeModule: 'documents',
      projectId: 'proj-123',
      userRole: 'architect',
      viewportWidth: 1920,
      viewportHeight: 1080,
    },
    attachmentUrls: [],
  };

  it('accepts a valid submission', () => {
    const result = feedbackSubmissionSchema.safeParse(validSubmission);
    expect(result.success).toBe(true);
  });

  it('rejects invalid category', () => {
    const result = feedbackSubmissionSchema.safeParse({ ...validSubmission, category: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects description with too few non-whitespace chars', () => {
    const result = feedbackSubmissionSchema.safeParse({ ...validSubmission, description: '   hi   ' });
    expect(result.success).toBe(false);
  });

  it('rejects more than 3 attachment URLs', () => {
    const result = feedbackSubmissionSchema.safeParse({
      ...validSubmission,
      attachmentUrls: ['https://a.com/1', 'https://a.com/2', 'https://a.com/3', 'https://a.com/4'],
    });
    expect(result.success).toBe(false);
  });
});

describe('feedbackValidation — contextSnapshotSchema', () => {
  it('accepts a valid context snapshot', () => {
    const result = contextSnapshotSchema.safeParse({
      pagePath: '/dashboard',
      activeModule: 'command-centre',
      projectId: null,
      userRole: 'client',
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing pagePath', () => {
    const result = contextSnapshotSchema.safeParse({
      pagePath: '',
      activeModule: 'command-centre',
      projectId: null,
      userRole: 'client',
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive viewport dimensions', () => {
    const result = contextSnapshotSchema.safeParse({
      pagePath: '/dashboard',
      activeModule: 'command-centre',
      projectId: null,
      userRole: 'client',
      viewportWidth: 0,
      viewportHeight: 900,
    });
    expect(result.success).toBe(false);
  });
});
