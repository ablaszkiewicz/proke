import { INestApplication } from '@nestjs/common';
import { CustomJwtService } from '../../src/auth/custom-jwt/custom-jwt.service';
import { UserSerialized } from '../../src/user/core/entities/user.interface';
import { UserSerializer } from '../../src/user/core/entities/user.serializer';
import { AuthMethod } from '../../src/user/core/enum/auth-method.enum';
import { UserWriteService } from '../../src/user/write/user-write.service';

export class AuthUtils {
  private readonly userWriteService: UserWriteService;
  private readonly jwtService: CustomJwtService;

  constructor(private readonly app: INestApplication<any>) {
    this.userWriteService = this.app.get(UserWriteService);
    this.jwtService = this.app.get(CustomJwtService);
  }

  public async setupUser(dto?: {
    githubId?: string;
    githubLogin?: string;
    email?: string;
    avatarUrl?: string;
    githubAccessToken?: string;
  }): Promise<{
    token: string;
    user: UserSerialized;
  }> {
    const user = await this.userWriteService.create({
      githubId: dto?.githubId ?? `${Math.floor(Math.random() * 1_000_000)}`,
      githubLogin: dto?.githubLogin,
      email: dto?.email ?? `test-${Math.random()}@example.com`,
      authMethod: AuthMethod.Github,
      avatarUrl: dto?.avatarUrl,
      githubAccessToken: dto?.githubAccessToken,
    });

    return {
      token: await this.jwtService.sign({ id: user.id }),
      user: UserSerializer.serialize(user),
    };
  }
}
