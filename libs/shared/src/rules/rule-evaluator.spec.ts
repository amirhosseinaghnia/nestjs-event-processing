import { evaluateRule, findMatchingRules } from './rule-evaluator';

describe('evaluateRule', () => {
  const base = { eventName: 'temperature', threshold: 80 };

  it.each([
    ['>', 81, true],
    ['>', 80, false],
    ['<', 79, true],
    ['<', 80, false],
    ['=', 80, true],
    ['=', 80.1, false],
    ['<=', 80, true],
    ['<=', 81, false],
    ['>=', 80, true],
    ['>=', 79, false],
  ] as const)(
    'operator %s with value %s => %s',
    (operator, value, expected) => {
      expect(evaluateRule('temperature', value, { ...base, operator })).toBe(
        expected,
      );
    },
  );

  it('returns false when event name does not match', () => {
    expect(evaluateRule('speed', 100, { ...base, operator: '>' })).toBe(false);
  });
});

describe('findMatchingRules', () => {
  it('returns all matching rules for one event', () => {
    const rules = [
      {
        id: '1',
        eventName: 'temperature',
        operator: '>' as const,
        threshold: 80,
      },
      {
        id: '2',
        eventName: 'temperature',
        operator: '>=' as const,
        threshold: 85,
      },
      { id: '3', eventName: 'speed', operator: '>' as const, threshold: 10 },
    ];

    const matches = findMatchingRules('temperature', 85, rules);
    expect(matches.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('returns empty when no rules match', () => {
    expect(
      findMatchingRules('temperature', 10, [
        { eventName: 'temperature', operator: '>', threshold: 80 },
      ]),
    ).toEqual([]);
  });
});
