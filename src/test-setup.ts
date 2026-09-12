import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// With `globals: false`, @testing-library/react's built-in auto-cleanup never
// registers (it only wires up when it finds a global `afterEach`), so without
// this, DOM from one test's render() bleeds into the next.
afterEach(() => {
  cleanup();
});
