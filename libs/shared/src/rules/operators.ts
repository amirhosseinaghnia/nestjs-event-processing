export const COMPARISON_OPERATORS = ['<', '>', '=', '<=', '>='] as const;

export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];
