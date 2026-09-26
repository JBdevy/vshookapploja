#import "BronzeSkiaControlView.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

#if defined(BRONZE_KEYS_REQUIRE_SKIA) && BRONZE_KEYS_REQUIRE_SKIA && !__has_include("include/core/SkBitmap.h")
#error "BRONZE_KEYS_REQUIRE_SKIA está ativo, mas os headers do Skia não foram encontrados"
#endif

#if __has_include("include/core/SkBitmap.h")
#define BRONZE_KEYS_HAS_SKIA 1
#include "include/core/SkBitmap.h"
#include "include/core/SkCanvas.h"
#include "include/core/SkColor.h"
#include "include/core/SkImageInfo.h"
#include "include/core/SkPaint.h"
#include "include/core/SkPath.h"
#include "include/core/SkRect.h"
#else
#define BRONZE_KEYS_HAS_SKIA 0
#endif

namespace {

CGFloat clampUnit(CGFloat value) {
  return std::clamp(value, static_cast<CGFloat>(0), static_cast<CGFloat>(1));
}

void colorComponents(UIColor *color, CGFloat& red, CGFloat& green, CGFloat& blue, CGFloat& alpha) {
  red = green = blue = 1;
  alpha = 1;
  [color getRed:&red green:&green blue:&blue alpha:&alpha];
}

#if BRONZE_KEYS_HAS_SKIA
SkColor skColor(UIColor *color) {
  CGFloat red, green, blue, alpha;
  colorComponents(color, red, green, blue, alpha);
  return SkColorSetARGB(
      static_cast<U8CPU>(std::lround(alpha * 255)),
      static_cast<U8CPU>(std::lround(red * 255)),
      static_cast<U8CPU>(std::lround(green * 255)),
      static_cast<U8CPU>(std::lround(blue * 255)));
}
#endif

} // namespace

@interface BronzeSkiaControlView () {
  CGPoint _touchOrigin;
  CGFloat _valueAtTouchOrigin;
  std::vector<std::uint32_t> _pixels;
}
@end

@implementation BronzeSkiaControlView

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    self.opaque = NO;
    self.backgroundColor = UIColor.clearColor;
    self.isAccessibilityElement = YES;
    self.accessibilityTraits = UIAccessibilityTraitAdjustable;
    _accentColor = [UIColor colorWithRed:0.80 green:0.42 blue:0.18 alpha:1.0];
  }
  return self;
}

- (void)setControlKind:(BronzeSkiaControlKind)controlKind {
  _controlKind = controlKind;
  [self setNeedsDisplay];
}

- (void)setNormalizedValue:(CGFloat)normalizedValue {
  const auto clamped = clampUnit(normalizedValue);
  if (std::abs(_normalizedValue - clamped) < 0.00001) return;
  _normalizedValue = clamped;
  self.accessibilityValue = [NSString stringWithFormat:@"%.0f%%", clamped * 100];
  [self setNeedsDisplay];
}

- (void)setAccentColor:(UIColor *)accentColor {
  _accentColor = accentColor ?: UIColor.systemOrangeColor;
  [self setNeedsDisplay];
}

