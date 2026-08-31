type Decoder = (i: any) => any;

type TypeMapping = Record<string, { type: string; isSingle: boolean }>;

export const decoders: Record<string, Decoder> = {};

const decodeDatetimeType = (input: number | string) =>
  typeof input === 'number' ? new Date(Math.floor(input / 1000000)) : new Date(input);

decoders.DatetimeType = decodeDatetimeType;

const decode = (typeMappings: TypeMapping, input?: Record<string, any>) => {
  if (!input || Object.keys(typeMappings).length === 0) return input;

  Object.keys(typeMappings).forEach((key) => {
    if (input[key] != null) {
      if (typeMappings[key]) {
        const decoder = decoders[typeMappings[key].type];
        if (decoder) {
          if (typeMappings[key].isSingle) {
            input[key] = decoder(input[key]);
          } else {
            Object.keys(input[key]).forEach((k) => {
              input[key][k] = decoder(input[key][k]);
            });
          }
        }
      }
    }
  });

  return input;
};
