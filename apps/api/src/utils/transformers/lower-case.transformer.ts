import type { TransformFnParams } from 'class-transformer/types/interfaces';

export function lowerCaseTransformer({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.toLowerCase().trim() : value;
}
