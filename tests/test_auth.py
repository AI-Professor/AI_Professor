from fastapi.testclient import TestClient
from main import app
from app.database import SessionLocal

client = TestClient(app)


def test_user_registration():
    # 测试成功注册
    response = client.post("/register", json={
        "email": "test@example.com",
        "password": "Test123!",
        "captcha_id": "valid_id",
        "captcha_text": "correct_text"
    })
    assert response.status_code == 200
    assert "id" in response.json()

    # 测试重复邮箱
    response = client.post("/register", json={
        "email": "test@example.com",
        "password": "Test123!",
        "captcha_id": "valid_id",
        "captcha_text": "correct_text"
    })
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"]
