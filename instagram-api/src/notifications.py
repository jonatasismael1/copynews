import asyncio
import logging
import re
from dataclasses import dataclass

import httpx

from .config import get_settings
from .notifications_utils import safe_error

log = logging.getLogger(__name__)
settings = get_settings()


@dataclass(frozen=True)
class NotificationResult:
    status: str
    error: str | None = None


class WhatsAppNotificationService:
    def __init__(self) -> None:
        self.enabled = settings.instagram_whatsapp_alerts_enabled

    def _configured(self) -> bool:
        return bool(settings.evolution_api_url and settings.evolution_api_key and settings.evolution_instance and settings.instagram_alert_phone)

    async def send_text(self, message: str) -> NotificationResult:
        if not self.enabled:
            return NotificationResult("disabled")
        if not self._configured():
            return NotificationResult("failed", "Configuração da Evolution API incompleta")
        url = f"{settings.evolution_api_url.rstrip('/')}/message/sendText/{settings.evolution_instance}"
        headers = {"apikey": settings.evolution_api_key, "Content-Type": "application/json"}
        body = {"number": re.sub(r"\D", "", settings.instagram_alert_phone), "text": message}
        last_error = "Falha desconhecida"
        attempts = max(1, min(settings.notification_max_attempts, 3))
        async with httpx.AsyncClient(timeout=httpx.Timeout(settings.notification_timeout_seconds)) as client:
            for attempt in range(1, attempts + 1):
                try:
                    response = await client.post(url, headers=headers, json=body)
                    if 200 <= response.status_code < 300:
                        log.info("notification sent response_status=%s", response.status_code)
                        return NotificationResult("sent")
                    last_error = f"Evolution API HTTP {response.status_code}"
                    log.warning("notification failed response_status=%s attempt=%s", response.status_code, attempt)
                    if response.status_code < 500 and response.status_code != 429:
                        break
                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    last_error = safe_error(exc)
                    log.warning("notification failed response_status=network_error attempt=%s", attempt)
                if attempt < attempts:
                    await asyncio.sleep(attempt)
        return NotificationResult("failed", safe_error(last_error))

    async def send_messages(self, messages: list[str]) -> NotificationResult:
        if not messages:
            return NotificationResult("disabled")
        errors = []
        sent = 0
        for index, message in enumerate(messages):
            result = await self.send_text(message)
            if result.status == "sent":
                sent += 1
            elif result.status == "disabled":
                return result
            else:
                errors.append(f"bloco {index + 1}: {result.error}")
            if index < len(messages) - 1:
                await asyncio.sleep(max(0, settings.notification_message_delay_seconds))
        return NotificationResult("sent" if not errors else "failed", None if not errors else safe_error("; ".join(errors)))

    async def send_collection_success(self, run, previous=None) -> NotificationResult:
        from .reports import build_messages
        return await self.send_messages(build_messages(run, previous))

    async def send_collection_partial(self, run, previous=None) -> NotificationResult:
        from .reports import build_messages
        return await self.send_messages(build_messages(run, previous))

    async def send_collection_failure(self, run) -> NotificationResult:
        from .reports import build_messages
        return await self.send_messages(build_messages(run))

    async def send_test(self) -> NotificationResult:
        return await self.send_text("✅ Teste de notificações do Instagram funcionando.")


__all__ = ["NotificationResult", "WhatsAppNotificationService", "safe_error"]
