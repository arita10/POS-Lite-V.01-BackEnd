import { IsString, IsInt, IsArray, Min, Max, ArrayNotEmpty } from 'class-validator';

export class PrintJobDto {
  @IsString()
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  // ESC/POS bytes sent as an array of numbers (0-255)
  @IsArray()
  @ArrayNotEmpty()
  data: number[];
}
