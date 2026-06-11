/**
 * Tests for Agent Service — Pack 14
 */
import { describe, expect, it } from 'vitest';
import { AgentService } from '../agentService';

describe('AgentService', () => {
  describe('getOrCreateUserAgent', () => {
    it('is defined as a static method', () => {
      expect(typeof AgentService.getOrCreateUserAgent).toBe('function');
    });
  });

  describe('getOrCreateProjectAgent', () => {
    it('is defined as a static method', () => {
      expect(typeof AgentService.getOrCreateProjectAgent).toBe('function');
    });
  });

  describe('getAgentContext', () => {
    it('is defined as a static method', () => {
      expect(typeof AgentService.getAgentContext).toBe('function');
    });
  });

  describe('updateAgentContext', () => {
    it('is defined as a static method', () => {
      expect(typeof AgentService.updateAgentContext).toBe('function');
    });
  });

  describe('deleteUserAgent', () => {
    it('is defined as a static method', () => {
      expect(typeof AgentService.deleteUserAgent).toBe('function');
    });
  });

  describe('deleteProjectAgent', () => {
    it('is defined as a static method', () => {
      expect(typeof AgentService.deleteProjectAgent).toBe('function');
    });
  });
});
