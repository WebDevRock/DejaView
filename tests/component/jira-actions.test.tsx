import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JiraActions } from "@/presentation/components/jira-actions";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

describe("Jira issue actions", () => {
  it("disables controls while loading and reports a network failure in British English", async () => {
    let rejectRequest!: (error: Error) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
      ),
    );
    const user = userEvent.setup();
    render(<JiraActions issueKey="SUP-1" />);

    await user.click(screen.getByRole("button", { name: "Load comments" }));
    expect(
      screen.getByRole("button", { name: "Loading comments…" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Import to knowledge" }),
    ).toBeDisabled();
    rejectRequest(new Error("network details"));

    expect(
      await screen.findByText(
        "Jira comments could not be loaded. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load comments" })).toBeEnabled();
  });

  it("handles an invalid promotion response without navigating", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 502 })),
    );
    const user = userEvent.setup();
    render(<JiraActions issueKey="SUP-1" />);

    await user.click(
      screen.getByRole("button", { name: "Import to knowledge" }),
    );

    expect(
      await screen.findByText(
        "The Jira draft could not be created. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a useful failure state for malformed comment entries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          data: {},
          meta: { comments: { comments: [null], nextCursor: null } },
        }),
      ),
    );
    const user = userEvent.setup();
    render(<JiraActions issueKey="SUP-1" />);

    await user.click(screen.getByRole("button", { name: "Load comments" }));

    expect(
      await screen.findByText(
        "Jira comments could not be loaded. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Comments" }),
    ).not.toBeInTheDocument();
  });

  it("rejects comment content whose aggregate text exceeds the browser budget", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          data: {},
          meta: {
            comments: {
              comments: [
                {
                  id: "one",
                  author: "Alex",
                  createdAt: "2026-08-28T10:00:00Z",
                  content: [
                    { type: "text", text: "x".repeat(15_000) },
                    { type: "text", text: "y".repeat(15_000) },
                  ],
                  plainText: "bounded",
                },
              ],
              nextCursor: null,
            },
          },
        }),
      ),
    );
    const user = userEvent.setup();
    render(<JiraActions issueKey="SUP-1" />);

    await user.click(screen.getByRole("button", { name: "Load comments" }));

    expect(
      await screen.findByText(
        "Jira comments could not be loaded. Please try again.",
      ),
    ).toBeInTheDocument();
  });

  it("loads paginated comments cumulatively through the mocked browser flow", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {},
          meta: {
            comments: {
              comments: [
                {
                  id: "one",
                  author: "Alex",
                  createdAt: "2026-08-28T10:00:00Z",
                  content: [
                    {
                      type: "paragraph",
                      children: [{ type: "text", text: "First comment" }],
                    },
                  ],
                  plainText: "First comment",
                },
              ],
              nextCursor: "1",
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {},
          meta: {
            comments: {
              comments: [
                {
                  id: "two",
                  author: "Blair",
                  createdAt: "2026-08-28T11:00:00Z",
                  content: [
                    {
                      type: "paragraph",
                      children: [{ type: "text", text: "Second comment" }],
                    },
                  ],
                  plainText: "Second comment",
                },
              ],
              nextCursor: null,
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<JiraActions issueKey="SUP-1" />);

    await user.click(screen.getByRole("button", { name: "Load comments" }));
    expect(await screen.findByText("First comment")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next comments" }));

    expect(await screen.findByText("Second comment")).toBeInTheDocument();
    expect(screen.getByText("First comment")).toBeInTheDocument();
    expect(fetcher).toHaveBeenLastCalledWith(
      "/api/v1/providers/jira/issues/SUP-1?includeComments=true&cursor=1",
    );
  });

  it("promotes the freshly fetched issue and opens the draft editor", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { data: { articleId: "article-1", duplicate: false }, meta: {} },
            { status: 201 },
          ),
        ),
    );
    const user = userEvent.setup();
    render(<JiraActions issueKey="SUP-1" />);

    await user.click(
      screen.getByRole("button", { name: "Import to knowledge" }),
    );

    expect(push).toHaveBeenCalledWith("/knowledge/article-1/edit");
  });

  it("does not select loaded comments automatically and submits only explicit mappings", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {},
          meta: {
            comments: {
              comments: [
                {
                  id: "101",
                  author: "Alex",
                  createdAt: "2026-08-28T10:00:00Z",
                  content: [
                    {
                      type: "paragraph",
                      children: [{ type: "text", text: "Useful context" }],
                    },
                  ],
                  plainText: "Useful context",
                },
                {
                  id: "102",
                  author: "Blair",
                  createdAt: "2026-08-28T11:00:00Z",
                  content: [
                    {
                      type: "paragraph",
                      children: [{ type: "text", text: "Run this fix" }],
                    },
                  ],
                  plainText: "Run this fix",
                },
              ],
              nextCursor: null,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { data: { articleId: "article-2", duplicate: false }, meta: {} },
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<JiraActions issueKey="SUP-1" />);

    await user.click(screen.getByRole("button", { name: "Load comments" }));
    const first = await screen.findByRole("checkbox", {
      name: "Import comment 101 by Alex, 2026-08-28T10:00:00Z",
    });
    const second = screen.getByRole("checkbox", {
      name: "Import comment 102 by Blair, 2026-08-28T11:00:00Z",
    });
    expect(first).not.toBeChecked();
    expect(second).not.toBeChecked();

    await user.click(first);
    await user.click(second);
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Mapping for comment 102 by Blair, 2026-08-28T11:00:00Z",
      }),
      "step",
    );
    await user.click(
      screen.getByRole("button", { name: "Import to knowledge" }),
    );

    expect(fetcher).toHaveBeenLastCalledWith(
      "/api/v1/providers/jira/issues/SUP-1/promote",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          comments: [
            { id: "101", mapping: "context" },
            { id: "102", mapping: "step" },
          ],
        }),
      }),
    );
  });

  it("shows the 20-comment selection limit and disables additional comments", async () => {
    const comments = Array.from({ length: 21 }, (_, index) => ({
      id: String(index + 1),
      author: "Same author",
      createdAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00Z`,
      content: [{ type: "text", text: `Comment ${index + 1}` }],
      plainText: `Comment ${index + 1}`,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          data: {},
          meta: { comments: { comments, nextCursor: null } },
        }),
      ),
    );
    const user = userEvent.setup();
    render(<JiraActions issueKey="SUP-1" />);
    await user.click(screen.getByRole("button", { name: "Load comments" }));
    const checkboxes = await screen.findAllByRole("checkbox");
    expect(screen.getByText("0 of 20 comments selected")).toBeInTheDocument();
    for (const checkbox of checkboxes.slice(0, 20)) await user.click(checkbox);
    expect(screen.getByText("20 of 20 comments selected")).toBeInTheDocument();
    expect(checkboxes[20]).toBeDisabled();
    expect(checkboxes[0]).toBeEnabled();
  });

  it("uses unique accessible comment labels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          data: {},
          meta: {
            comments: {
              comments: [
                {
                  id: "101",
                  author: "Alex",
                  createdAt: "2026-08-28T10:00:00Z",
                  content: [],
                  plainText: "One",
                },
                {
                  id: "102",
                  author: "Alex",
                  createdAt: "2026-08-28T10:00:00Z",
                  content: [],
                  plainText: "Two",
                },
              ],
              nextCursor: null,
            },
          },
        }),
      ),
    );
    const user = userEvent.setup();
    render(<JiraActions issueKey="SUP-1" />);
    await user.click(screen.getByRole("button", { name: "Load comments" }));
    expect(
      await screen.findByRole("checkbox", {
        name: "Import comment 101 by Alex, 2026-08-28T10:00:00Z",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "Import comment 102 by Alex, 2026-08-28T10:00:00Z",
      }),
    ).toBeInTheDocument();
  });

  it("clears hidden selections when the first comment page is reloaded", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(commentResponse("101", "First"))
      .mockResolvedValueOnce(commentResponse("102", "Replacement"));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<JiraActions issueKey="SUP-1" />);
    await user.click(screen.getByRole("button", { name: "Load comments" }));
    await user.click(await screen.findByRole("checkbox"));
    expect(screen.getByText("1 of 20 comments selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load comments" }));
    expect(await screen.findByText("Replacement")).toBeInTheDocument();
    expect(screen.getByText("0 of 20 comments selected")).toBeInTheDocument();
  });

  it("explains a duplicate promotion conflict without navigating", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "promotion_conflict",
              message: "Selected comments cannot be added to an existing draft",
            },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    render(<JiraActions issueKey="SUP-1" />);
    await user.click(
      screen.getByRole("button", { name: "Import to knowledge" }),
    );
    expect(
      await screen.findByText(
        "This Jira issue already has a draft. Selected comments were not added; open the existing draft without selections instead.",
      ),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

function commentResponse(id: string, text: string) {
  return Response.json({
    data: {},
    meta: {
      comments: {
        comments: [
          {
            id,
            author: "Alex",
            createdAt: "2026-08-28T10:00:00Z",
            content: [{ type: "text", text }],
            plainText: text,
          },
        ],
        nextCursor: null,
      },
    },
  });
}
