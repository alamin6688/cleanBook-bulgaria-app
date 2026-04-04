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
  propertyTypes: ("FLAT" | "HOUSE" | "OFFICE" | "STUDIO")[];
  services: {
    name: "REGULAR_CLEANING" | "DEEP_CLEANING" | "IRONING" | "WINDOW_CLEANING" | "MOVE_OUT_CLEAN" | "LAUNDRY";
    pricePerHour: number;
  }[];
};
