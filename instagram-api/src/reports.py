from __future__ import annotations

from collections import Counter
from datetime import datetime
from statistics import median
from zoneinfo import ZoneInfo

from .config import get_settings
from .notifications_utils import safe_error

settings = get_settings()


def number(value: int | None) -> str:
    return f"{max(0, int(value or 0)):,}".replace(",", ".")


def local_time(value: datetime | None) -> str:
    value = value or datetime.now(ZoneInfo(settings.app_timezone))
    return value.astimezone(ZoneInfo(settings.app_timezone)).strftime("%H:%M")


def duration(run) -> str:
    seconds = max(0, round(((run.finished_at or run.started_at) - run.started_at).total_seconds())) if run.started_at else 0
    return f"{seconds // 60}m {seconds % 60:02d}s" if seconds >= 60 else f"{seconds}s"


def activity(times: list[str]) -> tuple[str, str, str]:
    if not times:
        return "—", "—", "sem postagens"
    ordered = sorted(times)
    hours = Counter(int(value[:2]) for value in ordered)
    starts = range(24)
    start = max(starts, key=lambda hour: (sum(hours[(hour + offset) % 24] for offset in range(3)), -hour))
    return ordered[0], ordered[-1], f"{start:02d}h–{(start + 3) % 24:02d}h"


def _label(username: str) -> str:
    aliases = {
        "francesfmagreste": "Agreste", "francesfmarapiraca": "Arapiraca",
        "francesfmcoruripee": "Coruripe", "francefmdelmiro": "Delmiro",
        "francesfmpenedo": "Penedo", "quilombofm": "Quilombo FM",
    }
    return aliases.get(username.lower(), f"@{username}")


def _ranking(title: str, summaries: list[dict], field: str, suffix: str = "") -> list[str]:
    values = sorted(summaries, key=lambda item: (-int(item.get(field, 0)), item["username"]))
    distinct = sorted({int(item.get(field, 0)) for item in values}, reverse=True)[:3]
    medals = {value: ("🥇", "🥈", "🥉")[index] for index, value in enumerate(distinct)}
    lines = [title]
    for item in values:
        value = int(item.get(field, 0))
        if value not in medals:
            continue
        rendered = number(value) if field == "views_monitored" else str(value)
        lines.append(f"{medals[value]} {_label(item['username'])} — {rendered}{suffix}")
    return lines


def comparison(current, previous) -> tuple[list[str], dict[str, int]]:
    current_contents = {item["key"]: item for item in (current.report_payload or {}).get("contents", [])}
    previous_contents = {item["key"]: item for item in (previous.report_payload or {}).get("contents", [])}
    existing_growth = 0
    new_views = 0
    profile_growth: Counter[str] = Counter()
    profile_new: Counter[str] = Counter()
    for key, item in current_contents.items():
        views = int(item.get("views") or 0)
        if key in previous_contents:
            delta = max(0, views - int(previous_contents[key].get("views") or 0))
            existing_growth += delta
            for username in item.get("profiles", []):
                profile_growth[username] += delta
        else:
            new_views += views
            for username in item.get("profiles", []):
                profile_growth[username] += views
                profile_new[username] += 1
    new_count = len(set(current_contents) - set(previous_contents))
    lines = [
        "🌙 *EVOLUÇÃO DO DIA • 14h → 21h*", "",
        f"📈 Views em conteúdos já existentes: +{number(existing_growth)}",
        f"🆕 Novas publicações após 14h: {new_count}",
        f"👀 Views trazidas por novas publicações: {number(new_views)}", "",
    ]
    if profile_growth:
        best_growth = max(profile_growth.values())
        leaders = ", ".join(_label(name) for name, value in profile_growth.items() if value == best_growth)
        lines.append(f"🚀 Maior crescimento: {leaders} (+{number(best_growth)} views)")
    if profile_new:
        most_new = max(profile_new.values())
        leaders = ", ".join(_label(name) for name, value in profile_new.items() if value == most_new)
        lines.append(f"🗞️ Mais novas publicações: {leaders} ({most_new})")
    return lines, dict(profile_growth)


