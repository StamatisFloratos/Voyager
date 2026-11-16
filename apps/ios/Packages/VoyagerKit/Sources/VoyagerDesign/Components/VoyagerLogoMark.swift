import SwiftUI

public struct VoyagerLogoMark: View {
  public var outline: Bool
  public var outlineWeight: CGFloat

  public init(outline: Bool = true, outlineWeight: CGFloat = 0.075) {
    self.outline = outline
    self.outlineWeight = outlineWeight
  }

  public var body: some View {
    GeometryReader { proxy in
      let edge = outline ? min(proxy.size.width, proxy.size.height) * outlineWeight : 0
      Image("VoyagerMark", bundle: .module)
        .resizable()
        .renderingMode(.template)
        .scaledToFit()
        .padding(edge / 2)
        .shadow(color: outline ? .white.opacity(0.7) : .clear, radius: edge / 2)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .aspectRatio(207.0 / 199.0, contentMode: .fit)
    .accessibilityHidden(true)
  }
}

public struct FidgetLogo: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var angle: Angle = .zero
  @State private var dragStart: Angle?
  @State private var lastSample: (angle: Angle, time: Date)?
  @State private var velocity: Double = 0
  @State private var spins = 0

  public init() {}

  public var body: some View {
    GeometryReader { proxy in
      let center = CGPoint(x: proxy.size.width / 2, y: proxy.size.height / 2)
      VoyagerLogoMark(outlineWeight: 0.05)
        .shadow(color: .black.opacity(0.22), radius: 14, y: 6)
        .rotationEffect(angle)
        .frame(width: proxy.size.width, height: proxy.size.height)
        .contentShape(.circle)
        .gesture(spin(around: center))
    }
    .sensoryFeedback(.impact(weight: .light, intensity: 0.5), trigger: spins)
    .accessibilityElement()
    .accessibilityLabel("Voyager")
    .accessibilityAddTraits(.isImage)
  }

  private func spin(around center: CGPoint) -> some Gesture {
    DragGesture(minimumDistance: 2)
      .onChanged { value in
        let start = Self.bearing(of: value.startLocation, around: center)
        let now = Self.bearing(of: value.location, around: center)
        if dragStart == nil { dragStart = angle }
        var delta = now - start
        if delta.degrees > 180 { delta -= .degrees(360) }
        if delta.degrees < -180 { delta += .degrees(360) }
        let target = (dragStart ?? .zero) + delta
        let time = value.time
        if let lastSample {
          let elapsed = time.timeIntervalSince(lastSample.time)
          if elapsed > 0.004 { velocity = (target.degrees - lastSample.angle.degrees) / elapsed }
        }
        lastSample = (target, time)
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { angle = target }
      }
      .onEnded { _ in
        dragStart = nil
        lastSample = nil
        let clamped = max(-2400, min(2400, velocity))
        velocity = 0
        guard abs(clamped) > 60 else { return }
        if reduceMotion {
          withAnimation(.easeOut(duration: 0.3)) { angle = .zero }
          return
        }
        let travel = clamped * 0.42
        if abs(travel) >= 360 { spins += 1 }
        withAnimation(.timingCurve(0.12, 0.7, 0.25, 1, duration: Motion.logoSpinDecay)) {
          angle += .degrees(travel)
        }
      }
  }

  private static func bearing(of point: CGPoint, around center: CGPoint) -> Angle {
    .radians(atan2(point.y - center.y, point.x - center.x))
  }
}

#Preview("Logo") {
  VStack(spacing: 32) {
    VoyagerLogoMark().frame(width: 140)
    VoyagerLogoMark(outline: false).frame(width: 140)
    FidgetLogo().frame(width: 140, height: 120)
  }
  .padding(40)
  .background(ProfileBackdrop())
}
