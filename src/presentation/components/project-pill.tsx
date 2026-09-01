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
  colour,
}: {
  projectKey: string;
  projectName?: string | null;
  colour?: string | null;
}) {
  const label = projectName?.trim() || projectKey;
  const hue = projectHue(projectKey);
  const explicitColours = pillColours(colour);
  return (
    <span
      className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold normal-case tracking-normal"
      data-project-key={projectKey}
      style={
        explicitColours ?? {
          backgroundColor: `hsl(${hue} 85% 95%)`,
          borderColor: `hsl(${hue} 55% 78%)`,
          color: `hsl(${hue} 65% 28%)`,
        }
      }
    >
      {label}
    </span>
  );
}

function pillColours(colour: string | null | undefined) {
  if (!colour || !/^#[0-9A-Fa-f]{6}$/.test(colour)) return null;
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(colour.slice(offset, offset + 2), 16),
  );
  const blendWithWhite = (white: number) =>
    `rgb(${channels
      .map((channel) => Math.round(channel * (1 - white) + 255 * white))
      .join(", ")})`;
  return {
    backgroundColor: blendWithWhite(0.9),
    borderColor: blendWithWhite(0.65),
    color: `rgb(${channels.map((channel) => Math.round(channel * 0.35)).join(", ")})`,
  };
}
