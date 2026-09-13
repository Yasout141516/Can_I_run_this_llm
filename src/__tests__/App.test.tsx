import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "../App";

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe("App routes", () => {
  it("opens on the welcome page, not on results", () => {
    at("/");
    // Scoped to <main>: the nav carries a "Check my hardware" link on every
    // route, so an unscoped query would pass even if home rendered nothing.
    expect(
      within(screen.getByRole("main")).getByRole("link", { name: /check my hardware/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("tile-run-on-gpu")).not.toBeInTheDocument();
  });

  it("serves the calculator at /calculator", () => {
    at("/calculator");
    expect(screen.getByTestId("tile-run-on-gpu")).toBeInTheDocument();
  });

  it.each([
    "/",
    "/calculator",
    "/browse",
    "/benchmarks",
    "/model/meta-llama%2FLlama-3.1-8B-Instruct",
  ])(
    "carries the nav on %s",
    (path) => {
      at(path);
      expect(screen.getByRole("navigation", { name: /main/i })).toBeInTheDocument();
    },
  );

  it("serves the benchmarks table at /benchmarks", () => {
    at("/benchmarks");
    expect(screen.getByRole("region", { name: /benchmark scores/i })).toBeInTheDocument();
  });

  it("still serves a model report at /model/:id", () => {
    at("/model/meta-llama%2FLlama-3.1-8B-Instruct");
    expect(
      screen.getByRole("heading", { level: 1, name: "Llama 3.1 8B Instruct" }),
    ).toBeInTheDocument();
  });
});
