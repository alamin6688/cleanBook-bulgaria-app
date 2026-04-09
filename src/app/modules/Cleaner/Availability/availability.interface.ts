export type IUpdateAvailabilityInput = {
  workingDays?: string[];
  workFrom?: string;
  workTo?: string;

  blockOffDates?: Date[]; 
  serviceAreas?: string[]; // Names or IDs
  postcodes?: string[];    // Postcodes to be resolved to ServiceAreas
  country?: string;        // Specific country for accurate resolution (e.g., "Bangladesh", "Bulgaria")
};
