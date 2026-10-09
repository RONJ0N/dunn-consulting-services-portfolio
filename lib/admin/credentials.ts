/** Public demo defaults must never authorize a production administrator. */
export function adminCredential(
  name: string,
  developmentDefault: string,
  minimumLength = 32,
): string {
  const value = process.env[name]?.trim();
  if (process.env.NODE_ENV === "production") {
    if (
      !value ||
      value.length < minimumLength ||
      /^(demo-admin|dev-secret|change-?me|replace-?me)/i.test(value)
    ) {
      throw new Error(`${name} requires a strong, explicitly configured production value`);
    }
    return value;
  }
  return value || developmentDefault;
}
