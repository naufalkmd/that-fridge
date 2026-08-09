import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library normally auto-registers this via NODE_ENV==="test" detection, but
// this project's NODE_ENV handling is unreliable enough elsewhere (see package.json's test
// script) that it's worth not depending on that - without it, a renderHook instance from one
// test can stay mounted into the next, letting a stale async callback fire against it.
afterEach(() => {
  cleanup();
});
