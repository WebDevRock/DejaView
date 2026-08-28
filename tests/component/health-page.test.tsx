import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("health page", () => {
  it("identifies the application as ready", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "DejaView" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Service healthy")).toBeInTheDocument();
    expect(
      screen.getByText(/local-first support knowledge/i),
    ).toBeInTheDocument();
  });
});
