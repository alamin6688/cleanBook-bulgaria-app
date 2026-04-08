import httpStatus from "http-status";
import ApiError from "../../../errors/apiError";
import prisma from "../../../lib/prisma";
import { IBookingSlotQuery, ICreateBooking } from "./booking.interface";
import { BookingStatus, WorkType } from "@prisma/client";
import {
  addMinutes,
  addDays,
  format,
  isAfter,
  isBefore,
  parse,
  startOfDay,
  isWithinInterval,
} from "date-fns";

const WORK_TYPE_HOURS: Record<WorkType, number> = {
  FULL_DAY: 8,
  HALF_DAY: 4,
  QUARTER_DAY: 2,
};

const parseTime = (timeStr: string, refDate: Date) => {
  return timeStr.toLowerCase().includes('m') 
    ? parse(timeStr, "hh:mm a", refDate) 
    : parse(timeStr, "HH:mm", refDate);
};

const formatTime = (date: Date) => {
  return format(date, "hh:mm a");
};

// Helper function to get next available dates for a cleaner
const getNextAvailableDates = async (
  cleanerId: string,
  daysAhead: number = 60,
  maxDates: number = 60
): Promise<{ dates: string[]; workingDays: string[]; workFrom: string; workTo: string }> => {
  const cleaner = await prisma.user.findFirst({
    where: { id: cleanerId, role: "CLEANER" },
    include: { cleanerProfile: true },
  });

  if (!cleaner || !cleaner.cleanerProfile) {
    throw new ApiError(httpStatus.NOT_FOUND, "Cleaner not found");
  }

  const profile = cleaner.cleanerProfile;
  const availableDates: string[] = [];
  let currentDate = startOfDay(new Date());

  for (let i = 0; i < daysAhead && availableDates.length < maxDates; i++) {
    const checkDate = addDays(currentDate, i);
    const dayName = format(checkDate, "EEE");

    const isBlocked = profile.blockOffDates.some(
      (d) => format(d, "yyyy-MM-dd") === format(checkDate, "yyyy-MM-dd")
    );

    if (profile.workingDays.includes(dayName) && !isBlocked) {
      availableDates.push(format(checkDate, "yyyy-MM-dd"));
    }
  }

  return {
    dates: availableDates,
    workingDays: profile.workingDays,
    workFrom: profile.workFrom || "08:00 AM",
    workTo: profile.workTo || "06:00 PM",
  };
};

const getAvailableSlots = async (query: IBookingSlotQuery) => {
  const { cleanerId, date, duration } = query;
  const bookingDate = new Date(date);

  const cleaner = await prisma.user.findFirst({
    where: { id: cleanerId, role: "CLEANER" },
    include: {
      cleanerProfile: {
        include: { services: true },
      },
    },
  });

  if (!cleaner || !cleaner.cleanerProfile) {
    throw new ApiError(httpStatus.NOT_FOUND, "Cleaner not found");
  }

  const profile = cleaner.cleanerProfile;
  const dayName = format(bookingDate, "EEE"); // "Mon", "Tue"...

  // Get available dates for error message
  const availabilityData = await getNextAvailableDates(cleanerId);

  // 1. Check if it's a working day
  if (!profile.workingDays.includes(dayName)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `This cleaner does not work on ${dayName}. Working schedule: ${availabilityData.workingDays.join(", ")} (${availabilityData.workFrom} - ${availabilityData.workTo}).`
    );
  }

  // 2. Check if it's a blocked date
  const isBlocked = profile.blockOffDates.some(
    (d) => format(d, "yyyy-MM-dd") === format(bookingDate, "yyyy-MM-dd")
  );
  if (isBlocked) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `This cleaner is not available on ${format(
        bookingDate,
        "yyyy-MM-dd"
      )}. Next available dates: ${availabilityData.dates.slice(0, 3).join(", ")}...`
    );
  }

  // 3. Generate slots
  const workFrom = profile.workFrom || "08:00 AM";
  const workTo = profile.workTo || "06:00 PM";
  const intervalMinutes = 60; // Slots start every hour

  const requestedWorkType = duration || profile.workType;
  const slotDurationHours = WORK_TYPE_HOURS[requestedWorkType];

  const startTimeLimit = parseTime(workFrom, bookingDate);
  const endTimeLimit = parseTime(workTo, bookingDate);

  // Get existing bookings for this cleaner on this date
  const existingBookings = await prisma.booking.findMany({
    where: {
      cleanerId,
      date: {
        gte: startOfDay(bookingDate),
        lt: addMinutes(startOfDay(bookingDate), 1440),
      },
      status: { not: BookingStatus.CANCELLED },
    },
  });

  const slots = [];
  let currentSlotStart = startTimeLimit;

  while (
    isBefore(addMinutes(currentSlotStart, slotDurationHours * 60), addMinutes(endTimeLimit, 1))
  ) {
    const slotEnd = addMinutes(currentSlotStart, slotDurationHours * 60);
    const slotStartStr = formatTime(currentSlotStart);
    const slotEndStr = formatTime(slotEnd);

    // Check overlap with existing bookings
    const conflictingBooking = existingBookings.find((booking) => {
      const bStart = parseTime(booking.startTime, bookingDate);
      const bEnd = parseTime(booking.endTime, bookingDate);

      return isBefore(currentSlotStart, bEnd) && isAfter(slotEnd, bStart);
    });

    const isAvailable = !conflictingBooking;
    const status = isAvailable ? "AVAILABLE" : "BOOKED";

    slots.push({
      startTime: slotStartStr,
      endTime: slotEndStr,
      isAvailable,
      status,
      workType: requestedWorkType,
      duration: slotDurationHours,
    });

    currentSlotStart = addMinutes(currentSlotStart, intervalMinutes);
  }

  if (slots.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `No slots can accommodate a ${slotDurationHours}-hour session between ${workFrom} and ${workTo}. Next available: ${availabilityData.dates.slice(0, 3).join(", ")}...`
    );
  }

  return {
    cleanerId,
    date,
    workType: requestedWorkType,
    workFrom,
    workTo,
    blockOffDates: profile.blockOffDates,
    nextAvailableDates: availabilityData.dates,
    slots,
  };
};

