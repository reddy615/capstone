import re


def preprocess_text(text: str) -> str:
    if not isinstance(text, str):
        raise TypeError('Text input must be a string.')

    cleaned = text.lower().strip()
    cleaned = cleaned.replace('&nbsp;', ' ')
    cleaned = re.sub(r'https?://\S+|www\.\S+', ' ', cleaned)
    cleaned = re.sub(r'[^a-z0-9\s]', ' ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned.strip()
