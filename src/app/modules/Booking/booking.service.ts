/* eslint-disable @typescript-eslint/no-explicit-any */
import httpStatus from "http-status";
import ApiError from "../../../errors/apiError";
import prisma from "../../../lib/prisma";
import { IBookingSlotQuery, ICreateBooking } from "./booking.interface";
import { BookingStatus } from "@prisma/client";
import {
  addMinutes,
  addDays,
  format,
  isAfter,
  isBefore,
  parse,
  startOfDay,
  differenceInMinutes,
} from "date-fns";

const flattenUser = (user: any) => {
  if (!user) return null;
  const name =
    user.role === "CLEANER"
      ? user.cleanerProfile?.displayName
      : user.customerProfile?.name || user.email.split("@")[0];
  const avatar =
    user.role === "CLEANER"
      ? user.cleanerProfile?.profilePhoto
      : user.customerProfile?.profilePhoto;
  
  // Flatten location
  const city = user.role === "CLEANER" ? user.cleanerProfile?.city : user.customerProfile?.city;
  const address = user.role === "CLEANER" ? user.cleanerProfile?.address : user.customerProfile?.address;
  const latitude = user.role === "CLEANER" ? user.cleanerProfile?.latitude : user.customerProfile?.latitude;
  const longitude = user.role === "CLEANER" ? user.cleanerProfile?.longitude : user.customerProfile?.longitude;

  return { ...user, name, avatar, city, address, latitude, longitude };
};

const parseTime = (timeStr: string, refDate: Date) => {
  return timeStr.toLowerCase().includes("m")
    ? parse(timeStr, "hh:mm a", refDate)
    : parse(timeStr, "HH:mm", refDate);
};

const formatTime = (date: Date) => {
  return format(date, "hh:mm a");
};

const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  const currentDate = startOfDay(new Date());

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
  const { cleanerId, date } = query;
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

  const slotDurationHours = 1; // Default 1 hour booking slots

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
    endTime,
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
  const startDateTime = parseTime(startTime, bookingDate);
  const endDateTime = parseTime(endTime, bookingDate);

  if (!isAfter(endDateTime, startDateTime)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "End time must be after start time");
  }

  const slotDurationHours = differenceInMinutes(endDateTime, startDateTime) / 60;

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
        include: { cleanerProfile: true },
      },
      customer: {
        include: { customerProfile: true },
      },
      propertyCategory: true,
      serviceCategory: true,
    },
  });

  const flattenUser = (user: any) => {
    if (!user) return null;
    const name =
      user.role === "CLEANER"
        ? user.cleanerProfile?.displayName
        : user.customerProfile?.name || user.email.split("@")[0];
    const avatar =
      user.role === "CLEANER"
        ? user.cleanerProfile?.profilePhoto
        : user.customerProfile?.profilePhoto;
    return { ...user, name, avatar };
  };

  return {
    ...booking,
    cleaner: flattenUser(booking.cleaner),
    customer: flattenUser(booking.customer),
  };
};

const getMyBookings = async (userId: string, role: string, tab?: string) => {
  const where: any = {};
  if (role === "CUSTOMER") {
    where.customerId = userId;
  } else if (role === "CLEANER") {
    where.cleanerId = userId;
  }

  if (tab === "ACTIVE") {
    where.status = {
      in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.RESCHEDULE_REQUESTED],
    };
  } else if (tab === "REQUEST") {
    where.status = BookingStatus.PENDING;
  } else if (tab === "PAST") {
    where.status = { in: [BookingStatus.COMPLETE, BookingStatus.CANCELLED] };
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      cleaner: {
        include: { cleanerProfile: true },
      },
      customer: {
        include: { customerProfile: true },
      },
      propertyCategory: true,
      serviceCategory: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const flattenUser = (user: any) => {
    if (!user) return null;
    const name =
      user.role === "CLEANER"
        ? user.cleanerProfile?.displayName
        : user.customerProfile?.name || user.email.split("@")[0];
    const avatar =
      user.role === "CLEANER"
        ? user.cleanerProfile?.profilePhoto
        : user.customerProfile?.profilePhoto;
    return { ...user, name, avatar };
  };

  const flattenedBookings = bookings.map((b) => ({
    ...b,
    cleaner: flattenUser(b.cleaner),
    customer: flattenUser(b.customer),
  }));

  // Auto-transition to IN_PROGRESS if time has started
  const now = new Date();
  const updatedBookings = await Promise.all(
    flattenedBookings.map(async (booking) => {
      const bookingDate = new Date(booking.date);
      // Rough check: if it's today and the start time has passed, but it is still 'CONFIRMED'
      // Note: Parsing "09:00 AM" would be more precise, but for now we'll check the day
      if (booking.status === BookingStatus.CONFIRMED && bookingDate <= now) {
        // In a real app, you'd compare the actual hours here too
        // For now, let's keep it simple: if it's today or earlier and confirmed, it's effectively In Progress
        // return await prisma.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.IN_PROGRESS }, ...include })
      }
      return booking;
    })
  );

  return bookings;
};