const createBooking = async (userId: string, data: ICreateBooking) => {
  const {
    cleanerId,
    serviceCategoryId,
    propertyCategoryId,
    date,
    startTime,
    workType,
    rooms,
    spaceSqft,
    address,
    city,
    latitude,
    longitude,
    specialInstructions,
  } = data;

  const bookingDate = new Date(date);
  const cleaner = await prisma.user.findFirst({
    where: { id: cleanerId, role: "CLEANER" },
    include: {
      cleanerProfile: {
        include: {
          services: {
            where: { serviceCategoryId },
          },
        },
      },
    },
  });

  if (!cleaner || !cleaner.cleanerProfile) {
    throw new ApiError(httpStatus.NOT_FOUND, "Cleaner not found");
  }

  const profile = cleaner.cleanerProfile;
  if (!profile.propertyTypeIds.includes(propertyCategoryId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Cleaner does not serve the selected property type");
  }

  const service = profile.services[0];
  if (!service) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Cleaner does not provide this service category");
  }

  const dayName = format(bookingDate, "EEE");
  const availabilityData = await getNextAvailableDates(cleanerId, 30, 10); // limited to 10 for error message

  // 1. Check Working Day
  if (!profile.workingDays.includes(dayName)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cleaner does not work on ${dayName}. Working schedule: ${availabilityData.workingDays.join(", ")} (${availabilityData.workFrom} - ${availabilityData.workTo}).`
    );
  }

  // 2. Check Blocked Date
  const isBlocked = profile.blockOffDates.some(
    (d) => format(d, "yyyy-MM-dd") === format(bookingDate, "yyyy-MM-dd")
  );
  if (isBlocked) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cleaner is not available on ${format(bookingDate, "yyyy-MM-dd")}. Next available: ${availabilityData.dates.slice(0, 3).join(", ")}...`
    );
  }

  // 3. Check Duration and End Time
  const slotDurationHours = WORK_TYPE_HOURS[workType];
  const startDateTime = parseTime(startTime, bookingDate);
  const endDateTime = addMinutes(startDateTime, slotDurationHours * 60);
  const endTime = formatTime(endDateTime);

  const workFromLimit = parseTime(profile.workFrom || "08:00 AM", bookingDate);
  const workToLimit = parseTime(profile.workTo || "06:00 PM", bookingDate);

  if (isBefore(startDateTime, workFromLimit) || isAfter(endDateTime, workToLimit)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Selected time is outside cleaner's working hours (${availabilityData.workFrom} - ${
        availabilityData.workTo
      }). Next available: ${availabilityData.dates.slice(0, 3).join(", ")}...`
    );
  }

  // 4. Validate Slot Availability (Overlaps)
  const existingBookings = await prisma.booking.findMany({
    where: {
      cleanerId,
      date: {
        gte: startOfDay(bookingDate),
        lt: addMinutes(startOfDay(bookingDate), 1440),
      },
      status: { not: BookingStatus.CANCELLED },
    },
  });

  const overlap = existingBookings.find((booking) => {
    const bStart = parseTime(booking.startTime, bookingDate);
    const bEnd = parseTime(booking.endTime, bookingDate);
    return isBefore(startDateTime, bEnd) && isAfter(endDateTime, bStart);
  });

  if (overlap) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `The selected time slot (${startTime} - ${endTime}) overlaps with an existing booking. Please check available slots.`
    );
  }

  // Calculate Charges
  const charge = service.pricePerHour * slotDurationHours;
  const platformCharge = charge * 0.05; // 5% platform fee
  const totalCharge = charge + platformCharge;

  const booking = await prisma.booking.create({
    data: {
      customerId: userId,
      cleanerId,
      propertyCategoryId,
      serviceCategoryId,
      rooms,
      spaceSqft,
      date: bookingDate,
      startTime,
      endTime,
      workType,
      address,
      city,
      latitude,
      longitude,
      specialInstructions,
      charge,
      platformCharge,
      totalCharge,
      status: BookingStatus.PENDING,
      paymentStatus: "PENDING",
    },
    include: {
      cleaner: {
        select: {
          name: true,
          avatar: true,
          email: true,
          phone: true,
          cleanerProfile: {
            select: {
              displayName: true,
              profilePhoto: true,
              avgRating: true,
              bio: true,
            },
          },
        },
      },
      customer: {
        select: {
          name: true,
          email: true,
          phone: true,
        },
      },
      propertyCategory: true,
      serviceCategory: true,
    },
  });

  return booking;
};

const getMyBookings = async (userId: string, role: string) => {
  const where: any = {};
  if (role === "CUSTOMER") {
    where.customerId = userId;
  } else if (role === "CLEANER") {
    where.cleanerId = userId;
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      cleaner: {
        select: {
          name: true,
          avatar: true,
          cleanerProfile: {
            select: { displayName: true, profilePhoto: true },
          },
        },
      },
      customer: {
        select: { name: true, email: true },
      },
      propertyCategory: true,
      serviceCategory: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return bookings;
};

const getBookingById = async (id: string, userId: string, role: string) => {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      cleaner: {
        select: {
          name: true,
          avatar: true,
          cleanerProfile: {
            select: { displayName: true, profilePhoto: true, avgRating: true },
          },
        },
      },
      customer: {
        select: { name: true, email: true },
      },
      propertyCategory: true,
      serviceCategory: true,
    },
  });

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Authorization check
  if (role === "CUSTOMER" && booking.customerId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }
  if (role === "CLEANER" && booking.cleanerId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  return booking;
};

const getBookingForPayment = async (bookingId: string, userId: string) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      cleaner: {
        select: {
          id: true,
          name: true,
          avatar: true,
          email: true,
          phone: true,
          cleanerProfile: {
            select: {
              displayName: true,
              profilePhoto: true,
              avgRating: true,
              bio: true,
              address: true,
              city: true,
            },
          },
        },
      },
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          city: true,
        },
      },
      propertyCategory: {
        select: {
          id: true,
          name: true,
        },
      },
      serviceCategory: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Authorization check
  if (booking.customerId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  return {
    ...booking,
    formattedDate: format(new Date(booking.date), "EEEE, MMMM d, yyyy"),
    duration: `${booking.startTime} - ${booking.endTime}`,
    workTypeLabel: booking.workType.replace(/_/g, " "),
  };
};

const confirmBooking = async (bookingId: string, userId: string) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (booking.customerId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  if (booking.paymentStatus !== "PAID") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Booking must be paid before confirmation");
  }

  const updatedBooking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.CONFIRMED,
    },
    include: {
      cleaner: {
        select: {
          name: true,
          avatar: true,
          email: true,
          phone: true,
          cleanerProfile: {
            select: {
              displayName: true,
              profilePhoto: true,
              avgRating: true,
            },
          },
        },
      },
      customer: {
        select: {
          name: true,
          email: true,
        },
      },
      propertyCategory: true,
      serviceCategory: true,
    },
  });

  return updatedBooking;
};

const updatePaymentStatus = async (bookingId: string, paymentStatus: string) => {
  const booking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus,
    },
    include: {
      cleaner: {
        select: {
          name: true,
          avatar: true,
          email: true,
          cleanerProfile: {
            select: {
              displayName: true,
              profilePhoto: true,
            },
          },
        },
      },
      customer: {
        select: {
          name: true,
          email: true,
        },
      },
      propertyCategory: true,
      serviceCategory: true,
    },
  });

  return booking;
};

const getCleanerAvailability = async (cleanerId: string) => {
  const cleaner = await prisma.user.findFirst({
    where: { id: cleanerId, role: "CLEANER" },
    include: { cleanerProfile: true },
  });

  if (!cleaner || !cleaner.cleanerProfile) {
    throw new ApiError(httpStatus.NOT_FOUND, "Cleaner not found");
  }

  const profile = cleaner.cleanerProfile;
  const availabilityData = await getNextAvailableDates(cleanerId, 90, 90);

  return {
    cleanerId,
    workingDays: profile.workingDays,
    workFrom: profile.workFrom || "08:00 AM",
    workTo: profile.workTo || "06:00 PM",
    blockOffDates: profile.blockOffDates,
    workType: profile.workType,
    availableDates: availabilityData.dates,
  };
};

export const BookingService = {
  getAvailableSlots,
  getCleanerAvailability,
  createBooking,
  getMyBookings,
  getBookingById,
  getBookingForPayment,
  confirmBooking,
  updatePaymentStatus,
};
