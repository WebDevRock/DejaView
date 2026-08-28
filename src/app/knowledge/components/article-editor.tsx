"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  STEP_TYPES,
  type ArticleUpdateInput,
  type EdgeInput,
  type KnowledgeArticle,
  type StepInput,
} from "@/domain/knowledge/article";

type Save = (input: ArticleUpdateInput) => Promise<unknown> | unknown;
type Publish = (version: number) => Promise<unknown> | unknown;
const humanise = (value: string) => {
  if (value === "sql") return "SQL";
  if (value === "powershell") return "PowerShell";
  if (value === "url") return "URL";
  return value.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
};
const csv = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const newStep = (position: number): StepInput => ({
  id: crypto.randomUUID(),
  stableKey: `step-${crypto.randomUUID()}`,
  position,
  stepType: "instruction",
  title: null,
  instruction: "",
  code: null,
  notes: null,
});

export function ArticleEditor({
  article,
  onSave,
  onPublish,
}: {
  article: KnowledgeArticle;
  onSave?: Save;
  onPublish?: Publish;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(article.title);
  const [summary, setSummary] = useState(article.summary);
  const [problem, setProblem] = useState(article.problem);
  const [symptoms, setSymptoms] = useState(article.symptoms);
  const [resolutionSummary, setResolutionSummary] = useState(
    article.resolutionSummary,
  );
  const [applications, setApplications] = useState(
    article.applications.map((item) => item.name).join(", "),
  );
  const [tags, setTags] = useState(
    article.tags.map((item) => item.name).join(", "),
  );
  const [steps, setSteps] = useState<StepInput[]>(
    article.steps.map((step) => ({
      id: step.id,
      stableKey: step.stableKey,
      position: step.position,
      stepType: step.stepType,
      title: step.title,
      instruction: step.instruction,
      code: step.code,
      notes: step.notes,
    })),
  );
  const [edges, setEdges] = useState<EdgeInput[]>(
    article.edges.map((edge) => ({
      id: edge.id,
      fromStepId: edge.fromStepId,
      toStepId: edge.toStepId,
      edgeType: edge.edgeType,
      label: edge.label,
    })),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(article.version);
  const normalise = (items: StepInput[]) =>
    items.map((item, position) => ({ ...item, position }));
  const patchStep = (index: number, patch: Partial<StepInput>) =>
    setSteps((items) =>
      items.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    );
  const move = (index: number, offset: number) =>
    setSteps((items) => {
      const copy = [...items];
      const [item] = copy.splice(index, 1);
      copy.splice(index + offset, 0, item!);
      return normalise(copy);
    });
  const remove = (index: number) =>
    setSteps((items) => {
      const id = items[index]?.id;
      if (id)
        setEdges((current) =>
          current.filter(
            (edge) => edge.fromStepId !== id && edge.toStepId !== id,
          ),
        );
      return normalise(items.filter((_, position) => position !== index));
    });
  const input = (): ArticleUpdateInput => ({
    version,
    title,
    summary,
    problem,
    symptoms,
    resolutionSummary,
    steps,
    edges,
    applications: csv(applications),
    tags: csv(tags),
  });
  const defaultSave: Save = async (body) => {
    const response = await fetch(`/api/v1/articles/${article.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message ?? "Save failed");
    setVersion(json.data.version);
    return json.data;
  };
  const defaultPublish: Publish = async (expectedVersion) => {
    const response = await fetch(`/api/v1/articles/${article.id}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: expectedVersion }),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message ?? "Publish failed");
    router.push(`/knowledge/${article.id}`);
    router.refresh();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = (await (onSave ?? defaultSave)(input())) as
        KnowledgeArticle | undefined;
      if (result?.version) setVersion(result.version);
      setMessage("Article saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = (await (onSave ?? defaultSave)(input())) as
        KnowledgeArticle | undefined;
      const savedVersion = result?.version ?? version + 1;
      setVersion(savedVersion);
      await (onPublish ?? defaultPublish)(savedVersion);
      setMessage("Article published");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="editor" onSubmit={submit}>
      <div className="form-grid">
        <label>
          Title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Summary
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <label>
          Problem
          <textarea
            required
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
          />
        </label>
        <label>
          Symptoms or error
          <textarea
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
          />
        </label>
        <label>
          Resolution summary
          <textarea
            value={resolutionSummary}
            onChange={(e) => setResolutionSummary(e.target.value)}
          />
        </label>
        <label>
          Applications <span className="hint">comma separated</span>
          <input
            value={applications}
            onChange={(e) => setApplications(e.target.value)}
          />
        </label>
        <label>
          Tags <span className="hint">comma separated</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
      </div>
      <section>
        <div className="section-title">
          <h2>Steps</h2>
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              setSteps((items) => [...items, newStep(items.length)])
            }
          >
            Add step
          </button>
        </div>
        <div className="editor-steps">
          {steps.map((step, index) => (
            <fieldset
              className="step-editor"
              key={step.id ?? step.stableKey ?? index}
            >
              <legend>Step {index + 1}</legend>
              <div className="step-actions">
                <button
                  type="button"
                  aria-label={`Move step ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move step ${index + 1} down`}
                  disabled={index === steps.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove step ${index + 1}`}
                  disabled={steps.length === 1}
                  onClick={() => remove(index)}
                >
                  Remove
                </button>
              </div>
              <label>
                Type
                <select
                  aria-label={`Step ${index + 1} type`}
                  value={step.stepType}
                  onChange={(e) =>
                    patchStep(index, {
                      stepType: e.target.value as StepInput["stepType"],
                    })
                  }
                >
                  {STEP_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {humanise(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Heading <span className="hint">optional</span>
                <input
                  value={step.title ?? ""}
                  onChange={(e) =>
                    patchStep(index, { title: e.target.value || null })
                  }
                />
              </label>
              <label>
                Instruction
                <textarea
                  required
                  value={step.instruction}
                  onChange={(e) =>
                    patchStep(index, { instruction: e.target.value })
                  }
                />
              </label>
              {["sql", "powershell", "code"].includes(step.stepType) && (
                <label>
                  {humanise(step.stepType)}
                  <textarea
                    className="code-input"
                    value={step.code ?? ""}
                    onChange={(e) =>
                      patchStep(index, { code: e.target.value || null })
                    }
                  />
                </label>
              )}
              <label>
                Notes <span className="hint">optional</span>
                <textarea
                  value={step.notes ?? ""}
                  onChange={(e) =>
                    patchStep(index, { notes: e.target.value || null })
                  }
                />
              </label>
            </fieldset>
          ))}
        </div>
      </section>
      <section>
        <div className="section-title">
          <h2>Optional flow edges</h2>
          <button
            type="button"
            className="button secondary"
            disabled={steps.length < 2}
            onClick={() =>
              setEdges((items) => [
                ...items,
                {
                  fromStepId: steps[0]!.id!,
                  toStepId: steps[1]!.id!,
                  edgeType: "next",
                  label: null,
                },
              ])
            }
          >
            Add edge
          </button>
        </div>
        {edges.map((edge, index) => (
          <div
            className="edge-editor"
            key={`${edge.fromStepId}-${edge.toStepId}-${index}`}
          >
            <label>
              From
              <select
                value={edge.fromStepId}
                onChange={(e) =>
                  setEdges((items) =>
                    items.map((item, i) =>
                      i === index
                        ? { ...item, fromStepId: e.target.value }
                        : item,
                    ),
                  )
                }
              >
                {steps.map((step, i) => (
                  <option value={step.id} key={step.id}>
                    Step {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To
              <select
                value={edge.toStepId}
                onChange={(e) =>
                  setEdges((items) =>
                    items.map((item, i) =>
                      i === index
                        ? { ...item, toStepId: e.target.value }
                        : item,
                    ),
                  )
                }
              >
                {steps.map((step, i) => (
                  <option value={step.id} key={step.id}>
                    Step {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Edge type
              <select
                value={edge.edgeType}
                onChange={(e) =>
                  setEdges((items) =>
                    items.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            edgeType: e.target.value as EdgeInput["edgeType"],
                          }
                        : item,
                    ),
                  )
                }
              >
                <option value="next">Next</option>
                <option value="branch">Branch</option>
                <option value="related">Related</option>
              </select>
            </label>
            <label>
              Label
              <input
                value={edge.label ?? ""}
                onChange={(e) =>
                  setEdges((items) =>
                    items.map((item, i) =>
                      i === index
                        ? { ...item, label: e.target.value || null }
                        : item,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              aria-label={`Remove edge ${index + 1}`}
              onClick={() =>
                setEdges((items) => items.filter((_, i) => i !== index))
              }
            >
              Remove
            </button>
          </div>
        ))}
      </section>
      {message && <p role="status">{message}</p>}
      <div className="form-actions">
        <button className="button secondary" type="submit" disabled={busy}>
          {article.status === "Draft" ? "Save draft" : "Save changes"}
        </button>
        {article.status === "Draft" && (
          <button
            className="button primary"
            type="button"
            disabled={busy}
            onClick={publish}
          >
            Save and publish
          </button>
        )}
      </div>
    </form>
  );
}
