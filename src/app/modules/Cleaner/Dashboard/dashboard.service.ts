import httpStatus from "http-status";
import ApiError from "../../../../errors/apiError";
import prisma from "../../../../lib/prisma";
import stripe from "../../../../utils/Stripe/stripe";
import { BookingStatus } from "@prisma/client";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  format,
  startOfDay,
} from "date-fns";

const getCleanerEarningsDashboard = async (cleanerId: string) => {
  const profile = await prisma.cleanerProfile.findUnique({
    where: { userId: cleanerId },
  });

  if (!profile) throw new ApiError(httpStatus.NOT_FOUND, "Cleaner profile not found");

  const now = new Date();

  // Ranges (Monday start)
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const lastWeekStart = subWeeks(thisWeekStart, 1);
  const lastWeekEnd = subWeeks(thisWeekEnd, 1);

  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  // Fetch earnings within range
  const earningsRecords = await prisma.booking.findMany({
    where: {
      cleanerId,
      status: BookingStatus.COMPLETE,
      updatedAt: { gte: lastWeekStart },
    },
    select: {
      charge: true,
      updatedAt: true,
    },
  });

  let thisWeekAmount = 0;
  let lastWeekAmount = 0;
  let thisMonthAmount = 0;
  let thisMonthJobs = 0;

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const activityMap: Record<string, number> = {};
  days.forEach((d) => (activityMap[d] = 0));

  earningsRecords.forEach((b) => {
    const cleanerShare = b.charge * 0.95;
    const date = b.updatedAt;

    if (date >= thisWeekStart && date <= thisWeekEnd) {
      thisWeekAmount += cleanerShare;
      const dayName = format(date, "EEE");
      if (activityMap[dayName] !== undefined) activityMap[dayName] += cleanerShare;
    }

    if (date >= lastWeekStart && date <= lastWeekEnd) {
      lastWeekAmount += cleanerShare;
    }

    if (date >= thisMonthStart && date <= thisMonthEnd) {
      thisMonthAmount += cleanerShare;
      thisMonthJobs++;
    }
  });

  const percentageChange =
    lastWeekAmount === 0 ? 0 : ((thisWeekAmount - lastWeekAmount) / lastWeekAmount) * 100;

  // Stripe Balance
  let pendingPayout = 0;
  let expectedArrivalDate = null;

  if (profile.stripeAccountId && profile.stripeOnboarded) {
    try {
      const balance = await stripe.balance.retrieve({}, { stripeAccount: profile.stripeAccountId });
      pendingPayout = balance.pending.reduce((sum, b) => sum + b.amount, 0) / 100;

      const payouts = await stripe.payouts.list(
        { limit: 1, status: "pending" },
        { stripeAccount: profile.stripeAccountId }
      );
      if (payouts.data.length > 0) {
        expectedArrivalDate = format(new Date(payouts.data[0].arrival_date * 1000), "MMM d, yyyy");
      }
    } catch (e: any) {
      console.warn("[Dashboard] Stripe balance fetch failed:", e.message);
    }
  }

  // Recent Earnings (Last 6)
  const recentBookings = await prisma.booking.findMany({
    where: { cleanerId, status: BookingStatus.COMPLETE },
    orderBy: { updatedAt: "desc" },
    take: 6,
    include: {
      customer: { include: { customerProfile: true } },
      serviceCategory: true,
    },
  });

  const recentEarnings = recentBookings.map((b) => ({
    id: b.id,
    customerName: b.customer?.customerProfile?.name || "Customer",
    avatar: b.customer?.customerProfile?.profilePhoto || null,
    date: format(b.updatedAt, "MMM d"),
    serviceName: b.serviceCategory?.name || "Cleaning",
    amount: Number((b.charge * 0.95).toFixed(2)),
  }));

  return {
    summary: {
      thisWeek: {
        amount: Number(thisWeekAmount.toFixed(2)),
        percentageChange: Number(percentageChange.toFixed(1)),
      },
      thisMonth: {
        amount: Number(thisMonthAmount.toFixed(2)),
        jobCount: thisMonthJobs,
      },
    },
    weeklyActivity: days.map((day) => ({
      day,
      amount: Number(activityMap[day].toFixed(2)),
    })),
    payout: {
      pendingAmount: Number(pendingPayout.toFixed(2)),
      expectedDate: expectedArrivalDate || "Scheduled soon",
    },
    recentEarnings,
  };
};

