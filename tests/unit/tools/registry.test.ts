import { describe, expect, it } from 'vitest';
import { toAnthropicTools, toolRegistry } from '../../../src/tools/registry.js';

describe('tool registry contract', () => {
  it('has no duplicate tool names', () => {
    const names = toolRegistry.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every tool a non-empty description, a zod schema, and a handler function', () => {
    for (const tool of toolRegistry) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.zodSchema).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    }
  });

  it('gives every tool an object-typed JSON input schema listing its required fields', () => {
    for (const tool of toolRegistry) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it('every tool is namespaced with a known system prefix', () => {
    const knownPrefixes = ['crm_', 'usage_', 'location_', 'finance_', 'workforce_', 'marketing_', 'respond_'];
    for (const tool of toolRegistry) {
      expect(knownPrefixes.some((prefix) => tool.name.startsWith(prefix))).toBe(true);
    }
  });

  it('converts cleanly to the Anthropic tools wire format with name/description/input_schema only', () => {
    const anthropicTools = toAnthropicTools();
    expect(anthropicTools).toHaveLength(toolRegistry.length);
    for (const tool of anthropicTools) {
      expect(Object.keys(tool).sort()).toEqual(['description', 'input_schema', 'name']);
    }
  });
});
