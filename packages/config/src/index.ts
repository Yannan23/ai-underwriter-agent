import { AppetiteConfig, RatingConfig } from '@prism/contracts'
import appetiteV1 from './appetite.v1.json'
import ratingV1 from './rating.v1.json'

// Configs are Zod-validated at import time — a malformed config fails fast at
// boot, never mid-application. New versions are new files (appetite.v2.json …);
// the version string is recorded on every decision for reproducibility.
export const appetite = AppetiteConfig.parse(appetiteV1)
export const rating = RatingConfig.parse(ratingV1)
