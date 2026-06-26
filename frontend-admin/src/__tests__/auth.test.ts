import { getIdToken } from "@/auth";

vi.mock("aws-amplify", () => ({
  Amplify: { configure: vi.fn() },
}));

vi.mock("aws-amplify/auth", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

describe("getIdToken", () => {
  it("returns the id token string when session succeeds", async () => {
    const { fetchAuthSession } = await import("aws-amplify/auth");
    vi.mocked(fetchAuthSession).mockResolvedValueOnce({
      tokens: {
        idToken: { toString: () => "test-id-token" },
      },
    } as never);

    const token = await getIdToken();
    expect(token).toBe("test-id-token");
  });

  it("returns null when tokens are absent", async () => {
    const { fetchAuthSession } = await import("aws-amplify/auth");
    vi.mocked(fetchAuthSession).mockResolvedValueOnce({
      tokens: undefined,
    } as never);

    const token = await getIdToken();
    expect(token).toBeNull();
  });

  it("returns null when fetchAuthSession rejects", async () => {
    const { fetchAuthSession } = await import("aws-amplify/auth");
    vi.mocked(fetchAuthSession).mockRejectedValueOnce(
      new Error("Not authenticated"),
    );

    const token = await getIdToken();
    expect(token).toBeNull();
  });
});
