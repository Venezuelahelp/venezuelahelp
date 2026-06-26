import { Amplify } from "aws-amplify";
import { signIn, signOut, fetchAuthSession } from "aws-amplify/auth";
import type { RuntimeConfig } from "@/config";

export function configureAuth(cfg: RuntimeConfig): void {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: cfg.userPoolId,
        userPoolClientId: cfg.userPoolClientId,
      },
    },
  });
}

export async function signInUser(
  email: string,
  password: string,
): Promise<ReturnType<typeof signIn>> {
  return signIn({ username: email, password });
}

export async function signOutUser(): Promise<void> {
  await signOut();
}

export async function getIdToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}
