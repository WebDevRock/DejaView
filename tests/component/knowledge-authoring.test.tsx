import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});

import { ArticleEditor } from "@/app/knowledge/components/article-editor";
import { ArticleView } from "@/app/knowledge/components/article-view";
import type { KnowledgeArticle } from "@/domain/knowledge/article";

const article: KnowledgeArticle = {
  id: "00000000-0000-4000-8000-000000000010",
  stableKey: "KB-00000000",
  title: "Repair payroll export",
  summary: "Known fix",
  problem: "Export fails",
  symptoms: "E42",
  resolutionSummary: "Restore the view",
  status: "Draft",
  version: 1,
  useCount: 0,
  lastUsedAt: null,
  createdByUserId: "user",
  updatedByUserId: "user",
  publishedByUserId: null,
  publishedAt: null,
  createdAt: "2026-08-28T10:00:00.000Z",
  updatedAt: "2026-08-28T10:00:00.000Z",
  applications: [{ key: "payroll", name: "Payroll" }],
  tags: [{ slug: "database", name: "Database" }],
  sourceLabels: ["Knowledge"],
  steps: [
    {
      id: "00000000-0000-4000-8000-000000000011",
      articleId: "00000000-0000-4000-8000-000000000010",
      stableKey: "step-one",
      position: 0,
      stepType: "sql",
      title: "Verify",
      instruction: "Run this query",
      code: "SELECT 1;",
      notes: null,
      bodyAstJson: "{}",
      bodyPlainText: "Run this query\n\nSELECT 1;",
      createdAt: "2026-08-28T10:00:00.000Z",
      updatedAt: "2026-08-28T10:00:00.000Z",
    },
  ],
  edges: [],
};

describe("knowledge authoring UI", () => {
  it("shows lifecycle-correct controls for a published article", async () => {
    const onSave = vi.fn();
    const onPublish = vi.fn();
    render(
      <ArticleEditor
        article={{ ...article, status: "Published" }}
        onSave={onSave}
        onPublish={onPublish}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Save and publish" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
    expect(onPublish).not.toHaveBeenCalled();
  });

  it("uses a full UUID in the stable key for a newly added step", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const uuids = [
      "aaaaaaaa-0000-4000-8000-000000000001",
      "aaaaaaaa-0000-4000-8000-000000000002",
    ];
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => uuids.shift()!);
    render(<ArticleEditor article={article} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Add step" }));
    const secondStep = screen.getByRole("group", { name: "Step 2" });
    await user.type(
      within(secondStep).getByLabelText("Instruction", { exact: true }),
      "Second step",
    );
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: expect.arrayContaining([
          expect.objectContaining({
            id: "aaaaaaaa-0000-4000-8000-000000000001",
            stableKey: "step-aaaaaaaa-0000-4000-8000-000000000002",
          }),
        ]),
      }),
    );
  });

  it("edits and reorders every supported step type", async () => {
    const user = userEvent.setup();
    render(
      <ArticleEditor article={article} onSave={vi.fn()} onPublish={vi.fn()} />,
    );
    const type = screen.getByLabelText("Step 1 type");
    for (const value of [
      "instruction",
      "check",
      "decision",
      "sql",
      "powershell",
      "code",
      "url",
      "warning",
      "expected_result",
    ]) {
      await user.selectOptions(type, value);
      expect(type).toHaveValue(value);
    }
    await user.click(screen.getByRole("button", { name: "Add step" }));
    expect(screen.getByLabelText("Step 2 type")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Move step 2 up" }));
    expect(screen.getByLabelText("Step 1 type")).toHaveValue("instruction");
    expect(
      screen.getByRole("button", { name: "Add edge" }),
    ).toBeInTheDocument();
  });

  it("renders SQL and application and tag metadata", () => {
    render(<ArticleView article={article} />);
    expect(screen.getByText("SELECT 1;")).toBeInTheDocument();
    expect(screen.getByText("SQL")).toBeInTheDocument();
    expect(screen.getByText("Payroll")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
  });

  it("copies step code and confirms success", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ArticleView article={article} />);

    await user.click(screen.getByRole("button", { name: "Copy SQL code" }));

    expect(writeText).toHaveBeenCalledWith("SELECT 1;");
    expect(
      screen.getByRole("button", { name: "SQL code copied" }),
    ).toHaveTextContent("Copied");
    expect(screen.getByRole("status")).toHaveTextContent("SQL code copied");
  });

  it("reports clipboard failures accessibly", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .fn()
      .mockRejectedValue(new Error("Clipboard unavailable"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ArticleView article={article} />);

    await user.click(screen.getByRole("button", { name: "Copy SQL code" }));

    expect(writeText).toHaveBeenCalledWith("SELECT 1;");
    expect(
      screen.getByRole("button", { name: "Copy SQL code failed" }),
    ).toHaveTextContent("Copy failed");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Could not copy SQL code",
    );
  });
});
