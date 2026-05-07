import { Injectable } from '@nestjs/common';
import * as net from 'net';
import { PrintJobDto } from './print-job.dto';

@Injectable()
export class PrintService {
  sendToprinter(dto: PrintJobDto): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const timeout = 8000;

      socket.setTimeout(timeout);

      socket.connect(dto.port, dto.host, () => {
        const buf = Buffer.from(dto.data);
        socket.write(buf, (err) => {
          if (err) {
            socket.destroy();
            return reject(err);
          }
          // Give printer 300ms to receive the last bytes before closing
          setTimeout(() => {
            socket.end();
            resolve();
          }, 300);
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`Bağlantı zaman aşımına uğradı (${dto.host}:${dto.port})`));
      });

      socket.on('error', (err) => {
        socket.destroy();
        reject(err);
      });
    });
  }
}
