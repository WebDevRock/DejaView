function projectHue(projectKey: string): number {
  const hash = [...projectKey.toUpperCase()].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
  return hash % 360;
}

export function ProjectPill({
  projectKey,
  projectName,
}: {
  projectKey: string;
  projectName?: string | null;
}) {
  const label = projectName?.trim() || projectKey;
  const hue = projectHue(projectKey);
  return (
    <span
      className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold normal-case tracking-normal"
      data-project-key={projectKey}
      style={{
        backgroundColor: `hsl(${hue} 85% 95%)`,
        borderColor: `hsl(${hue} 55% 78%)`,
        color: `hsl(${hue} 65% 28%)`,
      }}
    >
      {label}
    </span>
  );
}
