/**
 * Which build this is, set by the CI workflows (`NEXT_PUBLIC_BUILD_LABEL`, e.g. "33f33cc, run 26").
 * Empty for a local or web build. Shown on the sign-in screen and the profile screen, so it is
 * obvious which version of the app a device is actually running.
 */
export const BUILD_LABEL = process.env['NEXT_PUBLIC_BUILD_LABEL'] ?? '';
