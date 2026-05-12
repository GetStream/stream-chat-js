import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';
import { parse } from 'yaml';

const options = {
  spec: {
    type: 'string',
    short: 's',
  },
  out: {
    type: 'string',
    short: 'o',
  },
} satisfies ParseArgsOptionsConfig;

type OpenAPISpecification = {
  components: {
    schemas: {
      [key: string]: {
        properties?: Partial<
          Record<
            'filter_conditions' | string,
            Partial<
              Record<
                'x-stream-filter-fields' | string,
                Record<
                  string,
                  {
                    operators: string[];
                    type: string;
                  }
                >
              >
            >
          >
        >;
      };
    };
  };
};

const { values } = parseArgs({
  args: process.argv,
  options,
  allowPositionals: true,
  tokens: false,
});

const specPath = values.spec;
const outputPath = values.out;

if (!specPath || !outputPath) {
  console.error(
    'Usage: node generate-filter-types.mts -s <path-to-openapi-specification> -o <output-file>',
  );
  process.exit(1);
}

const spec = parse(readFileSync(specPath, 'utf8')) as OpenAPISpecification;
const schemas = spec.components?.schemas;

if (!schemas) {
  console.error('No components.schemas found in the specification');
  process.exit(1);
}

const lines = [];

const typeMapping = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  date: 'Date',
};

for (const [schemaName, schema] of Object.entries(schemas)) {
  const filterFields = schema?.properties?.filter_conditions?.['x-stream-filter-fields'];
  if (!filterFields) continue;

  const typeName = `${schemaName}FilterConditions`;

  const fieldEntries = Object.entries(filterFields).map(
    ([fieldName, fieldDefinition]) => {
      const operators = fieldDefinition.operators.length
        ? fieldDefinition.operators.map((operator) => `"${operator}"`).join(' | ')
        : 'never';
      return `  "${fieldName}": { type: ${typeMapping[fieldDefinition.type as keyof typeof typeMapping] ?? `"${fieldDefinition.type}"`}; operators: ${operators} };`;
    },
  );

  lines.push(`export type ${typeName} = {`);
  lines.push(...fieldEntries);
  lines.push(`};\n`);
}

if (lines.length > 0) {
  writeFileSync(outputPath, '\n' + lines.join('\n') + '\n');
  console.log(`Appended ${lines.length} lines to ${outputPath}`);
} else {
  console.log('No filter types found');
}
