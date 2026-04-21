import { Injectable, UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface LicenseToken {
  sub:            string;   // fingerprint — Supabase reads this as auth.uid()
  licenseId:      string;
  shopId:         string;
  key:            string;
  customerName:   string;
  fingerprint:    string;
  expiresAt:      string;
  issuedAt:       string;
  tokenExpiresAt: string;
}

// Supabase table row shapes
interface SbLicense {
  id:             string;
  shop_id:        string;
  key:            string;
  customer_name:  string;
  customer_email: string | null;
  expires_at:     string;
  is_active:      boolean;
  max_devices:    number;
  notes:          string | null;
  created_at:     string;
  updated_at:     string;
}

interface SbDevice {
  id:           string;
  license_id:   string;
  fingerprint:  string;
  label:        string | null;
  last_seen_at: string;
  is_active:    boolean;
  created_at:   string;
}

interface SbCheckIn {
  id:          string;
  license_id:  string;
  fingerprint: string;
  ip:          string | null;
  checked_at:  string;
}

@Injectable()
export class LicenseService {
  private url: string;
  private key: string;

  constructor(
    private jwt:    JwtService,
    private config: ConfigService,
  ) {
    this.url = this.config.get('SUPABASE_URL') ?? '';
    this.key = this.config.get('SUPABASE_SERVICE_KEY') ?? '';

    if (!this.url || !this.key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    }
    console.log(`[License] Supabase backend: ${this.url}`);
  }

  // ── Core fetch helpers ───────────────────────────────────────────────────

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type':  'application/json',
      apikey:           this.key,
      Authorization:   `Bearer ${this.key}`,
      ...extra,
    };
  }

  private async sbGet<T>(path: string): Promise<T[]> {
    const res = await fetch(`${this.url}/rest/v1/${path}`, {
      headers: { ...this.headers(), Prefer: 'return=representation' },
    });
    if (!res.ok) throw new Error(`Supabase GET ${path}: ${await res.text()}`);
    return res.json();
  }

  private async sbPost<T>(table: string, body: Record<string, unknown>, returning = true): Promise<T> {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method:  'POST',
      headers: { ...this.headers(), Prefer: returning ? 'return=representation' : 'return=minimal' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Supabase POST ${table}: ${await res.text()}`);
    if (!returning) return {} as T;
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
  }

  private async sbPatch<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.url}/rest/v1/${path}`, {
      method:  'PATCH',
      headers: { ...this.headers(), Prefer: 'return=representation' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Supabase PATCH ${path}: ${await res.text()}`);
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
  }

  private async sbUpsert<T>(table: string, body: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]> {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method:  'POST',
      headers: { ...this.headers(), Prefer: 'resolution=merge-duplicates,return=representation' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Supabase UPSERT ${table}: ${await res.text()}`);
    return res.json();
  }

  // ── Admin: create license ────────────────────────────────────────────────
  async createLicense(dto: {
    customerName:   string;
    customerEmail?: string;
    expiresAt:      Date;
    maxDevices?:    number;
    notes?:         string;
  }) {
    const key = `POS-${randomUUID().toUpperCase().replace(/-/g, '').slice(0, 16)}`;
    const lic = await this.sbPost<SbLicense>('pos_licenses', {
      key,
      customer_name:  dto.customerName,
      customer_email: dto.customerEmail ?? null,
      expires_at:     dto.expiresAt.toISOString(),
      max_devices:    dto.maxDevices ?? 2,
      notes:          dto.notes ?? null,
    });
    return this.toDto(lic);
  }

  // ── Admin: list all licenses with device counts ──────────────────────────
  async listLicenses() {
    const [licenses, devices] = await Promise.all([
      this.sbGet<SbLicense>('pos_licenses?order=created_at.desc'),
      this.sbGet<SbDevice>('pos_devices?order=created_at.desc'),
    ]);

    const checkinCounts = await this.sbGet<{ license_id: string }>(
      'pos_checkins?select=license_id',
    ).then((rows) => {
      const map: Record<string, number> = {};
      for (const r of rows) map[r.license_id] = (map[r.license_id] ?? 0) + 1;
      return map;
    });

    return licenses.map((lic) => ({
      id:            lic.id,
      shopId:        lic.shop_id,
      key:           lic.key,
      customerName:  lic.customer_name,
      customerEmail: lic.customer_email,
      expiresAt:     lic.expires_at,
      isActive:      lic.is_active,
      maxDevices:    lic.max_devices,
      notes:         lic.notes,
      createdAt:     lic.created_at,
      devices: devices.filter((d) => d.license_id === lic.id).map((d) => ({
        id:          d.id,
        licenseId:   d.license_id,
        fingerprint: d.fingerprint,
        label:       d.label,
        lastSeenAt:  d.last_seen_at,
        isActive:    d.is_active,
        createdAt:   d.created_at,
      })),
      _count: { checkIns: checkinCounts[lic.id] ?? 0 },
    }));
  }

  // ── Admin: update / revoke license ──────────────────────────────────────
  async updateLicense(id: string, dto: {
    isActive?:   boolean;
    expiresAt?:  Date;
    maxDevices?: number;
    notes?:      string;
  }) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.isActive   !== undefined) patch.is_active   = dto.isActive;
    if (dto.expiresAt  !== undefined) patch.expires_at  = dto.expiresAt.toISOString();
    if (dto.maxDevices !== undefined) patch.max_devices = dto.maxDevices;
    if (dto.notes      !== undefined) patch.notes       = dto.notes;

    const updated = await this.sbPatch<SbLicense>(`pos_licenses?id=eq.${id}`, patch);

    // If revoking, deactivate all devices for this license
    if (dto.isActive === false) {
      await fetch(`${this.url}/rest/v1/pos_devices?license_id=eq.${id}`, {
        method:  'PATCH',
        headers: this.headers(),
        body:    JSON.stringify({ is_active: false }),
      });
    }

    return this.toDto(updated);
  }

  // ── Admin: revoke a specific device ─────────────────────────────────────
  async revokeDevice(deviceId: string) {
    const rows = await this.sbGet<SbDevice>(`pos_devices?id=eq.${deviceId}`);
    if (!rows.length) throw new NotFoundException('Device not found');
    const dev = await this.sbPatch<SbDevice>(`pos_devices?id=eq.${deviceId}`, { is_active: false });
    return { id: dev.id, licenseId: dev.license_id, fingerprint: dev.fingerprint, isActive: dev.is_active };
  }

  // ── Client: first-time activation ───────────────────────────────────────
  async activate(key: string, fingerprint: string, label?: string, ip?: string) {
    // Load license
    const licenses = await this.sbGet<SbLicense>(`pos_licenses?key=eq.${encodeURIComponent(key)}`);
    if (!licenses.length)       throw new UnauthorizedException('Geçersiz lisans anahtarı.');
    const lic = licenses[0];
    if (!lic.is_active)         throw new ForbiddenException('Bu lisans iptal edilmiş.');
    if (new Date() > new Date(lic.expires_at)) throw new ForbiddenException('Lisans süresi dolmuş. Lütfen yenileyin.');

    // Check existing device
    const existingDevices = await this.sbGet<SbDevice>(
      `pos_devices?license_id=eq.${lic.id}&fingerprint=eq.${encodeURIComponent(fingerprint)}`,
    );

    if (existingDevices.length) {
      const dev = existingDevices[0];
      if (!dev.is_active) throw new ForbiddenException('Bu cihaz engellendi.');
      await this.sbPatch(`pos_devices?id=eq.${dev.id}`, { last_seen_at: new Date().toISOString() });
    } else {
      // Count active devices against limit
      const activeDevices = await this.sbGet<SbDevice>(
        `pos_devices?license_id=eq.${lic.id}&is_active=eq.true`,
      );
      if (activeDevices.length >= lic.max_devices) {
        throw new ForbiddenException(`Maksimum cihaz sayısına ulaşıldı (${lic.max_devices}).`);
      }
      await this.sbPost('pos_devices', {
        license_id:  lic.id,
        fingerprint,
        label:       label ?? null,
      }, false);
    }

    // Log checkin
    await this.sbPost('pos_checkins', { license_id: lic.id, fingerprint, ip: ip ?? null }, false);

    const { token, tokenExpiresAt } = this.issueToken(lic, fingerprint);

    // Sync pos_shops + pos_licensed_devices so RLS function pos_get_shop_id() works
    this.syncDeviceToSupabase(lic, fingerprint, tokenExpiresAt).catch((e) =>
      console.error('[Supabase] syncDevice failed on activate:', e.message),
    );

    return { token, expiresAt: lic.expires_at, shopId: lic.shop_id };
  }

  // ── Client: periodic check-in ────────────────────────────────────────────
  async checkIn(key: string, fingerprint: string, ip?: string) {
    const licenses = await this.sbGet<SbLicense>(`pos_licenses?key=eq.${encodeURIComponent(key)}`);
    if (!licenses.length)       throw new UnauthorizedException('Geçersiz lisans anahtarı.');
    const lic = licenses[0];
    if (!lic.is_active)         throw new ForbiddenException('Bu lisans iptal edilmiş.');
    if (new Date() > new Date(lic.expires_at)) throw new ForbiddenException('Lisans süresi dolmuş.');

    const devices = await this.sbGet<SbDevice>(
      `pos_devices?license_id=eq.${lic.id}&fingerprint=eq.${encodeURIComponent(fingerprint)}`,
    );
    if (!devices.length || !devices[0].is_active) {
      throw new ForbiddenException('Bu cihaz kayıtlı değil veya engellendi.');
    }

    await this.sbPatch(`pos_devices?id=eq.${devices[0].id}`, { last_seen_at: new Date().toISOString() });
    await this.sbPost('pos_checkins', { license_id: lic.id, fingerprint, ip: ip ?? null }, false);

    const { token, tokenExpiresAt } = this.issueToken(lic, fingerprint);

    this.syncDeviceToSupabase(lic, fingerprint, tokenExpiresAt).catch((e) =>
      console.error('[Supabase] syncDevice failed on checkin:', e.message),
    );

    return { token, expiresAt: lic.expires_at, shopId: lic.shop_id };
  }

  // ── Admin: stats ─────────────────────────────────────────────────────────
  async stats() {
    const now = new Date().toISOString();
    const [all, activeDevices] = await Promise.all([
      this.sbGet<SbLicense>('pos_licenses'),
      this.sbGet<SbDevice>('pos_devices?is_active=eq.true'),
    ]);
    const total   = all.length;
    const active  = all.filter((l) => l.is_active && l.expires_at > now).length;
    const expired = all.filter((l) => !l.is_active || l.expires_at < now).length;
    return { total, active, expired, activeDevices: activeDevices.length };
  }

  // ── snake_case → camelCase DTO ───────────────────────────────────────────
  private toDto(lic: SbLicense) {
    return {
      id:            lic.id,
      shopId:        lic.shop_id,
      key:           lic.key,
      customerName:  lic.customer_name,
      customerEmail: lic.customer_email,
      expiresAt:     lic.expires_at,
      isActive:      lic.is_active,
      maxDevices:    lic.max_devices,
      notes:         lic.notes,
      createdAt:     lic.created_at,
      updatedAt:     lic.updated_at,
    };
  }

  // ── Sync pos_shops + pos_licensed_devices (required for RLS) ───────────
  // pos_get_shop_id(auth.uid()) queries pos_licensed_devices by device_id.
  // Without this row the RLS function returns NULL and all writes are blocked.
  private async syncDeviceToSupabase(
    lic: SbLicense,
    fingerprint: string,
    tokenExpiresAt: Date,
  ): Promise<void> {
    // 1. Ensure pos_shops row exists
    await this.sbUpsert('pos_shops', [{
      shop_id:       lic.shop_id,
      license_key:   lic.key,
      customer_name: lic.customer_name,
      updated_at:    new Date().toISOString(),
    }]);

    // 2. Upsert pos_licensed_devices so RLS pos_get_shop_id(device_id) works
    await this.sbUpsert('pos_licensed_devices', [{
      device_id:          fingerprint,
      shop_id:            lic.shop_id,
      license_key:        lic.key,
      customer_name:      lic.customer_name,
      is_active:          lic.is_active,
      license_expires_at: lic.expires_at,
      token_expires_at:   tokenExpiresAt.toISOString(),
      last_checkin_at:    new Date().toISOString(),
    }]);
  }

  // ── Issue a 30-day JWT ───────────────────────────────────────────────────
  private issueToken(
    lic: SbLicense,
    fingerprint: string,
  ): { token: string; tokenExpiresAt: Date } {
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30);
    const licExpiry = new Date(lic.expires_at);
    const effectiveExpiry = tokenExpiresAt < licExpiry ? tokenExpiresAt : licExpiry;

    const payload: LicenseToken = {
      sub:            fingerprint,   // ← Supabase auth.uid() reads this claim
      licenseId:      lic.id,
      shopId:         lic.shop_id,
      key:            lic.key,
      customerName:   lic.customer_name,
      fingerprint,
      expiresAt:      lic.expires_at,
      issuedAt:       new Date().toISOString(),
      tokenExpiresAt: effectiveExpiry.toISOString(),
    };

    const token = this.jwt.sign(payload, {
      expiresIn: Math.floor((effectiveExpiry.getTime() - Date.now()) / 1000),
    });

    return { token, tokenExpiresAt: effectiveExpiry };
  }
}
