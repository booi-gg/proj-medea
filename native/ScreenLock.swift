import Foundation

private let loginFrameworkPath =
  "/System/Library/PrivateFrameworks/login.framework/Versions/Current/login"
private let lockFunctionName = "SACLockScreenImmediate"
private typealias LockFunction = @convention(c) () -> Int32

/// Locks straight away, whatever "require password after sleep" is set to, and needs no permission.
/// macOS has no public call for this. It's looked up by name so a future macOS that drops it gets
/// a failure message, not a helper that won't start. Its return value isn't documented, so it's
/// ignored.
func lockScreen() -> Bool {
  guard let framework = dlopen(loginFrameworkPath, RTLD_LAZY),
    let function = dlsym(framework, lockFunctionName)
  else {
    return false
  }
  _ = unsafeBitCast(function, to: LockFunction.self)()
  return true
}
