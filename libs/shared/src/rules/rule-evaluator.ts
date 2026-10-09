import { ComparisonOperator } from './operators';

export interface EvaluableRule {
  eventName: string;
  operator: ComparisonOperator;
  threshold: number;
}

/**
 * Pure rule evaluator — no NestJS / DB dependencies.
 * Uses exact numeric comparison (documented assumption for `=`).
 */
export function evaluateRule(
  eventName: string,
  eventValue: number,
  rule: EvaluableRule,
): boolean {
  if (eventName !== rule.eventName) {
    return false;
  }

  switch (rule.operator) {
    case '<':
      return eventValue < rule.threshold;
    case '>':
      return eventValue > rule.threshold;
    case '=':
      return eventValue === rule.threshold;
    case '<=':
      return eventValue <= rule.threshold;
    case '>=':
      return eventValue >= rule.threshold;
    default: {
      const _exhaustive: never = rule.operator;
      throw new Error(`Unsupported operator: ${String(_exhaustive)}`);
    }
  }
}

export function findMatchingRules<T extends EvaluableRule>(
  eventName: string,
  eventValue: number,
  rules: T[],
): T[] {
  return rules.filter((rule) => evaluateRule(eventName, eventValue, rule));
}
