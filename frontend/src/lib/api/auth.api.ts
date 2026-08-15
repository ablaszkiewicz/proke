import axios from "axios";

export interface LoginResult {
  token: string;
}

export class AuthApi {
  public static async loginGithub(githubCode: string): Promise<LoginResult> {
    const response = await axios.post("/auth/github/login", { githubCode });

    return { token: response.data.token };
  }
}
