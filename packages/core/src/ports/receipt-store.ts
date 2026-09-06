export type ReceiptExtractionReservation =
  | { ok: true; count: number }
  | { ok: false; retryAfter: number }

export type ReceiptStore = {
  reserveReceiptExtraction(input: { userId: string; now?: Date }): Promise<ReceiptExtractionReservation>
}
