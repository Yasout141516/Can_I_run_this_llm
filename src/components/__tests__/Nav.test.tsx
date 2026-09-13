import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Nav } from "../Nav";

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Nav />
    </MemoryRouter>,
  );

describe("Nav", () => {
  it("offers every destination in the product", () => {
    at("/");
    const nav = screen.getByRole("navigation", { name: /main/i });
    expect(nav).toBeInTheDocument();
    for (const name of ["Home", "Browse LLMs", "Check my hardware"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("takes the wordmark home without claiming to be the page heading", () => {
    at("/browse");
    expect(screen.getByRole("link", { name: "Runcheck" })).toHaveAttribute("href", "/");
    // Home owns the only h1. A second one in the nav would leave every page
    // with two top-level headings.
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("marks the route you are on, for screen readers and not only in colour", () => {
    at("/browse");
    expect(screen.getByRole("link", { name: "Browse LLMs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("does not mark Home active merely because every path starts with /", () => {
    at("/calculator");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Check my hardware" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
