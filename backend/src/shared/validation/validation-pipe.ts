import { ValidationPipe } from '@nestjs/common';

/**
 * The one ValidationPipe, built here so `main.ts` and the e2e harness cannot drift apart.
 *
 * They had. Production ran with `enableImplicitConversion: true` and the test bootstrap did not,
 * which meant the suite validated a different application from the one that shipped. Implicit
 * conversion coerces through `Boolean(value)`, so a body carrying the string `"false"` reached a
 * handler as `true` in production - un-muting a repository somebody had just muted - while the
 * same request was rejected outright in the tests. No spec could ever have caught it.
 *
 * Implicit conversion is gone rather than mirrored: nothing here takes a numeric path, query or
 * body field, so it bought nothing and cost that.
 *
 * `whitelist` strips anything the DTO does not declare. Note that this means a property with no
 * validation decorator at all is silently dropped - every field a DTO actually wants must carry
 * one.
 */
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
  });
}
