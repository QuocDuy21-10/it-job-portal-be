import { ValidationError, ValidationPipe } from '@nestjs/common';

type Template = (subject: string, ...args: string[]) => string;

// class-validator 0.14 default messages ("$property ...") for the decorators this API uses, after the
// optional "each value in " prefix. Custom `message:` strings never match and pass through unchanged.
const DEFAULT_MESSAGES: Array<[RegExp, Template]> = [
  [/^must be a string$/, s => `${s} phải là chuỗi`],
  [/^should not be empty$/, s => `${s} không được để trống`],
  [/^should not be null or undefined$/, s => `${s} không được để trống`],
  [
    /^must be longer than or equal to (\S+) and shorter than or equal to (\S+) characters$/,
    (s, min, max) => `${s} phải có từ ${min} đến ${max} ký tự`,
  ],
  [
    /^must be shorter than or equal to (\S+) characters$/,
    (s, n) => `${s} không được dài quá ${n} ký tự`,
  ],
  [
    /^must be longer than or equal to (\S+) characters$/,
    (s, n) => `${s} phải có ít nhất ${n} ký tự`,
  ],
  [/^must be an array$/, s => `${s} phải là mảng`],
  [/^must not be less than (.+)$/, (s, n) => `${s} không được nhỏ hơn ${n}`],
  [/^must not be greater than (.+)$/, (s, n) => `${s} không được lớn hơn ${n}`],
  [
    /^must be one of the following values: (.*)$/,
    (s, v) => `${s} phải là một trong các giá trị: ${v}`,
  ],
  [/^must be a mongodb id$/, s => `${s} phải là ID hợp lệ`],
  [/^must be an integer number$/, s => `${s} phải là số nguyên`],
  [/^must be an email$/, s => `${s} phải là email hợp lệ`],
  [/^must be a boolean value$/, s => `${s} phải là giá trị true hoặc false`],
  [/^must match .+ regular expression$/, s => `${s} không đúng định dạng`],
  [/^must be a number conforming to the specified constraints$/, s => `${s} phải là số`],
  [/^must be an object$/, s => `${s} phải là object`],
  [/^must be a non-empty object$/, s => `${s} phải là object và không được rỗng`],
  [/^must be a Date instance$/, s => `${s} phải là ngày hợp lệ`],
  [/^must be a valid ISO 8601 date string$/, s => `${s} phải là ngày theo định dạng ISO 8601`],
  [/^must contain at least (\S+) elements$/, (s, n) => `${s} phải có ít nhất ${n} phần tử`],
  [/^must contain no more than (\S+) elements$/, (s, n) => `${s} không được có quá ${n} phần tử`],
  [/^must be a UUID$/, s => `${s} phải là UUID`],
  [/^must be a positive number$/, s => `${s} phải là số dương`],
  [/^must be equal to (.*)$/, (s, v) => `${s} phải bằng ${v}`],
  [/^must be a URL address$/, s => `${s} phải là URL hợp lệ`],
];

const NESTED = /^nested property (\S+) must be either object or array$/;
const NOT_WHITELISTED = /^property (\S+) should not exist$/;
const DEFAULT_MESSAGE = /^(each value in )?(\S+) ((?:must|should) .+)$/;

/** Turns a class-validator default (English) message into Vietnamese; any other message is returned as is. */
export function translateValidationMessage(message: string): string {
  const nested = NESTED.exec(message);
  if (nested) return `${nested[1]} phải là object hoặc mảng`;
  const extra = NOT_WHITELISTED.exec(message);
  if (extra) return `Không được gửi trường ${extra[1]}`;

  const match = DEFAULT_MESSAGE.exec(message);
  if (!match) return message;
  const [, each, property, rest] = match;
  const subject = each ? `Mỗi giá trị trong ${property}` : property;

  for (const [pattern, template] of DEFAULT_MESSAGES) {
    const args = pattern.exec(rest);
    if (args) return template(subject, ...args.slice(1));
  }
  return message;
}

/** The global ValidationPipe, with class-validator's default messages in Vietnamese. */
export class ViValidationPipe extends ValidationPipe {
  protected flattenValidationErrors(validationErrors: ValidationError[]): string[] {
    return super.flattenValidationErrors(validationErrors).map(translateValidationMessage);
  }
}
