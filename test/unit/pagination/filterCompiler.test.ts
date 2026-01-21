import { describe, expect, it } from 'vitest';
import {
  ChannelData,
  ChannelMemberResponse,
  ChannelResponse,
  ContainsOperator,
  PrimitiveFilter,
  QueryFilter,
  QueryFilters,
  RequireOnlyOne,
} from '../../../src';
import {
  itemMatchesFilter,
  ItemMatchesFilterOptions,
} from '../../../src/pagination/filterCompiler';
import { resolveDotPathValue } from '../../../src/pagination/utility.normalization';

type CustomChannelData = {
  custom1?: string[];
  custom2?: string;
  custom3?: number;
  custom4?: boolean;
  custom5?: string;
  data?: {
    members: ChannelMemberResponse[];
  };
  name?: string;
};
type CustomChannelFilters = QueryFilters<
  ContainsOperator<Omit<CustomChannelData, 'name'>> & {
    archived?: boolean;
    'member.user.name'?:
      | RequireOnlyOne<{
          $autocomplete?: string;
          $eq?: string;
        }>
      | string;

    members?:
      | RequireOnlyOne<Pick<QueryFilter<string>, '$in'>>
      | RequireOnlyOne<Pick<QueryFilter<string[]>, '$eq'>>
      | PrimitiveFilter<string[]>;
    name?:
      | RequireOnlyOne<
          {
            $autocomplete?: string;
          } & QueryFilter<string>
        >
      | PrimitiveFilter<string>;
    pinned?: boolean;
  } & {
    [Key in keyof Omit<ChannelResponse, 'name' | 'members' | keyof CustomChannelData>]:
      | RequireOnlyOne<QueryFilter<ChannelResponse[Key]>>
      | PrimitiveFilter<ChannelResponse[Key]>;
  }
>;

type TestChannel = ChannelData & CustomChannelData;

const filter: CustomChannelFilters = {
  $or: [
    {
      $and: [
        { custom1: { $contains: 'a' } },
        { custom2: { $eq: '5' } },
        { custom3: { $lt: 10 } },
        { custom4: { $eq: true } },
      ],
    },
    {
      $and: [
        { custom1: { $contains: 'b' } },
        { custom2: { $eq: '15' } },
        { custom3: { $lt: 10 } },
        { custom4: { $eq: false } },
      ],
    },
    {
      $or: [
        { name: { $autocomplete: 'ith' } },
        { name: { $autocomplete: 'Sm' } },
        { 'member.user.name': { $autocomplete: 'ack' } },
        { blocked: true },
        { custom2: { $eq: '5' } },
        { custom2: { $lt: '2020-08-26T11:09:07.814Z' } },
        { custom2: { $gt: '2022-08-26T11:09:07.814Z' } },
        { custom3: { $gt: 10 } },
        { custom4: { $exists: true } },
        { custom1: { $contains: 'b' } },
        { custom5: { $in: ['Rob', 'Bob'] } },
      ],
    },
  ],
};

const options: ItemMatchesFilterOptions<object> = {
  resolvers: [
    {
      matchesField: () => true,
      resolve: (item, path) => resolveDotPathValue(item, path),
    },
  ],
};

