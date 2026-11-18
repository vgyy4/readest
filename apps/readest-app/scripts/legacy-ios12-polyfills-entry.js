// What the legacy (iOS 12) build loads before the app: the standard library features Safari 12
// lacks (core-js, which only installs what is missing) and the few web APIs it also lacks.
import 'core-js/stable';
import 'core-js/actual/promise/with-resolvers';
import 'core-js/actual/array/from-async';
import 'core-js/actual/object/group-by';
import './legacy-ios12-polyfills.js';
