export function externalSourceLabel(
  providerType: string,
  persistedName: string,
): string {
  return providerType === "jira" ? "Jira" : persistedName;
}
