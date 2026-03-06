The Stream Chat API allows you to specify filters and ordering for several endpoints. You can query channels, users, and messages. The query syntax is similar to that of Mongoose.

> [!WARNING]
> We do not run MongoDB on the backend. Only a subset of the MongoDB operations are supported.


Please have a look below at the complete list of supported query operations:

| Name      | Description                                                                             | Example                                                                    |
| --------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| $eq       | Matches values that are equal to a specified value.                                     | { "key": { "$eq": "value" }} or the simplest form { "key": "value"}        |
| $q        | Full text search (matches values where the whole text value matches the specified value | { "key": { "$q": "value }}                                                 |
| $gt       | Matches values that are greater than a specified value.                                 | { "key": { "$gt": 4 }}                                                     |
| $gte      | Matches values that are greater than or equal to a specified value.                     | { "key": { "$gte": 4 }}                                                    |
| $lt       | Matches values that are less than a specified value.                                    | { "key": { "$lt": 4 }}                                                     |
| $lte      | Matches values that are less than or equal to a specified value.                        | { "key": { "$lte": 4 }}                                                    |
| $in       | Matches any of the values specified in an array.                                        | { "key": { "$in": [ 1, 2, 4 ] }}                                           |
| $and      | Matches all the values specified in an array.                                           | { "$and": [ { "key": { "$in": [ 1, 2, 4 ] } }, { "some_other_key": 10 } ]} |
| $or       | Matches at least one of the values specified in an array.                               | { "$or": [ { "key": { "$in": [ 1, 2, 4 ] } }, { "key2": 10 } ]}            |
| $contains | Matches array elements on a column that contains an array                               | { key: { $contains: 'value' } }                                            |
