import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Config } from "@/components/Config";
import type { Config as ConfigType } from "@/types";

const defaultConfig: ConfigType = {
  botTriggerMode: "mention",
  bedrockModelId: "anthropic.claude-3-sonnet",
  systemPrompt: "Eres un asistente útil",
  scrapeRateMin: 60,
};

describe("Config", () => {
  it("renders form fields initialized from config prop", () => {
    render(<Config config={defaultConfig} onSave={vi.fn()} saving={false} />);

    expect(screen.getByDisplayValue("mention")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("anthropic.claude-3-sonnet"),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Eres un asistente útil"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("60")).toBeInTheDocument();
  });

  it("calls onSave with updated config when form is submitted", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Config config={defaultConfig} onSave={onSave} saving={false} />);

    const modelInput = screen.getByDisplayValue("anthropic.claude-3-sonnet");
    await user.clear(modelInput);
    await user.type(modelInput, "anthropic.claude-v2");

    await user.click(screen.getByRole("button", { name: /Guardar cambios/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ bedrockModelId: "anthropic.claude-v2" }),
    );
  });

  it("includes all unchanged fields in the onSave payload", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Config config={defaultConfig} onSave={onSave} saving={false} />);

    await user.click(screen.getByRole("button", { name: /Guardar cambios/i }));

    expect(onSave).toHaveBeenCalledWith(defaultConfig);
  });

  it("disables Guardar cambios button while saving", () => {
    render(<Config config={defaultConfig} onSave={vi.fn()} saving={true} />);

    expect(
      screen.getByRole("button", { name: /Guardar cambios/i }),
    ).toBeDisabled();
  });

  it("enables Guardar cambios button when not saving", () => {
    render(<Config config={defaultConfig} onSave={vi.fn()} saving={false} />);

    expect(
      screen.getByRole("button", { name: /Guardar cambios/i }),
    ).not.toBeDisabled();
  });

  it("has accessible label for botTriggerMode select", () => {
    render(<Config config={defaultConfig} onSave={vi.fn()} saving={false} />);

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    // label must be associated (getByLabelText throws if not accessible)
    expect(
      screen.getByLabelText(/modo.*bot|bot.*trigger|activación/i),
    ).toBeInTheDocument();
  });

  it("constrains scrapeRateMin to min 5 and max 1440", () => {
    render(<Config config={defaultConfig} onSave={vi.fn()} saving={false} />);

    const numberInput = screen.getByRole("spinbutton");
    expect(numberInput).toHaveAttribute("min", "5");
    expect(numberInput).toHaveAttribute("max", "1440");
  });

  it("updates botTriggerMode when select changes", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Config config={defaultConfig} onSave={onSave} saving={false} />);

    await user.selectOptions(screen.getByRole("combobox"), "command");
    await user.click(screen.getByRole("button", { name: /Guardar cambios/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ botTriggerMode: "command" }),
    );
  });
});
