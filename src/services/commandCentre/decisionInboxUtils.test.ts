/**
 * Decision Inbox Utilities — Unit Tests
 *
 * Tests urgency sorting and defer date validation for the Mobile Decision Inbox.
 * @validates Requirements 14.4, 14.6
 */

import { sortByUrgency, validateDeferDate, type DecisionCard } from './decisionInboxUtils';

describe('decisionInboxUtils', () => {
  describe('sortByUrgency', () => {
    const makeCard = (overrides: Partial<DecisionCard>): DecisionCard => ({
      id: 'card-1',
      title: 'Test Decision',
      requestingParty: 'Contractor A',
      projectReference: 'PRJ-001',
      deadline: '2025-03-15',
      urgency: 'standard',
      actionType: 'payment_approval',
      ...overrides,
    });

    it('sorts overdue before today', () => {
      const cards = [
        makeCard({ id: 'a', urgency: 'today', deadline: '2025-03-01' }),
        makeCard({ id: 'b', urgency: 'overdue', deadline: '2025-02-28' }),
      ];
      const sorted = sortByUrgency(cards);
      expect(sorted[0].id).toBe('b');
      expect(sorted[1].id).toBe('a');
    });

    it('sorts today before this_week', () => {
      const cards = [
        makeCard({ id: 'a', urgency: 'this_week', deadline: '2025-03-05' }),
        makeCard({ id: 'b', urgency: 'today', deadline: '2025-03-01' }),
      ];
      const sorted = sortByUrgency(cards);
      expect(sorted[0].id).toBe('b');
      expect(sorted[1].id).toBe('a');
    });

    it('sorts this_week before standard', () => {
      const cards = [
        makeCard({ id: 'a', urgency: 'standard', deadline: '2025-03-20' }),
        makeCard({ id: 'b', urgency: 'this_week', deadline: '2025-03-05' }),
      ];
      const sorted = sortByUrgency(cards);
      expect(sorted[0].id).toBe('b');
      expect(sorted[1].id).toBe('a');
    });

    it('maintains full urgency ordering: overdue > today > this_week > standard', () => {
      const cards = [
        makeCard({ id: 'd', urgency: 'standard', deadline: '2025-04-01' }),
        makeCard({ id: 'c', urgency: 'this_week', deadline: '2025-03-10' }),
        makeCard({ id: 'a', urgency: 'overdue', deadline: '2025-02-20' }),
        makeCard({ id: 'b', urgency: 'today', deadline: '2025-03-01' }),
      ];
      const sorted = sortByUrgency(cards);
      expect(sorted.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('sorts by deadline ascending within the same urgency group', () => {
      const cards = [
        makeCard({ id: 'b', urgency: 'overdue', deadline: '2025-02-25' }),
        makeCard({ id: 'a', urgency: 'overdue', deadline: '2025-02-20' }),
        makeCard({ id: 'c', urgency: 'overdue', deadline: '2025-02-28' }),
      ];
      const sorted = sortByUrgency(cards);
      expect(sorted.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    });

    it('does not mutate the input array', () => {
      const cards = [
        makeCard({ id: 'b', urgency: 'today', deadline: '2025-03-01' }),
        makeCard({ id: 'a', urgency: 'overdue', deadline: '2025-02-28' }),
      ];
      const original = [...cards];
      sortByUrgency(cards);
      expect(cards).toEqual(original);
    });

    it('handles empty array', () => {
      expect(sortByUrgency([])).toEqual([]);
    });

    it('handles single item', () => {
      const cards = [makeCard({ id: 'only' })];
      const sorted = sortByUrgency(cards);
      expect(sorted).toHaveLength(1);
      expect(sorted[0].id).toBe('only');
    });

    it('handles multiple items in same urgency group with same deadline', () => {
      const cards = [
        makeCard({ id: 'a', urgency: 'today', deadline: '2025-03-01' }),
        makeCard({ id: 'b', urgency: 'today', deadline: '2025-03-01' }),
      ];
      const sorted = sortByUrgency(cards);
      expect(sorted).toHaveLength(2);
      // Both are today with same deadline, order is stable
      expect(sorted[0].urgency).toBe('today');
      expect(sorted[1].urgency).toBe('today');
    });
  });

  describe('validateDeferDate', () => {
    const today = '2025-03-01';

    it('returns true for 1 day after today', () => {
      expect(validateDeferDate('2025-03-02', today)).toBe(true);
    });

    it('returns true for 30 days after today', () => {
      expect(validateDeferDate('2025-03-31', today)).toBe(true);
    });

    it('returns true for 15 days after today (mid-range)', () => {
      expect(validateDeferDate('2025-03-16', today)).toBe(true);
    });

    it('returns false for same day as today (0 days)', () => {
      expect(validateDeferDate('2025-03-01', today)).toBe(false);
    });

    it('returns false for date before today', () => {
      expect(validateDeferDate('2025-02-28', today)).toBe(false);
    });

    it('returns false for 31 days after today', () => {
      expect(validateDeferDate('2025-04-01', today)).toBe(false);
    });

    it('returns false for far future date (90 days)', () => {
      expect(validateDeferDate('2025-05-30', today)).toBe(false);
    });

    it('returns false for invalid date string', () => {
      expect(validateDeferDate('not-a-date', today)).toBe(false);
    });

    it('returns false for invalid today string', () => {
      expect(validateDeferDate('2025-03-15', 'invalid')).toBe(false);
    });

    it('handles month boundary correctly', () => {
      // March 1 + 30 days = March 31
      expect(validateDeferDate('2025-03-31', '2025-03-01')).toBe(true);
      // March 1 + 31 days = April 1 — invalid
      expect(validateDeferDate('2025-04-01', '2025-03-01')).toBe(false);
    });

    it('handles February boundary correctly', () => {
      // Feb 1 + 28 days = March 1 (non-leap year)
      expect(validateDeferDate('2025-03-01', '2025-02-01')).toBe(true);
      // Feb 1 + 30 days = March 3
      expect(validateDeferDate('2025-03-03', '2025-02-01')).toBe(true);
    });
  });
});
