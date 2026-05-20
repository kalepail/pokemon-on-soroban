use pokemon_on_soroban::render::compute_viewport;

#[test]
fn test_viewport_centered_on_player() {
    let vp = compute_viewport(
        (100.0, 50.0),
        200.0,
        100.0,
        80,
        40,
    );
    assert!((vp.left - 60.0).abs() < f64::EPSILON);
    assert!((vp.top - 30.0).abs() < f64::EPSILON);
    assert_eq!(vp.width, 80);
    assert_eq!(vp.height, 40);
}

#[test]
fn test_viewport_clamps_at_top_left() {
    let vp = compute_viewport(
        (5.0, 5.0),
        200.0,
        100.0,
        80,
        40,
    );
    assert!((vp.left - 0.0).abs() < f64::EPSILON);
    assert!((vp.top - 0.0).abs() < f64::EPSILON);
}

#[test]
fn test_viewport_clamps_at_bottom_right() {
    let vp = compute_viewport(
        (195.0, 95.0),
        200.0,
        100.0,
        80,
        40,
    );
    assert!((vp.left - 120.0).abs() < f64::EPSILON);
    assert!((vp.top - 60.0).abs() < f64::EPSILON);
}
