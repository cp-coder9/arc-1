export {
  isRunningAsAdmin,
  getPrivilegeLevel,
  getDisabledFeatures,
  getEnabledFeatures,
  getPrivilegeStatus,
  isFeatureAvailable,
} from './privilegeDetectionService';

export type {
  PrivilegeLevel,
  PrivilegeStatus,
  AdminRequiredFeature,
  StandardUserFeature,
} from './privilegeDetectionService';
