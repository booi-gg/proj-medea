import AppKit

private let channelMaximum: CGFloat = 255

private func toChannel(_ value: CGFloat) -> Int {
  Int(min(channelMaximum, max(0, (value * channelMaximum).rounded())))
}

/// Shows macOS's own magnifier, then prints the colour as "red green blue", each 0 to 255 in sRGB.
/// Prints nothing when cancelled. It's a program of its own because picking takes as long as you
/// like, and requests to the helper have to answer within seconds.
final class SamplerController: NSObject, NSApplicationDelegate {
  private let sampler = NSColorSampler()

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.activate(ignoringOtherApps: true)
    sampler.show { color in
      // Screens are often wider than sRGB, and hex and RGB values are meant to be read as sRGB.
      if let picked = color?.usingColorSpace(.sRGB) {
        print("\(toChannel(picked.redComponent)) \(toChannel(picked.greenComponent)) \(toChannel(picked.blueComponent))")
        fflush(stdout)
      }
      exit(0)
    }
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = SamplerController()
app.delegate = controller
app.run()