const getBookingById = async (id: string, userId: string, role: string) => {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      cleaner: {
        include: { cleanerProfile: true },
      },
      customer: {
        include: { customerProfile: true },
      },
      propertyCategory: true,
      serviceCategory: true,
    },
  });

  const flattenUser = (user: any) => {
    if (!user) return null;
    const name =
      user.role === "CLEANER"
        ? user.cleanerProfile?.displayName
        : user.customerProfile?.name || user.email.split("@")[0];
    const avatar =
      user.role === "CLEANER"
        ? user.cleanerProfile?.profilePhoto
        : user.customerProfile?.profilePhoto;
    return { ...user, name, avatar };
  };

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

  return {
    ...booking,
    cleaner: flattenUser(booking.cleaner),
    customer: flattenUser(booking.customer),
  };
}

const getBookingForPayment = async (bookingId: string, userId: string) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      cleaner: {
        include: { cleanerProfile: true },
      },
      customer: {
        include: { customerProfile: true },
      },
      propertyCategory: true,
      serviceCategory: true,
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
    cleaner: flattenUser(booking.cleaner),
    customer: flattenUser(booking.customer),
    formattedDate: format(new Date(booking.date), "EEEE, MMMM d, yyyy"),
    duration: `${booking.startTime} - ${booking.endTime}`,
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
        include: { cleanerProfile: true },
      },
      customer: {
        include: { customerProfile: true },
      },
      propertyCategory: true,
      serviceCategory: true,
    },
  });

  return {
    ...updatedBooking,
    cleaner: flattenUser(updatedBooking.cleaner),
    customer: flattenUser(updatedBooking.customer),
  };
};

const updatePaymentStatus = async (bookingId: string, paymentStatus: string) => {
  const booking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus,
    },
    include: {
      cleaner: {
        include: { cleanerProfile: true },
      },
      customer: {
        include: { customerProfile: true },
      },
      propertyCategory: true,
      serviceCategory: true,
    },
  });

  return {
    ...booking,
    cleaner: flattenUser(booking.cleaner),
    customer: flattenUser(booking.customer),
  };
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
    availableDates: availabilityData.dates,
  };
};

