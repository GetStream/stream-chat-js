import { describe, expect, it, beforeEach } from 'vitest';
import {
  FilterBuilder,
  FilterGenerator,
  ExtendedQueryFilter,
  ExtendedQueryFilters,
} from '../../../src/pagination/FilterBuilder';

type BasicFilterFieldsSchema = {
  name: ExtendedQueryFilter<string>;
  age: ExtendedQueryFilter<number>;
  tags: ExtendedQueryFilter<string[]>;
};

type SearchContext = {
  searchQuery?: string;
};

type BasicFilterBuilderContext = SearchContext & {
  isAdmin: boolean;
  region?: string;
};

describe('FilterBuilder', () => {
  let initialContext: BasicFilterBuilderContext;
  let initialFilterConfig: FilterGenerator<
    BasicFilterFieldsSchema,
    BasicFilterBuilderContext
  >;
  let fb: FilterBuilder<BasicFilterFieldsSchema, BasicFilterBuilderContext>;

  beforeEach(() => {
    initialContext = { isAdmin: false, region: 'us' };

    initialFilterConfig = {
      name: {
        enabled: true,
        generate: ({ searchQuery }) =>
          searchQuery
            ? {
                name: { $autocomplete: searchQuery },
              }
            : null,
      },
      age: {
        enabled: false,
        generate: (ctx) => ({
          age: ctx.isAdmin ? { $gt: 18 } : {},
        }),
      },
      tags: {
        enabled: true,
        generate: ({ searchQuery }) =>
          searchQuery
            ? {
                tags: { $contains: searchQuery },
              }
            : null,
      },
    };

    fb = new FilterBuilder<BasicFilterFieldsSchema, BasicFilterBuilderContext>({
      initialContext,
      initialFilterConfig,
    });
  });

  it('initializes without context or filterConfig', () => {
    fb = new FilterBuilder<BasicFilterFieldsSchema, BasicFilterBuilderContext>();
    expect(fb.context.getLatestValue()).toEqual({});
    expect(fb.filterConfig.getLatestValue()).toEqual({});
  });

  it('initializes with correct context and filterConfig', () => {
    expect(fb.context.getLatestValue()).toEqual(initialContext);
    expect(fb.filterConfig.getLatestValue()).toEqual(initialFilterConfig);
  });

  it('updates context partially', () => {
    fb.updateContext({ isAdmin: true });
    expect(fb.context.getLatestValue().isAdmin).toBe(true);
    expect(fb.context.getLatestValue().region).toBe('us');
  });

  it('updates filterConfig partially', () => {
    fb.updateFilterConfig({
      age: {
        enabled: true,
        generate: () => ({ age: { $gte: 21 } }),
      },
    });
    expect(fb.filterConfig.getLatestValue().age?.enabled).toBe(true);
  });

  it('enables a filter correctly', () => {
    fb.enableFilter('age');
    expect(fb.filterConfig.getLatestValue().age?.enabled).toBe(true);
  });

  it('disables a filter correctly', () => {
    fb.disableFilter('tags');
    expect(fb.filterConfig.getLatestValue().tags?.enabled).toBe(false);
  });

  it('does not throw when enabling or disabling unknown filter keys', () => {
    expect(() => fb.enableFilter('nonexistent')).not.toThrow();
    expect(() => fb.disableFilter('nonexistent')).not.toThrow();
  });

  it('buildFilters respects enabled filters and merges baseFilters', () => {
    // initial: name (enabled), age (disabled), tags (enabled)
    const baseFilters: Partial<BasicFilterFieldsSchema> = {
      age: { $lt: 100 },
    };
    const result = fb.buildFilters({
      baseFilters,
      context: { searchQuery: 'searchTerm' },
    });

    // 'age' filter is disabled, so $gt: 18 from age generator should not be applied
    // 'name' and 'tags' enabled filters should be applied with $autocomplete and $contains respectively
    expect(result).toEqual({
      ...baseFilters,
      name: { $autocomplete: 'searchTerm' },
      tags: { $contains: 'searchTerm' },
    });
  });

  it('buildFilters applies dynamic context changes', () => {
    fb.updateContext({ isAdmin: true });
    fb.enableFilter('age');
    const result = fb.buildFilters({ context: { searchQuery: 'query' } });

    // age generator should apply $gt: 18 because isAdmin = true
    expect(result).toEqual({
      age: { $gt: 18 },
      name: { $autocomplete: 'query' },
      tags: { $contains: 'query' },
    });
  });

  it('buildFilters with no baseFilters returns only generated filters', () => {
    const result = fb.buildFilters({ context: { searchQuery: 'test' } });
    expect(result).toEqual({
      name: { $autocomplete: 'test' },
      tags: { $contains: 'test' },
    });
  });

  it('buildFilters returns empty object if no filters enabled', () => {
    fb.disableFilter('name');
    fb.disableFilter('tags');
    fb.disableFilter('age');
    const result = fb.buildFilters({ context: { searchQuery: 'test' } });
    expect(result).toEqual({});
  });

  it('buildFilters ignores enabled fields which generators return null', () => {
    fb.updateContext({ isAdmin: true });
    fb.enableFilter('age');
    const result = fb.buildFilters({ context: { searchQuery: '' } });
    expect(result).toEqual({ age: { $gt: 18 } });
  });

  describe('complex nested filters', () => {
    type ComplexFilterFieldsSchema = ExtendedQueryFilters<{
      loadingPlaces_countryCodes: string;
      loadingPlaces_cities: string;
      loadingPlaces_postcodes: string;
      startAddress_countryCode: string;
      startAddress_city: string;
      startAddress_postcode: string;
      destinationAddresses_countryCodes: string;
      destinationAddresses_cities: string;
      destinationAddresses_postcodes: string;
      name: string;
      'member.user.name': string;
      last_message_at: Date;
      members: string;
      type: string;
    }>;

    const filterConfig: FilterGenerator<ComplexFilterFieldsSchema, SearchContext> = {
      group1: {
        enabled: true,
        generate: ({ searchQuery }) =>
          searchQuery
            ? {
                $or: [
                  {
                    $and: [
                      {
                        loadingPlaces_countryCodes: { $in: [searchQuery] },
                      },
                      {
                        loadingPlaces_cities: { $autocomplete: searchQuery },
                      },
                    ],
                  },
                  {
                    $and: [
                      {
                        startAddress_countryCode: { $contains: searchQuery },
                      },
                      {
                        startAddress_postcode: { $autocomplete: searchQuery },
                      },
                    ],
                  },
                ],
              }
            : null,
      },
    };

    const baseFilters = {
      last_message_at: { $exists: true },
      members: { $in: ['11506758'] },
      type: { $eq: 'messaging' },
    };

    const searchQueryString = 'searchTerm';
    const buildTimeContext: SearchContext = { searchQuery: searchQueryString };

    const expectedDynamicFilter = {
      $or: [
        {
          $and: [
            {
              loadingPlaces_countryCodes: { $in: [searchQueryString] },
            },
            {
              loadingPlaces_cities: { $autocomplete: searchQueryString },
            },
          ],
        },
        {
          $and: [
            {
              startAddress_countryCode: { $contains: searchQueryString },
            },
            {
              startAddress_postcode: { $autocomplete: searchQueryString },
            },
          ],
        },
      ],
    };

    it('generates filters with initialFilterConfig', () => {
      const fb = new FilterBuilder<ComplexFilterFieldsSchema, {}>({
        initialFilterConfig: filterConfig,
      });

      const filters = fb.buildFilters({ baseFilters, context: buildTimeContext });

      expect(filters).toEqual({
        ...baseFilters,
        ...expectedDynamicFilter,
      });
    });

    it('updates config to add nested $and clauses', () => {
      const fb = new FilterBuilder<ComplexFilterFieldsSchema, {}>({
        initialContext: {},
        initialFilterConfig: {},
      });

      fb.updateFilterConfig(filterConfig);

      const filters = fb.buildFilters({ context: buildTimeContext });

      expect(filters).toEqual(expectedDynamicFilter);
    });

    it('disables and enables complex filter', () => {
      const fb = new FilterBuilder<ComplexFilterFieldsSchema, {}>({
        initialContext: {},
        initialFilterConfig: filterConfig,
      });

      fb.disableFilter('group1');

      expect(fb.buildFilters({ context: buildTimeContext })).toEqual({});

      fb.enableFilter('group1');

      expect(fb.buildFilters({ context: buildTimeContext })).toEqual(
        expectedDynamicFilter,
      );
    });
  });
});
