import Foundation

/// The system text-selection menu is left as it is on iOS 12: the hooks that hide it need menu
/// classes from iOS 13 and 16.
enum ContextMenuSuppressor {
  static func installIfNeeded() {}
}
