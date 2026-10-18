import { redirect } from "next/navigation";
import { z } from "zod";

export function parseActionInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
  errorPath: string,
): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) redirect(errorPath);
  return parsed.data;
}
