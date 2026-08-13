from datetime import datetime, timezone
from types import SimpleNamespace

from src.collector import parse_item
from src.notifications import safe_error
from src.reports import build_messages, comparison
from src.post_classification import apply_classification, classify_post_for_profile, empty_profile_summary, validate_profile_summary


def test_parse_real_apidojo_shape_preserves_missing_metrics():
    result = parse_item({"id": "123", "code": "ABC", "createdAt": "2026-08-10T12:30:00.000Z", "likeCount": 17, "commentCount": 4, "owner": {"username": "francesfmagreste"}, "coowners": [{"username": "quilombofm"}]})
    assert result["instagram_id"] == "123" and result["shortcode"] == "ABC"
    assert result["views"] is None and result["collaborators"] == ["quilombofm"]


def test_parse_alternate_apify_fields():
    result = parse_item({"pk": 9, "shortCode": "XYZ", "timestamp": "2026-08-10T12:30:00Z", "ownerUsername": "News", "likesCount": "2", "videoViewCount": 31})
    assert result["owner_username"] == "news" and result["views"] == 31


def test_negative_provider_metrics_are_missing():
    result = parse_item({"id": "1", "shortCode": "ABC", "timestamp": "2026-08-11T01:00:05Z", "likesCount": -1})
    assert result["likes"] is None


def _run(**overrides):
    now = datetime.now(timezone.utc)
    values = dict(status="success", trigger="scheduled", profiles=["one", "two"], profiles_failed=[], posts_found=42, profile_appearances=49, posts_updated=38, posts_new=4, collaborations_made=3, collaborations_received=4, internal_collaborations=2, external_collaborations=1, views_monitored=284320, unique_views=284320, reels_count=10, posts_count=27, carousels_count=5, posting_times=["07:58", "08:28", "19:55"], profile_summaries=[], report_payload={"contents": [], "external_collabs": []}, started_at=now, finished_at=now, error=None)
    values.update(overrides)
    return SimpleNamespace(**values)


def test_report_is_split_and_uses_unique_metrics():
    item = {**empty_profile_summary("one"), "posts_found": 2, "originated_by_profile": 1, "own_without_collab": 1, "received_by_collab": 1, "received_external": 1, "views_monitored": 100, "reels_count": 1, "posts_count": 1, "posting_times": ["08:00"]}
    messages = build_messages(_run(profile_summaries=[item, {**item, "username": "two"}]))
    assert len(messages) == 3
    assert "Publicações únicas: 42" in messages[0]
    assert "Aparições nos perfis: 49" in messages[0]
    assert "Views únicas monitoradas: 284.320" in messages[0]
    assert "RANKING DO DIA" in messages[1] and "PERFIS • 1/1" in messages[2]


def test_evolution_separates_growth_and_new_content():
    previous = _run(report_payload={"contents": [{"key": "a", "views": 100, "profiles": ["one"]}]})
    current = _run(report_payload={"contents": [{"key": "a", "views": 140, "profiles": ["one"]}, {"key": "b", "views": 80, "profiles": ["two"]}]})
    lines, growth = comparison(current, previous)
    rendered = "\n".join(lines)
    assert "conteúdos já existentes: +40" in rendered
    assert "Novas publicações após 14h: 1" in rendered
    assert "Views trazidas por novas publicações: 80" in rendered
    assert growth == {"one": 40, "two": 80}


def test_error_sanitizer_redacts_credentials_and_urls():
    message = safe_error("token=secret failed at https://internal.example/path")
    assert "secret" not in message and "internal.example" not in message


def test_profile_origin_classification_closes_equations():
    monitored = {"agreste", "arapiraca"}
    summary = empty_profile_summary("agreste")
    cases = [
        classify_post_for_profile(owner_username="agreste", coowners=[], profile_username="agreste", monitored_profiles=monitored, media_type="image"),
        classify_post_for_profile(owner_username="agreste", coowners=["arapiraca"], profile_username="agreste", monitored_profiles=monitored, media_type="video"),
        classify_post_for_profile(owner_username="arapiraca", coowners=["agreste"], profile_username="agreste", monitored_profiles=monitored, media_type="carousel"),
        classify_post_for_profile(owner_username="external", coowners=["agreste"], profile_username="agreste", monitored_profiles=monitored, media_type="image"),
    ]
    for case in cases:
        summary["posts_found"] += 1
        apply_classification(summary, case)
    validate_profile_summary(summary)
    assert summary["originated_by_profile"] == 2
    assert summary["received_internal"] == 1 and summary["received_external"] == 1
    assert summary["reels_count"] + summary["posts_count"] + summary["carousels_count"] == 4
