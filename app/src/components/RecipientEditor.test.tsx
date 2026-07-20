/** @vitest-environment jsdom */
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RecipientEditor, { Row, duplicateValues } from "./RecipientEditor";

const ADDRESS = "G".concat("B".repeat(55));

function Harness({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  return <RecipientEditor rows={rows} onChange={setRows} />;
}

afterEach(cleanup);

describe("RecipientEditor duplicate-recipient warning", () => {
  it("warns when the same recipient address is entered twice", () => {
    render(
      <Harness
        initial={[
          { kind: "address", value: "", percent: "50" },
          { kind: "address", value: "", percent: "50" },
        ]}
      />,
    );

    const inputs = screen.getAllByPlaceholderText("G… recipient address");
    fireEvent.change(inputs[0], { target: { value: ADDRESS } });
    fireEvent.change(inputs[1], { target: { value: ADDRESS } });

    const warning = screen.getByRole("alert");
    expect(warning.textContent).toContain("Duplicate recipient");
    expect(warning.textContent).toContain(ADDRESS);
  });

  it("shows no warning for distinct or empty recipients", () => {
    render(
      <Harness
        initial={[
          { kind: "address", value: ADDRESS, percent: "50" },
          { kind: "address", value: "", percent: "50" },
        ]}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears the warning when one duplicate is edited away", () => {
    render(
      <Harness
        initial={[
          { kind: "address", value: ADDRESS, percent: "50" },
          { kind: "address", value: ADDRESS, percent: "50" },
        ]}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();

    const inputs = screen.getAllByPlaceholderText("G… recipient address");
    fireEvent.change(inputs[1], { target: { value: "G".concat("C".repeat(55)) } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats an address and a split id with the same text as different", () => {
    expect(
      duplicateValues([
        { kind: "address", value: "7", percent: "50" },
        { kind: "split", value: "7", percent: "50" },
      ]),
    ).toEqual([]);
    expect(
      duplicateValues([
        { kind: "split", value: "7", percent: "50" },
        { kind: "split", value: " 7 ", percent: "50" },
      ]),
    ).toEqual(["7"]);
  });
});
