export const PRD_PLATFORM_FEE_PERCENTAGE = 0.01;
export const PRD_PLATFORM_FEE_PERCENT = PRD_PLATFORM_FEE_PERCENTAGE * 100;
export const PRD_PLATFORM_FEE_BPS = PRD_PLATFORM_FEE_PERCENTAGE * 10_000;

export function calculatePrdPlatformFee(amount: number): number {
  return Math.round(amount * PRD_PLATFORM_FEE_PERCENTAGE);
}
