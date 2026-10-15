import os


def _load_text_verification_threshold() -> float:
    raw_threshold = os.environ.get('TEXT_VERIFICATION_THRESHOLD', '0.5')
    try:
        threshold = float(raw_threshold)
    except ValueError as exc:
        raise ValueError('TEXT_VERIFICATION_THRESHOLD must be a number between 0 and 1.') from exc
    if not 0.0 <= threshold <= 1.0:
        raise ValueError('TEXT_VERIFICATION_THRESHOLD must be a number between 0 and 1.')
    return threshold


TEXT_VERIFICATION_THRESHOLD = _load_text_verification_threshold()
MINIMUM_TEXT_WORDS = 4
