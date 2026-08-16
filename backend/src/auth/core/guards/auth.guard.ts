import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserWriteService } from '../../../user/write/user-write.service';
import { CustomJwtService } from '../../custom-jwt/custom-jwt.service';
import { IS_PUBLIC_KEY } from '../decorators/is-public';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: CustomJwtService,
    private readonly userWriteService: UserWriteService,
    private reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    const payload = await this.jwtService.getTokenPayload(token);

    if (!payload) {
      throw new UnauthorizedException();
    }

    request['user'] = payload;

    // The only place that sees every authenticated request, so it is the only place that can
    // say when somebody was last here. Self-throttling to once an hour inside the service, so
    // this is one indexed lookup that usually matches nothing rather than a write per request.
    await this.userWriteService.recordActivity(payload.id);

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = (request.headers as any).authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
