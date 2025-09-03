export type PathResolver<DataSource> = (item: DataSource, field: string) => unknown;
export type Comparator<T> = (left: T, right: T) => number;

export type FieldToDataResolver<DataSource> = {
  matchesField: (field: string) => boolean;
  resolve: PathResolver<DataSource>;
};