def build_messages(run, previous=None) -> list[str]:
    if run.status == "error":
        profiles = run.profiles_failed or run.profiles
        scope = f"Perfil: @{profiles[0]}" if len(profiles) == 1 and isinstance(profiles[0], str) else f"Perfis afetados: {len(profiles)}"
        return ["\n".join(["❌ *ERRO NA COLETA DO INSTAGRAM*", "", scope, f"Motivo: {safe_error(run.error)}", f"Horário: {local_time(run.finished_at)}"])]

    summaries = list(run.profile_summaries or [])
    first, last, active = activity(run.posting_times or [])
    title = "📊 *INSTAGRAM • RESUMO DA REDE*"
    summary = "\n".join([
        title, f"📅 {(run.finished_at or run.started_at).astimezone(ZoneInfo(settings.app_timezone)).strftime('%d/%m/%Y')} • Atualização {local_time(run.finished_at)}", "",
        "🧾 *PUBLICAÇÕES*", f"Publicações únicas: {run.posts_found}", f"Aparições nos perfis: {getattr(run, 'profile_appearances', run.posts_found)}",
        f"Reels: {run.reels_count} • Carrosséis: {run.carousels_count} • Posts: {run.posts_count}", "",
        "👀 *AUDIÊNCIA*", f"Views únicas monitoradas: {number(getattr(run, 'unique_views', run.views_monitored))}", "",
        "🤝 *COLLABS*", f"Iniciadas pela rede: {run.collaborations_made}", f"Internas: {getattr(run, 'internal_collaborations', 0)}", f"Externas recebidas: {getattr(run, 'external_collaborations', 0)}", "",
        "⏰ *ATIVIDADE*", f"Primeira postagem: {first}", f"Última postagem: {last}", f"Faixa mais ativa: {active}", "",
        f"Tipo: {'Manual' if run.trigger == 'manual' else 'Automática'}", f"Duração: {duration(run)}", "", "🔄 *COLETA*", f"Novos registros: {run.posts_new} • Atualizados: {run.posts_updated}",
    ])
    ranking = "\n".join(["🏆 *RANKING DO DIA*", "", *_ranking("🗞️ Mais publicações", summaries, "posts_found"), "", *_ranking("👀 Mais views", summaries, "views_monitored"), "", *_ranking("🎬 Mais reels", summaries, "reels_count"), "", *_ranking("🤝 Mais collabs iniciadas", summaries, "collaborations_made")])
    chunks = [summaries[index:index + 3] for index in range(0, len(summaries), 3)]
    profiles = []
    for index, chunk in enumerate(chunks, 1):
        lines = [f"📍 *PERFIS • {index}/{len(chunks)}*"]
        for item in chunk:
            pfirst, plast, _ = activity(item.get("posting_times", []))
            lines.extend(["", f"*{_label(item['username'])}*", f"Publicações: {item['posts_found']} • Reels: {item['reels_count']}", f"Views: {number(item['views_monitored'])}", f"Collabs: {item['collaborations_made']} iniciadas • {item['collaborations_received']} recebidas", f"Horários: {pfirst} → {plast}"])
        profiles.append("\n".join(lines))
    messages = [summary, ranking, *profiles]
    growth = {}
    if previous is not None:
        evolution, growth = comparison(run, previous)
        messages.append("\n".join(evolution))
    attention = []
    for failure in run.profiles_failed or []:
        if isinstance(failure, dict):
            attention.append(f"⚠️ @{failure.get('username')}: {safe_error(failure.get('error'))}")
    for item in (run.report_payload or {}).get("external_collabs", []):
        attention.append(f"🤝 Collab externa: @{item.get('external')} → @{item.get('profile')}")
    volumes = [int(item.get("posts_found", 0)) for item in summaries]
    typical = median(volumes) if volumes else 0
    if typical >= 2:
        for item in summaries:
            if int(item.get("posts_found", 0)) < typical * settings.alert_low_volume_ratio:
                attention.append(f"📉 Volume abaixo do padrão: {_label(item['username'])} ({item.get('posts_found', 0)} publicações)")
    finished = (run.finished_at or run.started_at).astimezone(ZoneInfo(settings.app_timezone))
    for item in summaries:
        times = item.get("posting_times", [])
        if not times:
            attention.append(f"⏳ Sem publicação no período: {_label(item['username'])}")
            continue
        hour, minute = map(int, max(times).split(":"))
        last_minutes = hour * 60 + minute
        current_minutes = finished.hour * 60 + finished.minute
        if current_minutes >= last_minutes and current_minutes - last_minutes >= settings.alert_inactive_hours * 60:
            attention.append(f"⏳ Sem publicar há {int((current_minutes - last_minutes) // 60)}h: {_label(item['username'])}")
    if attention:
        messages.append("\n".join(["⚠️ *PONTOS DE ATENÇÃO*", "", *dict.fromkeys(attention)]))
    return messages
