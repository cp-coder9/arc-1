import type { FeeCalculationResult, FeeInput, FeeLine, ProfessionProfile } from './types';
import { roundMoney } from './ids';

export class FeeCalculatorEngine {
  calculate(input: FeeInput, profile: ProfessionProfile): FeeCalculationResult {
    validate(input, profile);
    const complexity = profile.complexity.find((c) => c.id === input.complexityId) ?? profile.complexity.find((c) => c.id === 'medium')!;
    const weightedCategoryFactor = Object.entries(input.workCategorySplits).reduce((sum, [categoryId, split]) => {
      const cat = profile.workCategories.find((c) => c.id === categoryId);
      return sum + (cat ? split * cat.factor : 0);
    }, 0);
    const categoryFactor = weightedCategoryFactor > 0 ? weightedCategoryFactor : 1;
    const base = this.baseFee(input, profile) * complexity.factor * categoryFactor;

    const stageFactor = profile.stages.reduce((sum, stage) => {
      const selected = input.selectedStages[stage.id] ?? { applicable: true, reductionPercentage: 0 };
      return sum + (selected.applicable ? stage.defaultWeight * (1 - selected.reductionPercentage) : 0);
    }, 0);
    const stageAdjusted = roundMoney(base * stageFactor);

    let beforeDiscount = stageAdjusted;
    const warnings: string[] = [];
    if (input.professionalOverride) {
      if (!input.professionalOverride.reason.trim()) throw new Error('Professional override reason is required');
      warnings.push('Professional override applied; guideline fee remains visible in snapshot.');
      beforeDiscount = input.professionalOverride.amount;
    }

    const discountPercentage = input.discount?.percentage ?? 0;
    if (discountPercentage > 0 && !input.discount?.reason.trim()) throw new Error('Discount reason is required');

    const disbursementsTotal = roundMoney((input.disbursements ?? []).reduce((s, x) => s + x.amount, 0));
    const statutoryFeesTotal = roundMoney((input.statutoryFees ?? []).reduce((s, x) => s + x.amount, 0));

    const discountBase = beforeDiscount
      + (input.discount?.appliesToDisbursements ? disbursementsTotal : 0)
      + (input.discount?.appliesToStatutoryFees ? statutoryFeesTotal : 0);
    const discountAmount = roundMoney(discountBase * discountPercentage);
    const professionalFeeAfterDiscount = roundMoney(beforeDiscount - roundMoney(beforeDiscount * discountPercentage));

    const taxableSubtotal = professionalFeeAfterDiscount + disbursementsTotal;
    const vatAmount = input.vatApplicable ? roundMoney(taxableSubtotal * 0.15) : 0;
    const totalInclVat = roundMoney(professionalFeeAfterDiscount + disbursementsTotal + statutoryFeesTotal + vatAmount);

    const lines: FeeLine[] = [
      { label: 'Guideline professional fee', amount: roundMoney(base), taxable: true, discountable: false, note: profile.source.id },
      { label: 'Stage-adjusted professional fee', amount: stageAdjusted, taxable: true, discountable: true },
      { label: 'Professional fee after discount', amount: professionalFeeAfterDiscount, taxable: true, discountable: false },
      { label: 'Disbursements / reimbursables', amount: disbursementsTotal, taxable: true, discountable: !!input.discount?.appliesToDisbursements },
      { label: 'Statutory / municipal fees', amount: statutoryFeesTotal, taxable: false, discountable: !!input.discount?.appliesToStatutoryFees },
      { label: 'VAT', amount: vatAmount, taxable: false, discountable: false },
    ];

    return {
      profession: input.profession,
      sourceVersionId: profile.source.id,
      formulaType: profile.preferredFormula,
      guidelineProfessionalFee: roundMoney(base),
      stageAdjustedFee: stageAdjusted,
      professionalFeeBeforeDiscount: roundMoney(beforeDiscount),
      discountAmount,
      professionalFeeAfterDiscount,
      disbursementsTotal,
      statutoryFeesTotal,
      vatAmount,
      totalInclVat,
      lines,
      warnings,
    };
  }

  private baseFee(input: FeeInput, profile: ProfessionProfile): number {
    switch (profile.preferredFormula) {
      case 'slidingScale':
        return slidingScale(input.projectValue);
      case 'percentageOfCost':
        return input.projectValue * percentageForValue(input.projectValue) * disciplineFactor(profile.profession);
      case 'timeBased':
        return (input.hourlyLines ?? []).reduce((s, l) => s + l.hours * l.rate, 0);
      case 'areaUnit':
        return Math.max(
          input.projectValue * 0.018,
          (input.unitLines ?? []).reduce((s, l) => s + l.quantity * l.unitRate * (l.factor ?? 1), 0),
        );
      case 'hybrid':
        return (input.projectValue * percentageForValue(input.projectValue) * disciplineFactor(profile.profession))
          + (input.hourlyLines ?? []).reduce((s, l) => s + l.hours * l.rate, 0)
          + (input.unitLines ?? []).reduce((s, l) => s + l.quantity * l.unitRate * (l.factor ?? 1), 0);
      case 'stageApportioned':
        return input.projectValue * 0.05;
    }
  }
}

function validate(input: FeeInput, profile: ProfessionProfile): void {
  if (input.projectValue < 0) throw new Error('Project value cannot be negative');
  const splitTotal = Object.values(input.workCategorySplits).reduce((s, v) => s + v, 0);
  if (Math.abs(splitTotal - 1) > 0.001) throw new Error(`Work category split must total 100%; got ${(splitTotal * 100).toFixed(1)}%`);
  const stageTotal = profile.stages.reduce((s, stage) => s + stage.defaultWeight, 0);
  if (Math.abs(stageTotal - 1) > 0.05) throw new Error(`Stage weights for ${profile.profession} do not total approximately 100%`);
}

function slidingScale(value: number): number {
  if (value <= 500000) return Math.max(35000, value * 0.095);
  if (value <= 2500000) return 47500 + (value - 500000) * 0.075;
  if (value <= 10000000) return 197500 + (value - 2500000) * 0.055;
  if (value <= 50000000) return 610000 + (value - 10000000) * 0.035;
  return 2010000 + (value - 50000000) * 0.022;
}

function percentageForValue(value: number): number {
  return value < 2000000 ? 0.075 : value < 10000000 ? 0.055 : value < 50000000 ? 0.038 : 0.025;
}

function disciplineFactor(profession: string): number {
  const factors: Record<string, number> = {
    structuralEngineer: 0.32,
    civilEngineer: 0.28,
    electricalEngineer: 0.22,
    mechanicalEngineer: 0.24,
    fireEngineer: 0.18,
    landscapeArchitect: 0.55,
    constructionProjectManager: 0.5,
    townPlanner: 0.25,
    interiorDesigner: 0.6,
  };
  return factors[profession] ?? 1;
}
