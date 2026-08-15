import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { getEnvConfig } from './shared/configs/env-configs';

async function bootstrap() {
  // rawBody keeps the exact bytes GitHub signed. Re-serializing the parsed JSON changes key
  // order and whitespace, which changes the HMAC, so webhook verification needs the original.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableShutdownHooks();
  app.enableCors({ origin: '*' });

  const config = new DocumentBuilder().addBearerAuth().setTitle('Proke').build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, documentFactory, { customSiteTitle: 'Proke API Documentation' });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

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
