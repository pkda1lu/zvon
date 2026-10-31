//! Keep monitor coordinates physical: logical desktop coordinates are ambiguous
//! when the source and target monitors have different DPI scales.
#[derive(Debug, PartialEq)]
pub struct Geometry { pub x: i32, pub y: i32, pub width: u32, pub height: u32 }

pub fn placement(x: i32, y: i32, width: u32, height: u32, scale: f64) -> Geometry {
    let scale = if scale.is_finite() && (0.5..=8.0).contains(&scale) { scale } else { 1.0 };
    // Display APIs may briefly report an empty work area during mode changes.
    let width = width.clamp(1, i32::MAX as u32);
    let height = height.clamp(1, i32::MAX as u32);
    let margin_x = ((24.0 * scale).round() as u32).min(width / 8);
    let margin_y = ((32.0 * scale).round() as u32).min(height / 8);
    let available_w = width.saturating_sub(margin_x * 2).max(1);
    let available_h = height.saturating_sub(margin_y * 2).max(1);
    let fit = (480.0 * scale).min(available_w as f64).min(available_h as f64 * 16.0 / 9.0);
    let pip_w = (fit.floor() as u32).clamp(1, available_w);
    let pip_h = ((pip_w as f64 * 9.0 / 16.0).floor() as u32).clamp(1, available_h);
    let clamp = |value: i64| value.clamp(i32::MIN as i64, i32::MAX as i64) as i32;
    Geometry {
        x: clamp(x as i64 + width as i64 - pip_w as i64 - margin_x as i64),
        y: clamp(y as i64 + height as i64 - pip_h as i64 - margin_y as i64),
        width: pip_w, height: pip_h,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn secondary_monitors_and_mixed_dpi() {
        for (x, y, w, h, scale) in [(0,0,1920,1040,1.0),(-2560,0,2560,1400,1.5),(1920,-1440,2560,1440,2.0),(-1200,-1920,1200,1920,1.25)] {
            let p = placement(x,y,w,h,scale);
            assert!(p.x as i64 >= x as i64 && p.y as i64 >= y as i64);
            assert!(p.x as i64 + p.width as i64 <= x as i64 + w as i64);
            assert!(p.y as i64 + p.height as i64 <= y as i64 + h as i64);
            assert_eq!(p.width, (480.0 * scale) as u32);
        }
    }
    #[test] fn invalid_display_data_never_overflows_or_produces_zero_size() {
        for scale in [0.0, -1.0, f64::NAN, f64::INFINITY, 1.0] {
            for (x,y,w,h) in [(0,0,0,0),(i32::MAX,i32::MAX,u32::MAX,u32::MAX),(i32::MIN,i32::MIN,320,200)] {
                let p = placement(x,y,w,h,scale);
                assert!(p.width > 0 && p.height > 0);
                assert!(p.width <= i32::MAX as u32 && p.height <= i32::MAX as u32);
            }
        }
    }
}
