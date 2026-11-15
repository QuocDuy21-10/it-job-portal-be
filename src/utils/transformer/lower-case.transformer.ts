import { TransformFnParams } from 'class-transformer/types/interfaces';
import { MaybeType } from '../types/maybe.type';

// Non-strings pass through untouched so @IsString rejects them instead of this throwing a 500.
export const lowerCaseTransformer = (params: TransformFnParams): MaybeType<string> =>
  typeof params.value === 'string' ? params.value.toLowerCase().trim() : params.value;
