/**
 * Messaging Service Tests
 * Tests for chat functionality
 */

import { describe, test, expect, jest } from '@jest/globals';
import { messagingService } from '../messagingService';

describe('messagingService', () => {
  test('should sanitize HTML content', () => {
    const maliciousContent = '<script>alert("xss")</script><b>Bold text</b>';
    // @ts-ignore - accessing private method for testing
    const sanitized = messagingService.sanitizeContent(maliciousContent);

    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('alert');
    expect(sanitized).toContain('<b>');
    expect(sanitized).toContain('</b>');
  });

  test('should handle empty content', () => {
    // @ts-ignore - accessing private method
    const sanitized = messagingService.sanitizeContent('');
    expect(sanitized).toBe('');
  });

  test('should handle content with only safe tags', () => {
    const safeContent = '<b>Bold</b> and <i>italic</i> and <strong>strong</strong>';
    // @ts-ignore - accessing private method
    const sanitized = messagingService.sanitizeContent(safeContent);
    expect(sanitized).toBe(safeContent);
  });

  test('should throw on empty message', async () => {
    await expect(
      messagingService.sendMessage({
        jobId: 'test-job',
        senderId: 'sender-1',
        senderRole: 'client',
        content: '   '
      })
    ).rejects.toThrow('Message content cannot be empty');
  });
});
