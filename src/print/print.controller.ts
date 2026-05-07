import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { PrintService } from './print.service';
import { PrintJobDto } from './print-job.dto';

@Controller('print')
export class PrintController {
  constructor(private readonly printService: PrintService) {}

  @Post()
  async print(@Body() dto: PrintJobDto) {
    try {
      await this.printService.sendToprinter(dto);
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpException(`Yazıcı hatası: ${msg}`, HttpStatus.BAD_GATEWAY);
    }
  }
}