const checkAvailabilityAndPrice = async (data: any) => {
  const { cleanerId, serviceCategoryId, date, startTime, endTime } = data;
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
  const service = profile.services[0];
  if (!service) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Cleaner does not provide this service category");
  }

  const dayName = format(bookingDate, "EEE");
  const availabilityData = await getNextAvailableDates(cleanerId, 30, 5);

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
  const startDateTime = parseTime(startTime, bookingDate);
  const endDateTime = parseTime(endTime, bookingDate);

  if (!isAfter(endDateTime, startDateTime)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "End time must be after start time");
  }

  const workFromLimit = parseTime(profile.workFrom || "08:00 AM", bookingDate);
  const workToLimit = parseTime(profile.workTo || "06:00 PM", bookingDate);

  if (isBefore(startDateTime, workFromLimit) || isAfter(endDateTime, workToLimit)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Selected time is outside cleaner's working hours (${availabilityData.workFrom} - ${
        availabilityData.workTo
      }).`
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
      `The selected time slot (${startTime} - ${endTime}) overlaps with an existing booking.`
    );
  }

  // Calculate Charges
  const durationHours = differenceInMinutes(endDateTime, startDateTime) / 60;
  const charge = service.pricePerHour * durationHours;
  const platformCharge = charge * 0.05; // 5% platform fee
  const totalCharge = charge + platformCharge;

  return {
    available: true,
    priceDetails: {
      charge,
      platformCharge,
      totalCharge,
      durationHours,
      pricePerHour: service.pricePerHour,
    },
  };
};

const getAvailableCleaners = async (query: any) => {
  const {
    searchTerm,
    serviceCategoryIds, // Array of IDs
    propertyCategoryId,
    city,
    minPrice,
    maxPrice,
    minRating,
    latitude,
    longitude,
    radius = 50,
    sortBy, // nearest, rating_high_to_low, price_low_to_high
  } = query;

  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Parse serviceCategoryIds if it's a string (e.g. from query single param)
  const serviceIds = Array.isArray(serviceCategoryIds)
    ? serviceCategoryIds
    : serviceCategoryIds
      ? [serviceCategoryIds]
      : [];

  // 1. Build Base Filter
  const where: any = {
    role: "CLEANER",
    isActive: true,
    cleanerProfile: {
      avgRating: { gte: minRating ? Number(minRating) : 0 },
      services: {
        some: {
          serviceCategoryId: serviceIds.length > 0 ? { in: serviceIds } : undefined,
          pricePerHour: {
            gte: minPrice ? Number(minPrice) : 0,
            lte: maxPrice ? Number(maxPrice) : 999999,
          },
        },
      },
    },
  };

  if (searchTerm) {
    where.cleanerProfile = {
      ...where.cleanerProfile,
      OR: [
        { displayName: { contains: searchTerm, mode: "insensitive" } },
        { bio: { contains: searchTerm, mode: "insensitive" } },
      ],
    };
  }

  if (propertyCategoryId) {
    where.cleanerProfile.propertyTypeIds = { has: propertyCategoryId };
  }

  if (city) {
    where.cleanerProfile = { ...where.cleanerProfile, city };
  }

  // 2. Fetch Potential Cleaners
  const cleaners = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      customerProfile: true, // Though role is CLEANER, good to be consistent
      cleanerProfile: {
        include: { services: { where: serviceIds.length > 0 ? { serviceCategoryId: { in: serviceIds } } : undefined } }
      }
    },
  });

  // 3. Advanced Availability & Distance Filter
  const results = [];
  const day1 = format(now, "EEE");
  const day2 = format(addDays(now, 1), "EEE");
  const day3 = format(addDays(now, 2), "EEE");

  for (const cleaner of cleaners) {
    const profile = cleaner.cleanerProfile!;

    // A. Check Working Days (Must be free/available to work in next 3 days)
    const worksInNext3Days =
      profile.workingDays.includes(day1) ||
      profile.workingDays.includes(day2) ||
      profile.workingDays.includes(day3);

    if (!worksInNext3Days) continue;

    // B. Check Upcoming Booking Exception (No booking in next 24h)
    const upcomingBooking = await prisma.booking.findFirst({
      where: {
        cleanerId: cleaner.id,
        status: { not: BookingStatus.CANCELLED },
        date: {
          gte: startOfDay(now),
          lte: addDays(startOfDay(now), 2), // Check broader range then filter precisely
        },
      },
    });

    if (upcomingBooking) {
      const jobStartTime = parseTime(upcomingBooking.startTime, upcomingBooking.date);
      // If job starts within 24 hours from now
      if (isAfter(jobStartTime, now) && isBefore(jobStartTime, next24h)) {
        continue;
      }
    }

    // C. Distance Check
    let distance = Infinity;
    if (latitude && longitude && profile.latitude && profile.longitude) {
      distance = getDistanceKm(
        Number(latitude),
        Number(longitude),
        profile.latitude,
        profile.longitude
      );
      if (distance > radius) continue;
    }

    results.push({ ...cleaner, distance });
  }

  // 4. Sorting Logic
  if (sortBy === "rating_high_to_low") {
    results.sort((a, b) => b.cleanerProfile!.avgRating - a.cleanerProfile!.avgRating);
  } else if (sortBy === "rating_low_to_high") {
    results.sort((a, b) => a.cleanerProfile!.avgRating - b.cleanerProfile!.avgRating);
  } else if (sortBy === "nearest") {
    results.sort((a, b) => a.distance - b.distance);
  } else if (sortBy === "price_low_to_high") {
    results.sort((a, b) => {
      const getMinPrice = (cleaner: any) => {
        const prices = (cleaner.cleanerProfile!.services || []).map((s: any) => s.pricePerHour);
        return prices.length > 0 ? Math.min(...prices) : Infinity;
      };
      return getMinPrice(a) - getMinPrice(b);
    });
  }

  return results.map(cleaner => flattenUser(cleaner));
};

const updateBookingStatus = async (
  bookingId: string,
  userId: string,
  role: string,
  status: BookingStatus,
  data?: any
) => {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");

  // Authorization: Only Customer or Cleaner can cancel/complete their own booking
  if (booking.customerId !== userId && booking.cleanerId !== userId && role !== "ADMIN") {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  // Restriction: Only Cleaners can mark a booking as COMPLETE
  if (status === BookingStatus.COMPLETE && role === "CUSTOMER") {
    throw new ApiError(httpStatus.FORBIDDEN, "Only the cleaner can mark a booking as complete");
  }

  // Restriction: Only Cleaners can set IN_PROGRESS (if they want to do it manually)
  if (status === BookingStatus.IN_PROGRESS && role === "CUSTOMER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Customers cannot manually start the cleaning process"
    );
  }

  const updatedBooking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status,
      cancelReason: status === BookingStatus.CANCELLED ? (data as any).reason : undefined,
      cancelNote: status === BookingStatus.CANCELLED ? (data as any).note : undefined,
    },
    include: {
      cleaner: { include: { cleanerProfile: true } },
      customer: { include: { customerProfile: true } },
      serviceCategory: true,
    },
  });

  return {
    ...updatedBooking,
    cleaner: flattenUser(updatedBooking.cleaner),
    customer: flattenUser(updatedBooking.customer),
  };
};

const requestReschedule = async (
  bookingId: string,
  userId: string,
  data: { date: string; startTime: string; endTime: string; reason?: string; note?: string }
) => {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");

  // Only the customer who owns the booking can request a reschedule
  if (booking.customerId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Only customers can request a reschedule");
  }

  // Can only reschedule if the job hasn't started or been cancelled
  if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.PENDING) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot reschedule a booking with status ${booking.status}`
    );
  }

  const newDate = new Date(data.date);
  if (isNaN(newDate.getTime())) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid reschedule date provided");
  }

  return await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.RESCHEDULE_REQUESTED,
      rescheduleDate: newDate,
      rescheduleStartTime: data.startTime,
      rescheduleEndTime: data.endTime,
      rescheduleReason: data.reason,
      rescheduleNote: data.note,
    },
  });
};

