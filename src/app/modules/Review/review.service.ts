import httpStatus from "http-status";
import ApiError from "../../../errors/apiError";
import prisma from "../../../lib/prisma";
import { IReview } from "./review.interface";
import { BookingStatus } from "@prisma/client";

const createReview = async (userId: string, data: IReview) => {
  const { bookingId, rating, description, tags } = data;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { cleaner: { include: { cleanerProfile: true } } },
  });

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (booking.customerId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  if (booking.status !== BookingStatus.COMPLETE) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Can only review completed bookings");
  }

  // Check if review already exists
  const existingReview = await prisma.review.findUnique({
    where: { bookingId },
  });

  if (existingReview) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Review already exists for this booking");
  }

  if (!booking.cleaner.cleanerProfile) {
    throw new ApiError(httpStatus.NOT_FOUND, "Cleaner profile not found");
  }

  const result = await prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        bookingId,
        customerId: userId,
        cleanerProfileId: booking.cleaner.cleanerProfile!.id,
        rating,
        description,
        tags: tags || [],
      },
      include: {
        customer: {
          select: { name: true, avatar: true, email: true },
        },
      },
    });

    // Update Cleaner average rating and total reviews
    const profile = booking.cleaner.cleanerProfile!;
    const newTotalReviews = profile.totalReviews + 1;
    const newAvgRating = (profile.avgRating * profile.totalReviews + rating) / newTotalReviews;

    await tx.cleanerProfile.update({
      where: { id: profile.id },
      data: {
        avgRating: newAvgRating,
        totalReviews: newTotalReviews,
      },
    });

    return review;
  });

  return result;
};

const getCleanerReviews = async (cleanerId: string) => {
  // Note: cleanerId here is User.id
  const profile = await prisma.cleanerProfile.findUnique({
    where: { userId: cleanerId },
  });

  if (!profile) throw new ApiError(httpStatus.NOT_FOUND, "Cleaner profile not found");

  return await prisma.review.findMany({
    where: { cleanerProfileId: profile.id },
    include: {
      customer: {
        select: { name: true, avatar: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const ReviewService = {
  createReview,
  getCleanerReviews,
};