const getEarningsHistory = async (cleanerId: string) => {
  const bookings = await prisma.booking.findMany({
    where: { cleanerId, status: BookingStatus.COMPLETE },
    orderBy: { updatedAt: "desc" },
    include: {
      customer: { include: { customerProfile: true } },
      serviceCategory: true,
    },
  });

  return bookings.map((b) => ({
    id: b.id,
    customerName: b.customer?.customerProfile?.name || "Customer",
    avatar: b.customer?.customerProfile?.profilePhoto || null,
    date: format(b.updatedAt, "MMM d"),
    serviceName: b.serviceCategory?.name || "Cleaning",
    amount: Number((b.charge * 0.95).toFixed(2)),
  }));
};

const getCleanerHomeData = async (cleanerId: string) => {
  const profile = await prisma.cleanerProfile.findUnique({
    where: { userId: cleanerId },
    include: { user: true },
  });

  if (!profile) throw new ApiError(httpStatus.NOT_FOUND, "Cleaner profile not found");

  const now = new Date();
  const todayStart = startOfDay(now);

  // 1. Next Booking (single closest confirmed)
  const nextBooking = await prisma.booking.findFirst({
    where: {
      cleanerId,
      status: BookingStatus.CONFIRMED,
      date: { gte: todayStart },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: { serviceCategory: true, propertyCategory: true },
  });

  // 2. Weekly Earnings
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weeklyEarningsRecords = await prisma.booking.findMany({
    where: {
      cleanerId,
      status: BookingStatus.COMPLETE,
      updatedAt: { gte: thisWeekStart },
    },
    select: { charge: true },
  });
  const weeklyEarnings = weeklyEarningsRecords.reduce((sum, b) => sum + b.charge * 0.95, 0);

  // 3. Upcoming Jobs (limit 3)
  const upcomingJobs = await prisma.booking.findMany({
    where: {
      cleanerId,
      status: BookingStatus.CONFIRMED,
      date: { gte: todayStart },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: 3,
    include: {
      customer: { include: { customerProfile: true } },
      serviceCategory: true,
    },
  });

  // 4. Recent Reviews
  const recentReviews = await prisma.review.findMany({
    where: { cleanerProfileId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 3,
    include: { customer: { include: { customerProfile: true } } },
  });

  return {
    header: {
      name: profile.displayName || profile.user.email.split("@")[0],
      avatar: profile.profilePhoto,
      location: profile.city || "Bulgaria",
      isVerified: profile.stripeOnboarded,
    },
    summary: {
      weeklyEarnings: Number(weeklyEarnings.toFixed(2)),
    },
    nextBooking: nextBooking
      ? {
          id: nextBooking.id,
          serviceName: nextBooking.serviceCategory?.name || "Cleaning",
          location: nextBooking.address || nextBooking.city,
          date: format(nextBooking.date, "MMM d, yyyy"),
          time: nextBooking.startTime,
        }
      : null,
    upcomingJobs: upcomingJobs.map((j) => ({
      id: j.id,
      customerName: j.customer?.customerProfile?.name || "Customer",
      serviceName: j.serviceCategory?.name || "Cleaning",
      date: format(j.date, "MMM d"),
      time: j.startTime,
      location: j.address || j.city,
      avatar: j.customer?.customerProfile?.profilePhoto || null,
    })),
    recentReviews: recentReviews.map((r) => ({
      id: r.id,
      customerName: r.customer?.customerProfile?.name || "Customer",
      avatar: r.customer?.customerProfile?.profilePhoto || null,
      rating: r.rating,
      comment: r.description,
      date: format(r.createdAt, "MMM d, yyyy"),
    })),
  };
};

export const DashboardService = {
  getCleanerEarningsDashboard,
  getEarningsHistory,
  getCleanerHomeData,
};
