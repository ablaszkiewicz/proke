import axios from "axios";

export interface LoginResult {
  token: string;
}

export class AuthApi {
  public static async loginGithub(githubCode: string): Promise<LoginResult> {
    try {
      const response = await axios.post("/auth/github/login", { githubCode });

      return { token: response.data.token };
    } catch (error) {
      // Some logins are refused on purpose - an account that is not on the allowlist, an
      // expired code - and the backend says which. Axios' own "Request failed with status
      // code 403" would throw that away and leave the screen showing something the reader
      // cannot act on.
      throw new Error(readLoginError(error));
    }
  }
}

function readLoginError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "GitHub login failed";
  }

  const message = error.response?.data?.message;

  // Nest answers with a string for most failures and an array for validation ones.
  if (Array.isArray(message)) {
    return message.join(", ");
  }

  if (typeof message === "string" && message.length > 0) {
    return message;
  }

  return "GitHub login failed";
}
