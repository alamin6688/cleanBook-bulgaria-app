export type IUpdateLanguageInput = {
  language: string;
};

export type IUpdateLocationInput = {
  address: string;
  city: string;
  latitude: number;
  longitude: number;
};

export type IUpdateBasicProfileInput = {
  displayName: string;
  bio: string;
  profilePhoto?: string;
};

export type IUpdateCleanerProfileInput = {
  workingDays: string[];
  serviceAreas: string[];
  propertyTypeIds: string[];
  additionalServiceIds: string[];
  services: {
    serviceCategoryId: string;
    name: string;
    pricePerHour: number;
  }[];
};

export type IUpdateProfileInput = {
  // Basic info
  displayName?: string;
  bio?: string;
  profilePhoto?: string;
  language?: string;
  
  // Location
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;

  // Cleaner specific details
  workingDays?: string[];
  serviceAreas?: string[];
  propertyTypeIds?: string[];
  additionalServiceIds?: string[];
  services?: {
    serviceCategoryId: string;
    name: string;
    pricePerHour: number;
  }[];
};
