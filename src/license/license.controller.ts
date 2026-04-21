import { Controller, Post, Get, Patch, Body, Param, Headers, Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { LicenseService } from './license.service';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Controller('license')
export class LicenseController {
  constructor(
    private licenseService: LicenseService,
    private config: ConfigService,
  ) {}

  // ── Client endpoints ────────────────────────────────────────────────

  @Post('activate')
  activate(
    @Body() body: { key: string; fingerprint: string; label?: string },
    @Req() req: Request,
  ) {
    if (!body.key?.trim())         throw new BadRequestException('key is required');
    if (!body.fingerprint?.trim()) throw new BadRequestException('fingerprint is required');
    if (body.key.length > 64)      throw new BadRequestException('key too long');
    if (body.fingerprint.length > 128) throw new BadRequestException('fingerprint too long');
    return this.licenseService.activate(body.key.trim(), body.fingerprint.trim(), body.label?.trim(), req.ip);
  }

  @Post('checkin')
  checkIn(
    @Body() body: { key: string; fingerprint: string },
    @Req() req: Request,
  ) {
    if (!body.key?.trim())         throw new BadRequestException('key is required');
    if (!body.fingerprint?.trim()) throw new BadRequestException('fingerprint is required');
    return this.licenseService.checkIn(body.key.trim(), body.fingerprint.trim(), req.ip);
  }

  // ── Admin endpoints (protected by ADMIN_KEY header) ─────────────────

  @Post('admin/create')
  createLicense(
    @Headers('x-admin-key') adminKey: string,
    @Body() body: {
      customerName: string;
      customerEmail?: string;
      expiresAt: string;
      maxDevices?: number;
      notes?: string;
    },
  ) {
    this.guardAdmin(adminKey);
    if (!body.customerName?.trim()) throw new BadRequestException('customerName is required');
    if (!body.expiresAt)            throw new BadRequestException('expiresAt is required');
    const expiresAt = new Date(body.expiresAt);
    if (isNaN(expiresAt.getTime())) throw new BadRequestException('expiresAt is not a valid date');
    return this.licenseService.createLicense({
      ...body,
      customerName: body.customerName.trim(),
      expiresAt,
    });
  }

  @Get('admin/list')
  listLicenses(@Headers('x-admin-key') adminKey: string) {
    this.guardAdmin(adminKey);
    return this.licenseService.listLicenses();
  }

  @Get('admin/stats')
  stats(@Headers('x-admin-key') adminKey: string) {
    this.guardAdmin(adminKey);
    return this.licenseService.stats();
  }

  @Patch('admin/:id')
  updateLicense(
    @Headers('x-admin-key') adminKey: string,
    @Param('id') id: string,
    @Body() body: { isActive?: boolean; expiresAt?: string; maxDevices?: number; notes?: string },
  ) {
    this.guardAdmin(adminKey);
    let expiresAt: Date | undefined;
    if (body.expiresAt) {
      expiresAt = new Date(body.expiresAt);
      if (isNaN(expiresAt.getTime())) throw new BadRequestException('expiresAt is not a valid date');
    }
    return this.licenseService.updateLicense(id, { ...body, expiresAt });
  }

  @Patch('admin/device/:deviceId/revoke')
  revokeDevice(
    @Headers('x-admin-key') adminKey: string,
    @Param('deviceId') deviceId: string,
  ) {
    this.guardAdmin(adminKey);
    return this.licenseService.revokeDevice(deviceId);
  }

  private guardAdmin(key: string) {
    if (!key || key !== this.config.get('ADMIN_KEY')) throw new UnauthorizedException('Invalid admin key');
  }
}
