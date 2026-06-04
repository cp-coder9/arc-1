/**
 * Architex Project Communication Engine — barrel export
 */

export { ProjectChatApplet } from './ProjectChatApplet';
export type { ProjectChatAppletProps } from './ProjectChatApplet';

export { ProjectMessageCentre } from './ProjectMessageCentre';
export type { ProjectMessageCentreProps } from './ProjectMessageCentre';

export { ProjectCommunicationPanel } from './ProjectCommunicationPanel';
export type { ProjectCommunicationPanelProps } from './ProjectCommunicationPanel';

export {
  sendProjectCommunication,
  subscribeToProjectCommunications,
  subscribeToProjectCommunicationsByPhase,
} from './projectCommunicationService';
export type { SendProjectCommunicationParams } from './projectCommunicationService';

export {
  PHASE_COMMUNICATION_UI_CONFIG,
  getPhaseCommunicationUIConfig,
} from './phaseConfig';
export type { PhaseCommunicationUIConfig } from './phaseConfig';

export type {
  ProjectCaptureItem,
  ProjectCommunicationRecord,
  ProjectActionRecord,
} from './types';
