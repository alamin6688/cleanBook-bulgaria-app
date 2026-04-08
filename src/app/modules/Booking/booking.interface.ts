import { WorkType } from "@prisma/client";

export interface IBookingSlotQuery {
  cleanerId: string;
  date: string; // YYYY-MM-DD
  duration?: WorkType;
}

export interface ICreateBooking {
  cleanerId: string;
  propertyCategoryId: string;
  serviceCategoryId: string;
  rooms: number;
  spaceSqft?: number;
  date: string; // YYYY-MM-DD format Date string or ISO string
  startTime: string; // HH:mm format
  endTime?: string; // HH:mm format
  workType: WorkType;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  specialInstructions?: string;
}

export interface IAvailableDateRange {
  availableDates: string[]; // Array of YYYY-MM-DD dates
  workingDays: string[]; // ["Mon", "Tue", "Wed", "Thu", "Fri"]
  workingHours: {
    from: string; // HH:mm format
    to: string; // HH:mm format
  };
}
