/**
 * A discriminated union type for representing operation results.
 * Inspired by Rust's Result type.
 *
 * @template T - The type of the success data
 * @template E - The type of the error (defaults to string)
 *
 * @example
 * ```typescript
 * function divide(a: number, b: number): Result<number> {
 *   if (b === 0) {
 *     return { error: "Cannot divide by zero" };
 *   }
 *   return { data: a / b };
 * }
 *
 * const result = divide(10, 2);
 * if (result.error) {
 *   console.error(result.error);
 * } else {
 *   console.log(result.data); // 5
 * }
 * ```
 */
export type Result<T, E = string> =
  | { data: T; error?: never }
  | { data?: never; error: E };

/**
 * Helper to create a success result
 */
export const ok = <T>(data: T): Result<T, never> => ({ data });

/**
 * Helper to create an error result
 */
export const err = <E = string>(error: E): Result<never, E> => ({ error });
