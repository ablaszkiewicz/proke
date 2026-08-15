import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayloadDto } from './dto/jwt-payload.dto';

@Injectable()
export class CustomJwtService {
  constructor(private readonly jwtService: JwtService) {}

  public async sign(payload: JwtPayloadDto): Promise<string> {
    return this.jwtService.signAsync(payload);
  }

  public async getTokenPayload(token: string): Promise<JwtPayloadDto | null> {
    try {
      return await this.jwtService.verifyAsync<JwtPayloadDto>(token);
    } catch (e) {
      return null;
    }
  }
}
