/**
 * Host Agent — Capture Module
 *
 * Provides window capture, encoding, and UAC/system dialog detection
 * for governed remote desktop sessions.
 */

export {
  UACDetectionService,
  createNoOpDetector,
  createMockDetector,
  KNOWN_SYSTEM_DIALOG_CLASSES,
  KNOWN_UAC_PROCESSES,
  type UACDialogType,
  type DialogDetection,
  type UACDetectionState,
  type UACDetectionEvent,
  type UACDetectionConfig,
  type WindowsDialogDetector,
} from './uacDetectionService';
