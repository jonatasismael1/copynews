import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from .config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()


@dataclass(frozen=True)
class NotificationResult:
    status: str
    error: str | None = None


def safe_error(value: object, limit: int = 240) -> str:
    message = " ".join(str(value or "Erro desconhecido").split())
    message = re.sub(r"(?i)(api[_ -]?key|token|authorization|password|senha)\s*[:=]\s*\S+", r"\1=[oculto]", message)
    message = re.sub(r"https?://[^\s]+", "[url omitida]", message)
    return message[:limit]


def _number(value: int) -> str:
    return f"{max(0, value):,}".replace(",", ".")


class WhatsAppNotificationService:
    def __init__(self) -> None:
        self.enabled = settings.instagram_whatsapp_alerts_enabled

    def _configured(self) -> bool:
        return bool(settings.evolution_api_url and settings.evolution_api_key and settings.evolution_instance and settings.instagram_alert_phone)

    def _time(self, run) -> str:
        moment = run.finished_at or datetime.now(ZoneInfo(settings.app_timezone))
        return moment.astimezone(ZoneInfo(settings.app_timezone)).strftime("%H:%M")

    def _duration(self, run) -> int:
        if not run.finished_at or not run.started_at:
            return 0
        return max(0, round((run.finished_at - run.started_at).total_seconds()))

    def _scope(self, run, failed: bool = False) -> str:
        profiles = run.profiles_failed if failed and run.profiles_failed else run.profiles
        if len(profiles) == 1:
            return f"Perfil: @{profiles[0]}"
        label = "Perfis afetados" if failed else "Perfis"
        return f"{label}: {len(profiles)}"

    def success_message(self, run) -> str:
        title = "✅ Atualização manual concluída" if run.trigger == "manual" else "✅ Coleta do Instagram concluída"
        return "\n".join([
            title, "", self._scope(run),
            f"Posts encontrados: {run.posts_found}",
            f"Posts atualizados: {run.posts_updated}",
            f"Novos posts: {run.posts_new}",
            f"Collabs encontradas: {run.collaborations_found}",
            f"Views monitoradas: {_number(run.views_monitored)}", "",
            f"Tipo: {'Manual' if run.trigger == 'manual' else 'Automática'}",
            f"Horário: {self._time(run)}", f"Duração: {self._duration(run)}s",
        ])

    def partial_message(self, run) -> str:
        failed = run.profiles_failed or []
        errors = [f"@{item.get('username')}: {safe_error(item.get('error'))}" if isinstance(item, dict) else f"@{item}" for item in failed]
        return "\n".join([
            "⚠️ Coleta do Instagram concluída parcialmente", "",
            f"Perfis processados: {len(run.profiles)}",
            f"Sucesso: {len(run.profiles_succeeded)}", f"Falha: {len(failed)}", "",
            f"Posts encontrados: {run.posts_found}", "", "Perfil com erro:", *errors,
            "", f"Horário: {self._time(run)}",
        ])

    def failure_message(self, run) -> str:
        return "\n".join([
            "❌ Erro na coleta do Instagram", "", self._scope(run, failed=True), "",
            f"Motivo: {safe_error(run.error)}", "", f"Horário: {self._time(run)}",
        ])

    async def send_text(self, message: str) -> NotificationResult:
        if not self.enabled:
            return NotificationResult("disabled")
        if not self._configured():
            return NotificationResult("failed", "Configuração da Evolution API incompleta")
        url = f"{settings.evolution_api_url.rstrip('/')}/message/sendText/{settings.evolution_instance}"
        headers = {"apikey": settings.evolution_api_key, "Content-Type": "application/json"}
        body = {"number": re.sub(r"\D", "", settings.instagram_alert_phone), "text": message}
        last_error = "Falha desconhecida"
        timeout = httpx.Timeout(settings.notification_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(1, max(1, min(settings.notification_max_attempts, 3)) + 1):
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
                if attempt < settings.notification_max_attempts:
                    await asyncio.sleep(attempt)
        return NotificationResult("failed", safe_error(last_error))

    async def send_collection_success(self, run) -> NotificationResult:
        return await self.send_text(self.success_message(run))

    async def send_collection_partial(self, run) -> NotificationResult:
        return await self.send_text(self.partial_message(run))

    async def send_collection_failure(self, run) -> NotificationResult:
        return await self.send_text(self.failure_message(run))

    async def send_test(self) -> NotificationResult:
        return await self.send_text("✅ Teste de notificações do Instagram funcionando.")
