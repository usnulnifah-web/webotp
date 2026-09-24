export type SupplierServiceQuery = { serviceCode: string; countryCode: string; operator?: string };
export type SupplierAvailability = { supplierId: number; serviceCode: string; countryCode: string; stock: number; supplierPriceMinor: number; available: boolean; successRateBps: number; responseTimeMs: number; priority: number };
export type SupplierReservation = { supplierActivationId: string; phoneMasked: string; expiresAt: Date };

export interface SupplierInterface {
  getAvailability(query: SupplierServiceQuery): Promise<SupplierAvailability>;
  reserveNumber(query: SupplierServiceQuery): Promise<SupplierReservation>;
  getActivationStatus(supplierActivationId: string): Promise<{ state: "PENDING" | "OTP_RECEIVED" | "SUCCESS" | "CANCELLED" | "TIMEOUT"; otpCode?: string }>;
  cancelActivation(supplierActivationId: string): Promise<{ accepted: boolean }>;
}

export type SupplierConfig = { id: number; name: string; apiUrl?: string; priority: number; timeoutMs: number; status: "active" | "inactive" | "degraded"; successRateBps: number; avgResponseMs: number };

export function scoreSupplier(item: SupplierAvailability) {
  if (!item.available || item.stock <= 0) return -Infinity;
  const stockScore = Math.min(item.stock, 10000) / 100;
  const priceScore = Math.max(0, 100000 - item.supplierPriceMinor) / 1000;
  const successScore = item.successRateBps / 100;
  const speedScore = Math.max(0, 10000 - item.responseTimeMs) / 100;
  return item.priority * 2 + stockScore + priceScore + successScore + speedScore;
}

export class SupplierRouter {
  constructor(private readonly suppliers: SupplierInterface[]) {}
  async choose(query: SupplierServiceQuery) {
    const results = await Promise.all(this.suppliers.map(async supplier => { try { return await supplier.getAvailability(query); } catch { return null; } }));
    return results.filter(Boolean).sort((a, b) => scoreSupplier(b!) - scoreSupplier(a!))[0] ?? null;
  }
}
