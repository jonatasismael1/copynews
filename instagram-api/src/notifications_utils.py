import re


def safe_error(value: object, limit: int = 240) -> str:
    message = " ".join(str(value or "Erro desconhecido").split())
    message = re.sub(r"(?i)(api[_ -]?key|token|authorization|password|senha)\s*[:=]\s*\S+", r"\1=[oculto]", message)
    message = re.sub(r"https?://[^\s]+", "[url omitida]", message)
    return message[:limit]
