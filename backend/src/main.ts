import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { assertProductionEnv, getEnvConfig } from './shared/configs/env-configs';
import { buildValidationPipe } from './shared/validation/validation-pipe';

async function bootstrap() {
  // Before anything is built, so a missing secret is a refusal to start rather than a running
  // server quietly using a fallback that is published in this repository.
  assertProductionEnv();

  // rawBody keeps the exact bytes GitHub signed. Re-serializing the parsed JSON changes key
  // order and whitespace, which changes the HMAC, so webhook verification needs the original.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableShutdownHooks();
  app.enableCors({ origin: '*' });

  const config = new DocumentBuilder().addBearerAuth().setTitle('Proke').build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, documentFactory, { customSiteTitle: 'Proke API Documentation' });

  app.useGlobalPipes(buildValidationPipe());

  await app.init();
  await app.listen(getEnvConfig().app.port);
}
bootstrap();

process.on('uncaughtException', (error) => {
  console.error(error);
});

process.on('unhandledRejection', (error) => {
  console.error(error);
});
