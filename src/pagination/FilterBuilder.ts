import { StateStore } from '../store';
import type { ArrayOneOrMore, ArrayTwoOrMore, QueryFilter } from '../types';

type ElementType<T> = T extends (infer U)[] ? U : T;

// redeclared because QueryFilter does not account for the additional operators
export type ExtendedQueryFilter<T = string> = QueryFilter<T> & {
  $autocomplete?: T extends string ? string : never;
  $contains?: ElementType<T>;
  $in?: ElementType<T>[];
  $q?: T extends string ? string : never;
};

export type ExtendedQueryLogicalOperators<T> = {
  $and?: ArrayOneOrMore<ExtendedQueryFilters<T>>;
  $nor?: ArrayOneOrMore<ExtendedQueryFilters<T>>;
  $or?: ArrayTwoOrMore<ExtendedQueryFilters<T>>;
};

export type ExtendedQueryFilters<T> = {
  [K in keyof T]?: ExtendedQueryFilter<T[K]>;
} & ExtendedQueryLogicalOperators<T>;

export type FilterBuilderGenerators<
  TFilters,
  TContext extends Record<string, unknown> = {},
> = {
  [K in string]: {
    enabled: boolean;
    generate: (context: TContext) => Partial<TFilters> | null;
  };
};

export type FilterBuilderOptions<TFilters, TContext extends Record<string, unknown>> = {
  initialFilterConfig?: FilterBuilderGenerators<TFilters, TContext>;
  initialContext?: TContext;
};

export class FilterBuilder<TFilters, TContext extends Record<string, unknown> = {}> {
  filterConfig: StateStore<FilterBuilderGenerators<TFilters, TContext>>;
  context: StateStore<TContext>;

  constructor(params?: FilterBuilderOptions<TFilters, TContext>) {
    this.context = new StateStore(params?.initialContext ?? ({} as TContext));
    this.filterConfig = new StateStore(
      params?.initialFilterConfig ?? ({} as FilterBuilderGenerators<TFilters, TContext>),
    );
  }

  updateFilterConfig(config: Partial<FilterBuilderGenerators<TFilters, TContext>>) {
    this.filterConfig.partialNext(config);
  }

  enableFilter(filterKey: keyof FilterBuilderGenerators<TFilters, TContext>) {
    const config = this.filterConfig.getLatestValue();
    if (config[filterKey]) {
      this.filterConfig.partialNext({
        [filterKey]: {
          ...config[filterKey],
          enabled: true,
        },
      });
    }
  }

  disableFilter(filterKey: keyof FilterBuilderGenerators<TFilters, TContext>) {
    const config = this.filterConfig.getLatestValue();
    if (config[filterKey]) {
      this.filterConfig.partialNext({
        [filterKey]: {
          ...config[filterKey],
          enabled: false,
        },
      });
    }
  }

  updateContext(newContext: Partial<TContext>) {
    this.context.partialNext(newContext);
  }

  buildFilters(params?: {
    context?: Partial<TContext>;
    baseFilters?: Partial<TFilters>;
  }): Partial<TFilters> {
    const filters: Partial<TFilters> = {
      ...(params?.baseFilters ?? {}),
    } as Partial<TFilters>;

    const filterConfig = this.filterConfig.getLatestValue();
    for (const key in filterConfig) {
      const configItem = filterConfig[key];
      if (!configItem?.enabled) continue;

      const generated = configItem.generate({
        ...this.context.getLatestValue(),
        ...(params?.context ?? {}),
      });
      if (generated) Object.assign(filters, generated);
    }

    return filters;
  }
}
