export const PAGE_SIZE = 10;

export const CUSTOMER_PREFIX_OPTIONS = ["Mr", "Ms", "Mrs", "Tn", "Ny", "Nn"] as const;
export type CustomerPrefix = (typeof CUSTOMER_PREFIX_OPTIONS)[number];
