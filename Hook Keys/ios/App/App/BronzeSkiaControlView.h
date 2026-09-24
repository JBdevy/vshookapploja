#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, BronzeSkiaControlKind) {
  BronzeSkiaControlKindKnob = 0,
  BronzeSkiaControlKindFader = 1,
};

/// Superfície pequena e independente para controles de atualização contínua.
/// Quando o framework Skia está presente, o desenho é feito pelo SkCanvas;
/// o fallback Core Graphics existe apenas para o projeto continuar compilando
/// durante a preparação do artefato Skia.xcframework no macOS.
@interface BronzeSkiaControlView : UIView

@property(nonatomic) BronzeSkiaControlKind controlKind;
@property(nonatomic) CGFloat normalizedValue;
@property(nonatomic, strong) UIColor *accentColor;
@property(nonatomic, copy, nullable) void (^onValueChanged)(CGFloat value);

@end

NS_ASSUME_NONNULL_END
