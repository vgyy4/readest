import Foundation
import os

/// `os.Logger` needs iOS 14. This one has the same calls (`log`, `info`, `debug`, `warning`, `error`,
/// `notice`, `fault`, and `privacy:` in interpolations) and writes to the same system log through
/// `os_log`, so the rest of the code does not change on iOS 12.
enum LogPrivacy {
  case auto, `public`, `private`, sensitive
}

struct LogMessage: ExpressibleByStringInterpolation, ExpressibleByStringLiteral {
  struct StringInterpolation: StringInterpolationProtocol {
    var text = ""
    init(literalCapacity: Int, interpolationCount: Int) {}
    mutating func appendLiteral(_ literal: String) { text += literal }
    mutating func appendInterpolation<T>(_ value: T, privacy: LogPrivacy = .auto) {
      text += "\(value)"
    }
  }
  let text: String
  init(stringLiteral value: String) { text = value }
  init(stringInterpolation: StringInterpolation) { text = stringInterpolation.text }
}

struct Logger {
  private let osLog: OSLog
  init(subsystem: String, category: String) {
    osLog = OSLog(subsystem: subsystem, category: category)
  }
  private func write(_ message: LogMessage, _ type: OSLogType) {
    os_log("%{public}@", log: osLog, type: type, message.text)
  }
  func log(_ message: LogMessage) { write(message, .default) }
  func notice(_ message: LogMessage) { write(message, .default) }
  func info(_ message: LogMessage) { write(message, .info) }
  func debug(_ message: LogMessage) { write(message, .debug) }
  func warning(_ message: LogMessage) { write(message, .default) }
  func error(_ message: LogMessage) { write(message, .error) }
  func fault(_ message: LogMessage) { write(message, .fault) }
}
