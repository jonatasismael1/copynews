from src.collector import parse_item


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
