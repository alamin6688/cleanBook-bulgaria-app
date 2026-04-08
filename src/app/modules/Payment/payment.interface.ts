export interface ICreatePaymentIntent {
  bookingId: string;
  amount: number; // in cents (stripe format)
  currency?: string;
  description?: string;
}

export interface IProcessPayment {
  bookingId: string;
  paymentMethodId: string;
  amount: number;
}

export interface IPaymentMetadata {
  bookingId: string;
  customerId: string;
  cleanerId: string;
  serviceName: string;
  bookingDate: string;
}
