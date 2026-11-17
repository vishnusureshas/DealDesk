export const integerValidator = {
  validator: (value: unknown): boolean =>
    value === null || value === undefined || Number.isInteger(value),
  message: 'Value must be an integer',
};
