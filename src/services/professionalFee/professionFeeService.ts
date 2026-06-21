import { FeeCalculatorEngine } from './feeEngine';
import { ProfessionProfileRegistry } from './profiles';
import type { FeeInput, Profession } from './types';

export class ProfessionFeeService {
  constructor(
    private readonly profiles: ProfessionProfileRegistry,
    private readonly engine: FeeCalculatorEngine,
  ) {}

  calculate(input: FeeInput) {
    return this.engine.calculate(input, this.profiles.get(input.profession));
  }

  getUiModel(profession: Profession) {
    const p = this.profiles.get(profession);
    return {
      profession: p.profession,
      displayName: p.displayName,
      councilOrBody: p.councilOrBody,
      uiStyle: p.uiStyle,
      stageNames: p.stages.map((s) => s.name),
      categoryLabels: p.workCategories.map((c) => c.label),
      terms: p.defaultTermsTemplateIds,
      source: p.source,
    };
  }
}