- (void)drawRect:(CGRect)rect {
#if BRONZE_KEYS_HAS_SKIA
  const auto scale = std::max<CGFloat>(1, self.contentScaleFactor);
  const int width = std::max(1, static_cast<int>(std::ceil(CGRectGetWidth(self.bounds) * scale)));
  const int height = std::max(1, static_cast<int>(std::ceil(CGRectGetHeight(self.bounds) * scale)));
  _pixels.assign(static_cast<std::size_t>(width) * height, 0);
  SkBitmap bitmap;
  const auto info = SkImageInfo::MakeN32Premul(width, height);
  if (!bitmap.installPixels(info, _pixels.data(), static_cast<std::size_t>(width) * 4)) return;
  SkCanvas canvas(bitmap);
  canvas.scale(static_cast<SkScalar>(scale), static_cast<SkScalar>(scale));
  canvas.clear(SK_ColorTRANSPARENT);
  SkPaint paint;
  paint.setAntiAlias(true);
  const float logicalWidth = static_cast<float>(CGRectGetWidth(self.bounds));
  const float logicalHeight = static_cast<float>(CGRectGetHeight(self.bounds));
  if (_controlKind == BronzeSkiaControlKindKnob) {
    const float size = std::min(logicalWidth, logicalHeight);
    const float radius = size * 0.39f;
    const SkPoint center = {logicalWidth * 0.5f, logicalHeight * 0.5f};
    paint.setColor(SkColorSetRGB(25, 22, 27));
    canvas.drawCircle(center.x(), center.y(), radius, paint);
    paint.setStyle(SkPaint::kStroke_Style);
    paint.setStrokeWidth(std::max(2.0f, size * 0.055f));
    paint.setStrokeCap(SkPaint::kRound_Cap);
    paint.setColor(SkColorSetRGB(73, 67, 77));
    const SkRect arc = SkRect::MakeLTRB(center.x() - radius, center.y() - radius,
                                        center.x() + radius, center.y() + radius);
    canvas.drawArc(arc, 135, 270, false, paint);
    paint.setColor(skColor(_accentColor));
    canvas.drawArc(arc, 135, static_cast<float>(_normalizedValue * 270), false, paint);
    const float angle = static_cast<float>((135.0 + _normalizedValue * 270.0) * M_PI / 180.0);
    const float inner = radius * 0.34f;
    const float outer = radius * 0.75f;
    canvas.drawLine(center.x() + std::cos(angle) * inner, center.y() + std::sin(angle) * inner,
                    center.x() + std::cos(angle) * outer, center.y() + std::sin(angle) * outer, paint);
  } else {
    const float centerX = logicalWidth * 0.5f;
    const float top = logicalHeight * 0.08f;
    const float bottom = logicalHeight * 0.92f;
    paint.setStyle(SkPaint::kStroke_Style);
    paint.setStrokeCap(SkPaint::kRound_Cap);
    paint.setStrokeWidth(std::max(4.0f, logicalWidth * 0.12f));
    paint.setColor(SkColorSetRGB(53, 47, 57));
    canvas.drawLine(centerX, top, centerX, bottom, paint);
    const float y = bottom - static_cast<float>(_normalizedValue) * (bottom - top);
    paint.setColor(skColor(_accentColor));
    canvas.drawLine(centerX, y, centerX, bottom, paint);
    paint.setStyle(SkPaint::kFill_Style);
    canvas.drawRoundRect(SkRect::MakeLTRB(logicalWidth * 0.18f, y - 7,
                                          logicalWidth * 0.82f, y + 7), 4, 4, paint);
  }
  CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
  CGDataProviderRef provider = CGDataProviderCreateWithData(
      nullptr, _pixels.data(), _pixels.size() * sizeof(std::uint32_t), nullptr);
  CGImageRef image = CGImageCreate(width, height, 8, 32, width * 4, space,
      kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst,
      provider, nullptr, false, kCGRenderingIntentDefault);
  CGContextRef context = UIGraphicsGetCurrentContext();
  if (context && image) CGContextDrawImage(context, self.bounds, image);
  if (image) CGImageRelease(image);
  CGDataProviderRelease(provider);
  CGColorSpaceRelease(space);
#else
  // Fallback apenas para desenvolvimento antes de gerar Skia.xcframework.
  CGContextRef context = UIGraphicsGetCurrentContext();
  if (!context) return;
  CGContextSetLineCap(context, kCGLineCapRound);
  const CGFloat width = CGRectGetWidth(self.bounds);
  const CGFloat height = CGRectGetHeight(self.bounds);
  if (_controlKind == BronzeSkiaControlKindKnob) {
    const CGFloat size = std::min(width, height);
    const CGPoint center = CGPointMake(width * 0.5, height * 0.5);
    const CGFloat radius = size * 0.39;
    CGContextSetLineWidth(context, std::max<CGFloat>(2, size * 0.055));
    CGContextSetStrokeColorWithColor(context, [UIColor colorWithWhite:0.29 alpha:1].CGColor);
    CGContextAddArc(context, center.x, center.y, radius, 0.75 * M_PI, 2.25 * M_PI, 0);
    CGContextStrokePath(context);
    CGContextSetStrokeColorWithColor(context, _accentColor.CGColor);
    CGContextAddArc(context, center.x, center.y, radius, 0.75 * M_PI,
                    (0.75 + 1.5 * _normalizedValue) * M_PI, 0);
    CGContextStrokePath(context);
  } else {
    const CGFloat centerX = width * 0.5;
    const CGFloat top = height * 0.08;
    const CGFloat bottom = height * 0.92;
    const CGFloat y = bottom - _normalizedValue * (bottom - top);
    CGContextSetLineWidth(context, std::max<CGFloat>(4, width * 0.12));
    CGContextSetStrokeColorWithColor(context, [UIColor colorWithWhite:0.24 alpha:1].CGColor);
    CGContextMoveToPoint(context, centerX, top);
    CGContextAddLineToPoint(context, centerX, bottom);
    CGContextStrokePath(context);
    CGContextSetStrokeColorWithColor(context, _accentColor.CGColor);
    CGContextMoveToPoint(context, centerX, y);
    CGContextAddLineToPoint(context, centerX, bottom);
    CGContextStrokePath(context);
  }
#endif
}

- (void)touchesBegan:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
  UITouch *touch = touches.anyObject;
  if (!touch) return;
  _touchOrigin = [touch locationInView:self];
  _valueAtTouchOrigin = _normalizedValue;
}

- (void)touchesMoved:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
  UITouch *touch = touches.anyObject;
  if (!touch) return;
  const CGPoint point = [touch locationInView:self];
  const CGFloat height = std::max<CGFloat>(44, CGRectGetHeight(self.bounds));
  const CGFloat delta = (_touchOrigin.y - point.y) / height;
  self.normalizedValue = _valueAtTouchOrigin + delta;
  if (_onValueChanged) _onValueChanged(_normalizedValue);
}

- (void)accessibilityIncrement {
  self.normalizedValue += 0.01;
  if (_onValueChanged) _onValueChanged(_normalizedValue);
}

- (void)accessibilityDecrement {
  self.normalizedValue -= 0.01;
  if (_onValueChanged) _onValueChanged(_normalizedValue);
}

@end
