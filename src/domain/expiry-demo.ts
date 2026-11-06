import { DEMO_EXPIRATION_DAYS, type ListingFormValues } from "./listing-schema";

export const expiryDemoPreset: ListingFormValues = {
  title: "EXPIRY DEMO — Test laptop",
  description: "Disposable test listing for the fifteen-minute Arkiv expiration demonstration. No actual item is offered for sale.",
  category: "Electronics", price: 1, currency: "INR", city: "Mumbai",
  imageUrl: "https://placehold.co/800x600/png?text=Expiry+Demo",
  expirationDays: DEMO_EXPIRATION_DAYS,
};