describe('itemMatchesFilter', () => {
  it('determines that data do not match the filter', () => {
    const item: TestChannel = {};
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeFalsy();
  });

  it('determines that data match a primitive filter', () => {
    const item: TestChannel = { blocked: true };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeTruthy();
  });

  it('determines that data do not match a primitive filter', () => {
    const item: TestChannel = { blocked: undefined };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeFalsy();
  });

  it('determines that data match the $eq filter', () => {
    const item: TestChannel = { custom2: '5' };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeTruthy();
  });

  it('determines that data do not match the $eq filter', () => {
    const item: TestChannel = { custom2: '55' };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeTruthy();
  });

  it('determines that data match the $ne filter', () => {
    const item: TestChannel = {};
    expect(
      itemMatchesFilter<TestChannel>(item, { name: { $ne: 'Channel Bob' } }, options),
    ).toBeTruthy();
  });

  it('determines that data do not match the $ne filter', () => {
    const item: TestChannel = { name: 'Channel Bob' };
    expect(
      itemMatchesFilter<TestChannel>(item, { name: { $ne: 'Channel Bob' } }, options),
    ).toBeFalsy();
  });

  it('determines that data match the number comparison filter', () => {
    const item: TestChannel = { custom3: 11 };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeTruthy();
  });

  it('determines that data do not match the number comparison filter', () => {
    const item: TestChannel = { custom3: 10 };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeFalsy();
  });

  it('determines that data match the date comparison filter', () => {
    const item: TestChannel = { custom2: '2020-08-26T11:09:07.714Z' };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeTruthy();
  });

  it('determines that data do not match the date comparison filter', () => {
    const item: TestChannel = { custom2: '2021-08-26T11:09:07.714Z' };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeFalsy();
  });

  it('determines that data match the $exists filter', () => {
    // @ts-expect-error custom4 does not match the TestChannel definition
    const item: TestChannel = { custom4: ['a', '5'] };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeTruthy();
  });

  it('determines that data do not match the $exists filter', () => {
    // @ts-expect-error custom3 does not match the TestChannel definition
    const item: TestChannel = { custom3: ['a', 5] };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeFalsy();
  });

  it('determines that data match the $autocomplete filter', () => {
    const item: TestChannel = { name: 'Smith' };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeTruthy();
  });

  it('determines that data do not match the $autocomplete filter', () => {
    const item: TestChannel = { name: 'it' };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeFalsy();
  });

  it('determines that data match the $contains filter', () => {
    const item: TestChannel = { custom1: ['a', 'b', 'c'] };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeTruthy();
  });

  it('determines that data do not match the $contains filter', () => {
    const item: TestChannel = { custom1: ['a', 'bb', 'c'] };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeFalsy();
  });

  it('determines that data match the $in filter', () => {
    const item: TestChannel = { custom5: 'Rob' };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeTruthy();
  });

  it('determines that data do not match the $in filter', () => {
    const item: TestChannel = { custom5: 'Ro' };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeFalsy();
  });

  it('determines that data match the $nin filter', () => {
    const item: TestChannel = { custom5: 'Ro' };
    expect(
      itemMatchesFilter<TestChannel>(
        item,
        { custom5: { $nin: ['Rob', 'Bob'] } },
        options,
      ),
    ).toBeTruthy();
  });

  it('determines that data do not match the $nin filter', () => {
    const item: TestChannel = { custom5: 'Rob' };
    expect(
      itemMatchesFilter<TestChannel>(
        item,
        { custom5: { $nin: ['Rob', 'Bob'] } },
        options,
      ),
    ).toBeFalsy();
  });

  it('determines that data match the $and filter', () => {
    const item: TestChannel = {
      custom1: ['x', 'b', 'y'],
      custom2: '15',
      custom3: 9,
      custom4: false,
    };
    expect(itemMatchesFilter<TestChannel>(item, filter, options)).toBeTruthy();
  });

  it('determines that data do not match the $and filter', () => {
    const item: TestChannel = {
      custom1: ['x', 'b', 'y'],
      custom2: '15',
      custom3: 10,
      custom4: false,
    };
    const andFilters = filter.$or!.slice(0, 2);
    // @ts-ignore
    expect(
      itemMatchesFilter<TestChannel>(item, { $or: andFilters }, options),
    ).toBeFalsy();
  });

  it('determines that data match the $nor filter', () => {
    const item: TestChannel = {
      custom1: ['x', 'y'],
      // @ts-expect-error custom2 does not match the TestChannel definition
      custom2: { a: 'b' },
      // @ts-expect-error custom3 does not match the TestChannel definition
      custom3: true,
      custom4: false,
    };
    expect(
      itemMatchesFilter<TestChannel>(item, { $nor: filter.$or }, options),
    ).toBeTruthy();
  });

  it('determines that data do not match the $nor filter', () => {
    // matches the 2nd $and
    const item: TestChannel = {
      custom1: ['x', 'b', 'y'],
      custom2: '15',
      custom3: 9,
      custom4: false,
    };
    expect(
      itemMatchesFilter<TestChannel>(item, { $nor: filter.$or }, options),
    ).toBeFalsy();
  });

  it('determines that data match filter by property dot path', () => {
    const item: TestChannel = {
      data: {
        members: [
          { user: { id: '1', name: 'Jack' } },
          { user: { id: '2', name: 'Bob' } },
          { user: { id: '3', name: 'Mark' } },
        ],
      },
    };

    expect(
      itemMatchesFilter<TestChannel>(
        item,
        { 'member.user.name': { $autocomplete: 'rk' } },
        {
          resolvers: [
            {
              matchesField: (field) => field === 'member.user.name',
              resolve: (item) => {
                return item.data?.members.map(({ user }) => user?.name) ?? [];
              },
            },
          ],
        },
      ),
    ).toBeTruthy();
  });

  it('determines that data match filter by $eq: array', () => {
    const item: TestChannel = {
      data: {
        members: [
          { user: { id: '123', name: 'Jack' } },
          { user: { id: '234', name: 'Bob' } },
          { user: { id: '345', name: 'Mark' } },
        ],
      },
    };

    // has to match all the ids
    expect(
      itemMatchesFilter<TestChannel>(
        item,
        { members: { $eq: ['345', '123', '234'] } },
        {
          resolvers: [
            {
              matchesField: (field) => field === 'members',
              resolve: (item) => {
                return item.data?.members.map(({ user }) => user?.id) ?? [];
              },
            },
          ],
        },
      ),
    ).toBeTruthy();
  });

  it('determines that data do not match filter by $eq: array', () => {
    const item: TestChannel = {
      data: {
        members: [
          { user: { id: '123', name: 'Jack' } },
          { user: { id: '234', name: 'Bob' } },
          { user: { id: '345', name: 'Mark' } },
        ],
      },
    };

    // one id is missing
    expect(
      itemMatchesFilter<TestChannel>(
        item,
        { members: { $eq: ['123', '234'] } },
        {
          resolvers: [
            {
              matchesField: (field) => field === 'members',
              resolve: (item) => {
                return item.data?.members.map(({ user }) => user?.id) ?? [];
              },
            },
          ],
        },
      ),
    ).toBeFalsy();
  });
});
