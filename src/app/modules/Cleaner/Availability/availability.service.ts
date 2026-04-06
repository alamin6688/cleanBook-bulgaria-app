import httpStatus from "http-status";
import axios from "axios";
import ApiError from "../../../../errors/apiError";
import prisma from "../../../../lib/prisma";
import { IUpdateAvailabilityInput } from "./availability.interface";

const resolvePostcodeToArea = async (
  postcode: string,
  city?: string | null,
  country?: string | null
): Promise<string | null> => {
  try {
    // If country is provided, we ignore the local 'city' to avoid geographical conflicts 
    // (e.g., searching for 'Sofia' inside 'Bangladesh').
    const cityParam = (city && !country) ? `&city=${encodeURIComponent(city)}` : "";
    
    // If country is a 2-character code (like 'bd'), use countrycodes, otherwise use the full name param
    const countryParam = country 
      ? (country.length === 2 ? `&countrycodes=${country}` : `&country=${encodeURIComponent(country)}`)
      : "";
      
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${postcode}${cityParam}${countryParam}&format=json&addressdetails=1&accept-language=en`;

    const response = await axios.get(url, {
      headers: { "User-Agent": "CleanBookApp/1.0" },
    });

    if (response.data && response.data.length > 0) {
      const address = response.data[0].address;

      // We look for the most specific neighborhood/area name first.
      // In Sofia, 'county' or 'suburb' often provides the neighborhood name (e.g. Lozenets, Sredets).
      const area =
        address.suburb ||
        address.neighbourhood ||
        address.county ||
        address.city_district ||
        address.town ||
        address.village ||
        address.city;

      return area || null;
    }
  } catch (error) {
    console.error(`Postcode resolution failed for ${postcode}:`, error);
  }
  return null;
};

const updateAvailability = async (userId: string, data: IUpdateAvailabilityInput) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { cleanerProfile: true },
  });

  if (!user || user.role !== "CLEANER" || !user.cleanerProfile) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User is not a cleaner or profile not found");
  }

  return await prisma.$transaction(async (tx) => {
    let resolvedServiceAreas = data.serviceAreas || [];
    let isRequestConfiguringServiceAreas = !!(data.postcodes || data.serviceAreas);

    // Smart Resolver: Resolve new postcodes to area names automatically (Global)
    if (data.postcodes && data.postcodes.length > 0) {
      const resolutionPromises = data.postcodes.map((pc) =>
        resolvePostcodeToArea(pc, user.city, data.country)
      );
      const resolvedNames = await Promise.all(resolutionPromises);
      
      const uniqueNames = resolvedNames.filter((name): name is string => name !== null);
      resolvedServiceAreas = Array.from(new Set([...resolvedServiceAreas, ...uniqueNames]));
    }

    const updatedProfile = await tx.cleanerProfile.update({
      where: { userId },
      data: {
        workingDays: data.workingDays,
        workFrom: data.workFrom,
        workTo: data.workTo,
        workType: data.workType,
        blockOffDates: data.blockOffDates,
        // If the user provided postcodes or serviceAreas, we overwrite the field. 
        // Otherwise, we leave it alone (undefined).
        serviceAreas: isRequestConfiguringServiceAreas ? resolvedServiceAreas : undefined,
      },
    });

    return updatedProfile;
  });
};

const getAvailability = async (userId: string) => {
  const profile = await prisma.cleanerProfile.findUnique({
    where: { userId },
    select: {
      workingDays: true,
      workFrom: true,
      workTo: true,
      workType: true,
      blockOffDates: true,
      serviceAreas: true,
    },
  });

  if (!profile) {
    throw new ApiError(httpStatus.NOT_FOUND, "Cleaner profile not found");
  }

  return profile;
};

export const AvailabilityService = {
  updateAvailability,
  getAvailability,
};