const acceptReschedule = async (bookingId: string, userId: string) => {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");

  // Only the cleaner assigned to the booking can accept the reschedule
  if (booking.cleanerId !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only the assigned cleaner can accept a reschedule request"
    );
  }

  if (booking.status !== BookingStatus.RESCHEDULE_REQUESTED) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "No pending reschedule request found for this booking"
    );
  }

  return await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.CONFIRMED,
      date: booking.rescheduleDate!,
      startTime: booking.rescheduleStartTime!,
      endTime: booking.rescheduleEndTime!,
      rescheduleDate: null,
      rescheduleStartTime: null,
      rescheduleEndTime: null,
      rescheduleReason: null,
      rescheduleNote: null,
    },
  });
};

const requestCompletion = async (
  bookingId: string,
  cleanerId: string,
  images: string[],
  completionNote?: string
) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Only the assigned cleaner can request completion
  if (booking.cleanerId !== cleanerId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Only the assigned cleaner can request completion");
  }

  // Can only request completion if booking is CONFIRMED or IN_PROGRESS
  if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.IN_PROGRESS) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot request completion for a booking with status ${booking.status}`
    );
  }

  const updatedBooking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.COMPLETION_REQUESTED,
      completionPhotos: {
        push: images,
      },
      completionNote: completionNote || null,
    },
    include: {
      cleaner: { include: { cleanerProfile: true } },
      customer: { include: { customerProfile: true } },
      serviceCategory: true,
    },
  });

  return {
    ...updatedBooking,
    cleaner: flattenUser(updatedBooking.cleaner),
    customer: flattenUser(updatedBooking.customer),
  };
};

const confirmCompletion = async (bookingId: string, userId: string) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Only the customer who owns the booking can confirm completion
  if (booking.customerId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Only the customer can confirm completion");
  }

  if (booking.status !== BookingStatus.COMPLETION_REQUESTED) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Completion hasn't been requested for this booking yet"
    );
  }

  const updatedBooking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.COMPLETE,
    },
    include: {
      cleaner: { include: { cleanerProfile: true } },
      customer: { include: { customerProfile: true } },
      serviceCategory: true,
    },
  });

  // Increment cleaner's total jobs
  await prisma.cleanerProfile.update({
    where: { userId: booking.cleanerId },
    data: {
      totalJobs: { increment: 1 },
    },
  });

  return {
    ...updatedBooking,
    cleaner: flattenUser(updatedBooking.cleaner),
    customer: flattenUser(updatedBooking.customer),
  };
};

const cancelCompletion = async (bookingId: string, userId: string) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Only the customer who owns the booking can cancel/reject completion request
  if (booking.customerId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Only the customer can reject completion");
  }

  if (booking.status !== BookingStatus.COMPLETION_REQUESTED) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No completion request found for this booking");
  }

  const updatedBooking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.IN_PROGRESS,
    },
    include: {
      cleaner: { include: { cleanerProfile: true } },
      customer: { include: { customerProfile: true } },
      serviceCategory: true,
    },
  });

  return {
    ...updatedBooking,
    cleaner: flattenUser(updatedBooking.cleaner),
    customer: flattenUser(updatedBooking.customer),
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
  checkAvailabilityAndPrice,
  getAvailableCleaners,
  updateBookingStatus,
  requestReschedule,
  acceptReschedule,
  requestCompletion,
  confirmCompletion,
  cancelCompletion,
};
