import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
import { CaseForm } from "@/app/cases/components/case-form";
import { UsefulnessPanel } from "@/app/knowledge/components/usefulness-panel";
describe("milestone 3 UI", () => {
  it("renders practical case fields", () => {
    render(<CaseForm />);
    expect(screen.getByLabelText("What was tried")).toBeInTheDocument();
    expect(screen.getByLabelText("When did it occur?")).toBeInTheDocument();
  });
  it("offers Yes and No usefulness actions", () => {
    render(
      <UsefulnessPanel
        articleId="00000000-0000-4000-8000-000000000001"
        useCount={2}
        lastUsedAt={null}
        history={[]}
      />,
    );
    expect(screen.getByRole("button", { name: "Yes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No" })).toBeInTheDocument();
    expect(screen.getByText(/used 2 times/i)).toBeInTheDocument();
  });
});
