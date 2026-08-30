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
});
