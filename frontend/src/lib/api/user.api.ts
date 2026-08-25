import axios from "axios";
import type { InboxFilters } from "./inbox.api";

export interface User {
  id: string;
  githubId?: string;
  githubLogin?: string;
  email?: string;
  authMethod?: string;
  avatarUrl?: string;
  /**
   * How this person has the inbox set, complete - the server fills in the defaults for anything
   * they have never touched. Carried on the profile rather than fetched by the inbox, because
   * the profile is read before any page under `/app` renders, so the inbox opens on the right
   * settings without a request of its own in front of its first paint.
   */
  inboxSettings: InboxFilters;
}

export class UserApi {
  public static async getMe(jwtToken: string): Promise<User> {
    const response = await axios.get<User>("/users/me", {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    });

    return response.data;
  }
}
