import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Login } from "@/components/Login";

vi.mock("@/auth", () => ({
  signInUser: vi.fn(),
}));

async function getSignInUser() {
  const { signInUser } = await import("@/auth");
  return vi.mocked(signInUser);
}

describe("Login", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the admin heading", () => {
    render(<Login onAuthed={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: /Administración/i }),
    ).toBeInTheDocument();
  });

  it("renders email and password inputs with labels", () => {
    render(<Login onAuthed={vi.fn()} />);
    expect(screen.getByLabelText(/correo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
  });

  it("calls signInUser with typed email and password on submit", async () => {
    const signInUser = await getSignInUser();
    signInUser.mockResolvedValue({} as never);

    const user = userEvent.setup();
    render(<Login onAuthed={vi.fn()} />);

    await user.type(screen.getByLabelText(/correo/i), "admin@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "secret123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(signInUser).toHaveBeenCalledWith("admin@test.com", "secret123");
  });

  it("calls onAuthed on successful sign-in", async () => {
    const signInUser = await getSignInUser();
    signInUser.mockResolvedValue({} as never);

    const onAuthed = vi.fn();
    const user = userEvent.setup();
    render(<Login onAuthed={onAuthed} />);

    await user.type(screen.getByLabelText(/correo/i), "admin@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "secret123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(onAuthed).toHaveBeenCalledTimes(1);
  });

  it("shows an error message when sign-in fails", async () => {
    const signInUser = await getSignInUser();
    signInUser.mockRejectedValue(new Error("Incorrect username or password."));

    const user = userEvent.setup();
    render(<Login onAuthed={vi.fn()} />);

    await user.type(screen.getByLabelText(/correo/i), "admin@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("does not call onAuthed when sign-in fails", async () => {
    const signInUser = await getSignInUser();
    signInUser.mockRejectedValue(new Error("Incorrect username or password."));

    const onAuthed = vi.fn();
    const user = userEvent.setup();
    render(<Login onAuthed={onAuthed} />);

    await user.type(screen.getByLabelText(/correo/i), "admin@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await screen.findByRole("alert");
    expect(onAuthed).not.toHaveBeenCalled();
  });
});
