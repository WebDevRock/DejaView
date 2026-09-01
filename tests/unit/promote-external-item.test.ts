// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  PromoteExternalItemService,
  type ExternalPromotionRepository,
} from "@/application/sources/promote-external-item";
import type {
  KnowledgeSourceProvider,
  ProviderItem,
} from "@/domain/sources/provider";

const actor = { id: "user-1", displayName: "User", role: "editor" as const };
const item: ProviderItem = {
  id: "jira:SUP-1",
  externalKey: "SUP-1",
  title: "Issue",
  snippet: "",
  url: "https://jira.example/browse/SUP-1",
  sourceId: "jira",
  sourceLabel: "Jira",
  status: "open",
  score: 1,
  updatedAt: "2026-08-28",
  metadata: {},
  content: [],
  plainText: "Description",
};

function setup(
  pages: Record<
    string,
    {
      comments: Array<{
        id: string;
        author: string;
        createdAt: string;
        content: [];
        plainText: string;
      }>;
      nextCursor: string | null;
    }
  >,
) {
  const getComments = vi.fn(
    async (_key: string, cursor = "0") => pages[cursor]!,
  );
  const provider = {
    id: "jira",
    label: "Jira",
    provenance: {
      providerType: "jira",
      secretEnvRef: "TOKEN",
      promotionGuidance: "Review",
    },
    capabilities: {
      search: true,
      itemDetail: true,
      comments: true,
      supportedFilters: [],
    },
    search: async () => [],
    getItem: vi.fn(async () => item),
    getComments,
  } satisfies KnowledgeSourceProvider;
  const repository: ExternalPromotionRepository = {
    findExisting: vi.fn(() => null),
    promote: vi.fn(() => ({ articleId: "article-1", duplicate: false })),
  };
  return {
    provider,
    repository,
    service: new PromoteExternalItemService(provider, repository),
    getComments,
  };
}

describe("PromoteExternalItemService comment selection", () => {
  it("refetches authoritative pages until every selected comment is found", async () => {
    const { service, repository, getComments } = setup({
      "0": {
        comments: [
          {
            id: "1",
            author: "A",
            createdAt: "date",
            content: [],
            plainText: "first",
          },
        ],
        nextCursor: "50",
      },
      "50": {
        comments: [
          {
            id: "2",
            author: "B",
            createdAt: "date",
            content: [],
            plainText: "second",
          },
        ],
        nextCursor: null,
      },
    });
    await service.promote("SUP-1", actor, [{ id: "2", mapping: "step" }]);
    expect(getComments).toHaveBeenCalledTimes(2);
    expect(repository.promote).toHaveBeenCalledWith(
      item,
      actor,
      expect.anything(),
      [
        expect.objectContaining({
          id: "2",
          mapping: "step",
          plainText: "second",
        }),
      ],
    );
  });

  it("rejects selections missing from the authoritative Jira response", async () => {
    const { service, repository } = setup({
      "0": { comments: [], nextCursor: null },
    });
    await expect(
      service.promote("SUP-1", actor, [{ id: "9", mapping: "context" }]),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(repository.promote).not.toHaveBeenCalled();
  });

  it("rejects selected comments for a duplicate promotion", async () => {
    const { service, repository, getComments } = setup({});
    vi.mocked(repository.findExisting).mockReturnValue({
      articleId: "existing",
      duplicate: true,
    });
    await expect(
      service.promote("SUP-1", actor, [{ id: "1", mapping: "context" }]),
    ).rejects.toMatchObject({ code: "promotion_conflict" });
    expect(getComments).not.toHaveBeenCalled();
    expect(repository.promote).not.toHaveBeenCalled();
  });

  it("retains the idempotent duplicate result when no comments are selected", async () => {
    const { service, repository, getComments } = setup({});
    vi.mocked(repository.findExisting).mockReturnValue({
      articleId: "existing",
      duplicate: true,
    });
    await expect(service.promote("SUP-1", actor)).resolves.toEqual({
      articleId: "existing",
      duplicate: true,
    });
    expect(getComments).not.toHaveBeenCalled();
  });

  it("rejects an authoritative cursor cycle", async () => {
    const { service, repository } = setup({
      "0": { comments: [], nextCursor: "50" },
      "50": { comments: [], nextCursor: "50" },
    });
    await expect(
      service.promote("SUP-1", actor, [{ id: "9", mapping: "context" }]),
    ).rejects.toMatchObject({ code: "unsafe_response" });
    expect(repository.promote).not.toHaveBeenCalled();
  });

  it("stops after ten authoritative comment pages", async () => {
    const pages = Object.fromEntries(
      Array.from({ length: 11 }, (_, index) => [
        String(index * 50),
        { comments: [], nextCursor: String((index + 1) * 50) },
      ]),
    );
    const { service, repository, getComments } = setup(pages);
    await expect(
      service.promote("SUP-1", actor, [{ id: "9", mapping: "context" }]),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(getComments).toHaveBeenCalledTimes(10);
    expect(repository.promote).not.toHaveBeenCalled();
  });

  it("imports no comments by default", async () => {
    const { service, repository, getComments } = setup({});
    await service.promote("SUP-1", actor);
    expect(getComments).not.toHaveBeenCalled();
    expect(repository.promote).toHaveBeenCalledWith(
      item,
      actor,
      expect.anything(),
      [],
    );
  });
});
