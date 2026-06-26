import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pagination, { pageList } from "@/components/Pagination";

describe("pageList", () => {
  it("returns every page when total <= 7", () => {
    expect(pageList(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("windows around the current page with ellipses", () => {
    expect(pageList(50, 179)).toEqual([1, "…", 49, 50, 51, "…", 179]);
  });

  it("collapses to a leading run near the start", () => {
    expect(pageList(2, 179)).toEqual([1, 2, 3, "…", 179]);
  });

  it("collapses to a trailing run near the end", () => {
    expect(pageList(179, 179)).toEqual([1, "…", 178, 179]);
  });
});

describe("Pagination", () => {
  it("disables the previous arrow on the first page", () => {
    render(<Pagination page={1} totalPages={5} onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: /página anterior/i }),
    ).toBeDisabled();
  });

  it("disables the next arrow on the last page", () => {
    render(<Pagination page={5} totalPages={5} onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: /página siguiente/i }),
    ).toBeDisabled();
  });

  it("marks the current page with aria-current", () => {
    render(<Pagination page={3} totalPages={5} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Página 3" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("calls onChange when clicking next", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={2} totalPages={5} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /página siguiente/i }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("calls onChange with the clicked page number", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={1} totalPages={5} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Página 4" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
