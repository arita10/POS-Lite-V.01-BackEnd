import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { LicenseModule } from './license/license.module';
import { PrintModule } from './print/print.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/admin',
      serveStaticOptions: { index: 'admin.html' },
    }),
    LicenseModule,
    PrintModule,
  ],
})
export class AppModule {}
