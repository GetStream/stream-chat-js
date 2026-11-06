export type PathResolver<DataSource> = (item: DataSource, field: string) => unknown;

export enum ComparisonResult {
  A_PRECEDES_B = -1,
  A_IS_EQUAL_TO_B = 0,
  A_COMES_AFTER_B = 1,
}

export type Comparator<T> = (left: T, right: T) => ComparisonResult;

export type FieldToDataResolver<DataSource> = {
  matchesField: (field: string) => boolean;
  resolve: PathResolver<DataSource>;
};
