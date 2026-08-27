import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MarkdownText from "./MarkdownText";

// Regression coverage for the Home screen bug where AI-generated agent insight text
// (which genuinely contains markdown like **bold** and "- " bullet lists) was rendered
// in a plain <div>, showing literal asterisks/dashes instead of formatted text.
describe("MarkdownText", () => {
  it("renders **bold** markdown as an actual <strong> element, not literal asterisks", () => {
    render(<MarkdownText text="Your **spinach** is expiring today." />);

    const strong = screen.getByText("spinach");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("renders a markdown bullet list as actual <li> elements", () => {
    render(<MarkdownText text={"Pick up:\n- Milk\n- Eggs"} />);

    const items = screen.getAllByRole("listitem");
    expect(items.map((el) => el.textContent)).toEqual(["Milk", "Eggs"]);
  });

  it("renders plain text with no markdown unchanged", () => {
    render(<MarkdownText text="Nothing fancy here." />);

    expect(screen.getByText("Nothing fancy here.")).toBeInTheDocument();
  });

  it("applies the style override to the wrapper", () => {
    const { container } = render(<MarkdownText text="hi" style={{ color: "rgb(22, 50, 92)" }} />);

    expect(container.firstElementChild).toHaveStyle({ color: "rgb(22, 50, 92)" });
  });
});
