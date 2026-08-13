from src.collector import parse_item
from src.notifications import WhatsAppNotificationService, safe_error
from types import SimpleNamespace
from datetime import datetime, timezone


def test_parse_real_apidojo_shape_preserves_missing_metrics():
    item = {
        "id": "123",
        "code": "ABC",
        "url": "https://www.instagram.com/p/ABC/",
        "createdAt": "2026-08-10T12:30:00.000Z",
        "caption": "Legenda",
        "likeCount": 17,
        "commentCount": 4,
        "owner": {"username": "francesfmagreste"},
        "coowners": [{"username": "quilombofm"}],
    }
    result = parse_item(item)
    assert result["instagram_id"] == "123"
    assert result["shortcode"] == "ABC"
    assert result["likes"] == 17 and result["comments"] == 4
    assert result["views"] is None and result["plays"] is None
    assert result["collaborators"] == ["quilombofm"]


def test_parse_alternate_apify_fields():
    result = parse_item({"pk": 9, "shortCode": "XYZ", "timestamp": "2026-08-10T12:30:00Z", "ownerUsername": "News", "likesCount": "2", "videoViewCount": 31})
    assert result["url"].endswith("/p/XYZ/")
    assert result["owner_username"] == "news"
    assert result["likes"] == 2 and result["views"] == 31


def test_parse_apidojo_flattened_owner_fields():
    result = parse_item({"id": "1", "code": "ABC", "createdAt": "2026-08-11T01:00:05.000Z", "owner.username": "francesfmagreste", "coowners": None})
    assert result["owner_username"] == "francesfmagreste"
    assert result["collaborators"] == []


def test_negative_provider_metrics_are_treated_as_missing():
    result = parse_item({"id": "1", "shortCode": "ABC", "timestamp": "2026-08-11T01:00:05Z", "likesCount": -1, "commentsCount": 2})
    assert result["likes"] is None
    assert result["comments"] == 2


def test_success_message_uses_real_run_values():
    now = datetime.now(timezone.utc)
    run = SimpleNamespace(trigger="scheduled", profiles=["one", "two"], posts_found=42, posts_updated=38, posts_new=4, collaborations_made=3, collaborations_received=4, views_monitored=284320, reels_count=10, posts_count=27, carousels_count=5, posting_times=["07:58", "08:28", "19:55"], started_at=now, finished_at=now)
    message = WhatsAppNotificationService().success_message(run)
    assert "Perfis: 2" in message
    assert "Posts encontrados: 42" in message
    assert "Views monitoradas: 284.320" in message
    assert "Collabs feitas: 3" in message
    assert "Collabs recebidas: 4" in message
    assert "Quantidade de Reels: 10" in message
    assert "Quantidade de Post: 27" in message
    assert "Quantidade de Carrossel: 5" in message
    assert "Horário de postagens: (07:58, 08:28, 19:55)" in message
    assert message.index("Horário de postagens:") < message.index("Tipo:")
    assert "Tipo: Automática" in message


def test_error_sanitizer_redacts_credentials_and_urls():
    message = safe_error("token=secret failed at https://internal.example/path")
    assert "secret" not in message
    assert "internal.example" not in message
